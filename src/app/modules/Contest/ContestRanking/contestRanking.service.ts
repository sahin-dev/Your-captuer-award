import { ContestParticipantStatus, ContestRankingScope } from "../../../../prismaClient";
import type { YCLevel } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";
import { runWithWriteConflictRetry } from "../../../../shared/transactionRetry";
import { ycLevels } from "../../Awards/award.definitions";
import { contestRuleEngine } from "../ContestRules/contestRule.engine";
import { LevelRequirementValue } from "../ContestRules/contestRule.definitions";
import { cache } from "../../../../shared/cache";
import { addVoteWeight, countsForCurrentStint, getSlotScore, VoteSlot } from "../scoring/voteTally";

export const CONTEST_SCORING_VERSION = 2;
const UPDATE_BATCH_SIZE = 25;

// Only ever used for writes that run on their own connection. Fanning queries
// out inside an interactive transaction shares one MongoDB session, which
// makes the write order - and therefore the conflict window - arbitrary.
const updateInBatches = async <T>(items: T[], update: (item: T) => Promise<unknown>, batchSize = UPDATE_BATCH_SIZE) => {
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    await Promise.all(batch.map(update));
  }
};

export type RankedPhoto = {
  photoId: string;
  userPhotoId: string | null;
  participantId: string;
  userId: string;
  score: number;
  // Votes counted with voting power, plus initial and banked votes.
  voteCount: number;
  // How many people voted for the photo in its current stint.
  voterCount: number;
  rank: number;
  createdAt: Date;
  tieBreakKey: string;
};

export type RankedPhotographer = {
  participantId: string;
  userId: string;
  score: number;
  voteCount: number;
  voterCount: number;
  rank: number;
  level: YCLevel;
  createdAt: Date;
  tieBreakKey: string;
};

export type ContestRanking = {
  contestId: string;
  scoringVersion: number;
  photos: RankedPhoto[];
  photographers: RankedPhotographer[];
};

const ycLevelByRuleLevel: Record<LevelRequirementValue["level"], YCLevel> = {
  AMATEUR: ycLevels.AMATEUR,
  TALENTED: ycLevels.TALENTED,
  SUPREME: ycLevels.SUPREME,
  SUPERIOR: ycLevels.SUPERIOR,
  TOP_NOTCH: ycLevels.TOP_NOTCH,
};

export const getContestLevelForScore = (score: number, requirements: LevelRequirementValue[]) => {
  let level: YCLevel = ycLevels.NEW;

  [...requirements]
    .sort((left, right) => left.votes - right.votes)
    .forEach((requirement) => {
      if (score >= requirement.votes) {
        level = ycLevelByRuleLevel[requirement.level];
      }
    });

  return level;
};

const compareByScoreAndTieBreak = <T extends {score: number; createdAt: Date; tieBreakKey: string}>(left: T, right: T) => {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();
  return createdAtDifference || left.tieBreakKey.localeCompare(right.tieBreakKey);
};

// The vote collection of a busy contest does not belong in application memory
// all at once. Votes are streamed in id-ordered pages and folded into per-slot
// counters, so peak memory is one page regardless of how large the contest gets.
const VOTE_SCAN_PAGE_SIZE = 5000;

const scanContestVotes = async (
  contestId: string,
  onVote: (vote: { contestPhotoId: string; photoRefId: string | null; createdAt: Date; power: number }) => void
) => {
  let lastVoteId: string | undefined;

  for (;;) {
    // "id greater than the last one seen" uses the (contestId, id) index directly.
    const page = await prisma.vote.findMany({
      where: { contestId, ...(lastVoteId ? { id: { gt: lastVoteId } } : {}) },
      select: { id: true, contestPhotoId: true, photoRefId: true, createdAt: true, power: true },
      orderBy: { id: "asc" },
      take: VOTE_SCAN_PAGE_SIZE,
    });

    if (page.length === 0) {
      return;
    }
    page.forEach(onVote);
    if (page.length < VOTE_SCAN_PAGE_SIZE) {
      return;
    }
    lastVoteId = page[page.length - 1].id;
  }
};

const computeContestRanking = async (contestId: string): Promise<ContestRanking> => {
  const [contest, participants, levelRequirements] = await Promise.all([
    prisma.contest.findUnique({ where: { id: contestId }, select: { endDate: true } }),
    prisma.contestParticipant.findMany({
      where: { contestId, status: ContestParticipantStatus.ACTIVE },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        photos: {
          where: {
            photoId: { not: null },
          },
          select: {
            id: true,
            photoId: true,
            originalPhotoId: true,
            initialVotes: true,
            bankedVotes: true,
            stintStartedAt: true,
            createdAt: true,
          },
        },
      },
    }),
    contestRuleEngine.getLevelRequirements(contestId),
  ]);

  const slotById = new Map<string, VoteSlot>();
  participants.forEach((participant) => {
    participant.photos.forEach((photo) => slotById.set(photo.id, photo));
  });

  // Voting closes at endDate. Votes are only accepted before it (see
  // assertVotingOpen), so this cut-off keeps the final ranking stable.
  const votingClosesAt = contest?.endDate ?? new Date();
  const voteCountByPhoto = new Map<string, number>();
  const voterCountByPhoto = new Map<string, number>();
  await scanContestVotes(contestId, (vote) => {
    const slot = slotById.get(vote.contestPhotoId);
    if (!slot || vote.createdAt >= votingClosesAt || !countsForCurrentStint(slot, vote)) {
      return;
    }
    voteCountByPhoto.set(vote.contestPhotoId, addVoteWeight(voteCountByPhoto.get(vote.contestPhotoId) || 0, vote));
    voterCountByPhoto.set(vote.contestPhotoId, (voterCountByPhoto.get(vote.contestPhotoId) || 0) + 1);
  });

  const photos = participants
    .flatMap((participant) => participant.photos.map((photo) => {
      const score = getSlotScore(photo, voteCountByPhoto.get(photo.id) || 0);

      return {
        photoId: photo.id,
        userPhotoId: photo.photoId,
        participantId: participant.id,
        userId: participant.userId,
        score,
        voteCount: score,
        voterCount: voterCountByPhoto.get(photo.id) || 0,
        createdAt: photo.createdAt,
        tieBreakKey: photo.id,
      };
    }))
    .sort(compareByScoreAndTieBreak)
    .map((photo, index) => ({ ...photo, rank: index + 1 }));

  const photoScoreByParticipant = new Map<string, number>();
  const photoVoteCountByParticipant = new Map<string, number>();
  const photoVoterCountByParticipant = new Map<string, number>();
  photos.forEach((photo) => {
    photoScoreByParticipant.set(
      photo.participantId,
      (photoScoreByParticipant.get(photo.participantId) || 0) + photo.score
    );
    photoVoteCountByParticipant.set(
      photo.participantId,
      (photoVoteCountByParticipant.get(photo.participantId) || 0) + photo.voteCount
    );
    photoVoterCountByParticipant.set(
      photo.participantId,
      (photoVoterCountByParticipant.get(photo.participantId) || 0) + photo.voterCount
    );
  });

  const photographers = participants
    .filter((participant) => participant.photos.length > 0)
    .map((participant) => {
      const score = photoScoreByParticipant.get(participant.id) || 0;
      const voteCount = photoVoteCountByParticipant.get(participant.id) || 0;
      const voterCount = photoVoterCountByParticipant.get(participant.id) || 0;
      return {
        participantId: participant.id,
        userId: participant.userId,
        score,
        voteCount,
        voterCount,
        level: getContestLevelForScore(score, levelRequirements),
        createdAt: participant.createdAt,
        tieBreakKey: participant.id,
      };
    })
    .sort(compareByScoreAndTieBreak)
    .map((participant, index) => ({ ...participant, rank: index + 1 }));

  return {
    contestId,
    scoringVersion: CONTEST_SCORING_VERSION,
    photos,
    photographers,
  };
};

// A single ranking build reads every participant, photo and vote in the
// contest, and several callers (participant level evaluation, team match
// scoring, vote-count polling, the ranking screen) each used to trigger their
// own build per row they were rendering. Collapsing identical concurrent and
// closely-spaced builds turns those fan-outs back into one scan.
//
// There are two levels because production runs one process per CPU: a memory
// copy per process, and a Redis copy shared by all of them so one build serves
// every process. If Redis is down, each process simply builds its own.
type RankingCacheEntry = { builtAt: number; ranking: ContestRanking };

// Rankings on screen can be this far behind. Votes deliberately do not clear
// the cache: under steady voting it would never be used.
const RANKING_CACHE_TTL_MS = 10000;
const RANKING_CACHE_MAX_ENTRIES = 200;
const SHARED_RANKING_TTL_SECONDS = 15;
const sharedRankingKey = (contestId: string) => `contest:${contestId}:ranking`;
const rankingCache = new Map<string, RankingCacheEntry>();
const rankingBuildsInFlight = new Map<string, Promise<ContestRanking>>();

const rememberRanking = (contestId: string, entry: RankingCacheEntry) => {
  rankingCache.set(contestId, entry);
  while (rankingCache.size > RANKING_CACHE_MAX_ENTRIES) {
    const oldest = rankingCache.keys().next();
    if (oldest.done) break;
    rankingCache.delete(oldest.value);
  }
};

/** Drops any memoized ranking so the next read rebuilds from the database. */
const invalidateContestRanking = (contestId: string) => {
  rankingCache.delete(contestId);
  void cache.del(sharedRankingKey(contestId), { label: "contest-ranking" });
};

// Reuses another process's recent build when there is one, otherwise builds.
const loadOrBuildRanking = async (contestId: string, maxAgeMs: number) => {
  if (maxAgeMs > 0) {
    const shared = await cache.getJson<RankingCacheEntry>(sharedRankingKey(contestId), { label: "contest-ranking" });
    if (shared && Date.now() - shared.builtAt <= maxAgeMs) {
      return shared;
    }
  }

  const entry = { builtAt: Date.now(), ranking: await computeContestRanking(contestId) };
  await cache.setJson(sharedRankingKey(contestId), entry, SHARED_RANKING_TTL_SECONDS, { label: "contest-ranking" });
  return entry;
};

/**
 * `maxAgeMs` is how stale a ranking this caller tolerates. Read paths take the
 * default; anything that decides money, awards or final placement passes 0 to
 * force a fresh scan and bypass in-flight builds started before its own freeze.
 */
const buildContestRanking = async (
  contestId: string,
  options?: { maxAgeMs?: number }
): Promise<ContestRanking> => {
  const maxAgeMs = options?.maxAgeMs ?? RANKING_CACHE_TTL_MS;

  if (maxAgeMs > 0) {
    const cached = rankingCache.get(contestId);
    if (cached && Date.now() - cached.builtAt <= maxAgeMs) {
      return cached.ranking;
    }
    const pending = rankingBuildsInFlight.get(contestId);
    if (pending) {
      return pending;
    }
  } else {
    rankingCache.delete(contestId);
  }

  const build = loadOrBuildRanking(contestId, maxAgeMs)
    .then((entry) => {
      rememberRanking(contestId, entry);
      return entry.ranking;
    })
    .finally(() => {
      if (rankingBuildsInFlight.get(contestId) === build) {
        rankingBuildsInFlight.delete(contestId);
      }
    });
  rankingBuildsInFlight.set(contestId, build);

  return build;
};

const persistContestRanking = async (ranking: ContestRanking) => {
  const photoResults = ranking.photos.map((photo) => ({
    resultKey: `${ranking.contestId}:PHOTO:${photo.photoId}`,
    contestId: ranking.contestId,
    scope: ContestRankingScope.PHOTO,
    participantId: photo.participantId,
    photoId: photo.photoId,
    score: photo.score,
    rank: photo.rank,
    tieBreakKey: `${photo.createdAt.toISOString()}:${photo.tieBreakKey}`,
    scoringVersion: ranking.scoringVersion,
  }));
  const photographerResults = ranking.photographers.map((photographer) => ({
    resultKey: `${ranking.contestId}:PHOTOGRAPHER:${photographer.participantId}`,
    contestId: ranking.contestId,
    scope: ContestRankingScope.PHOTOGRAPHER,
    participantId: photographer.participantId,
    score: photographer.score,
    rank: photographer.rank,
    level: photographer.level,
    tieBreakKey: `${photographer.createdAt.toISOString()}:${photographer.tieBreakKey}`,
    scoringVersion: ranking.scoringVersion,
  }));

  // Only the snapshot swap has to be atomic - readers must never see a
  // half-replaced leaderboard. Keeping it to this one collection keeps the
  // transaction short and out of the way of anything a live contest writes.
  await runWithWriteConflictRetry(
    () => prisma.$transaction(
      async (tx) => {
        await tx.contestRankingResult.deleteMany({ where: { contestId: ranking.contestId } });
        if (photoResults.length + photographerResults.length > 0) {
          await tx.contestRankingResult.createMany({ data: [...photoResults, ...photographerResults] });
        }
      },
      { timeout: 30000, maxWait: 30000 }
    ),
    { label: `contest ranking snapshot ${ranking.contestId}` }
  );

  // rank/level on ContestParticipant and ContestPhoto are denormalized copies
  // of the snapshot above, so they deliberately stay outside the transaction.
  // Post-vote level evaluation, exposure decay and promotion sweeps write the
  // same documents; inside a transaction any one of them aborts the entire
  // finalization with a write conflict, while these single-document writes
  // just retry. updateMany (not update) so a participant or photo removed
  // between the scan and the write is a no-op instead of a P2025 crash.
  await updateInBatches(ranking.photographers, (photographer) =>
    runWithWriteConflictRetry(
      () => prisma.contestParticipant.updateMany({
        where: { id: photographer.participantId },
        data: { rank: photographer.rank, level: photographer.level },
      }),
      { label: `participant rank ${photographer.participantId}` }
    ));

  await updateInBatches(ranking.photos, (photo) =>
    runWithWriteConflictRetry(
      () => prisma.contestPhoto.updateMany({
        where: { id: photo.photoId },
        data: { rank: photo.rank },
      }),
      { label: `photo rank ${photo.photoId}` }
    ));
};

const getPersistedContestRanking = async (contestId: string, scope: ContestRankingScope) => {
  return prisma.contestRankingResult.findMany({
    where: { contestId, scope },
    orderBy: { rank: "asc" },
  });
};

export const contestRankingService = {
  buildContestRanking,
  invalidateContestRanking,
  persistContestRanking,
  getPersistedContestRanking,
};
