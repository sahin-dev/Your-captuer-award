import { ContestParticipantStatus, ContestRankingScope } from "../../../../prismaClient";
import type { Prisma, YCLevel } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";
import { ycLevels } from "../../Awards/award.definitions";
import { contestRuleEngine } from "../ContestRules/contestRule.engine";
import { LevelRequirementValue } from "../ContestRules/contestRule.definitions";

export const CONTEST_SCORING_VERSION = 2;
const UPDATE_BATCH_SIZE = 25;

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
  voteCount: number;
  rank: number;
  createdAt: Date;
  tieBreakKey: string;
};

export type RankedPhotographer = {
  participantId: string;
  userId: string;
  score: number;
  voteCount: number;
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
  onVote: (vote: { contestPhotoId: string; photoRefId: string | null; createdAt: Date }) => void
) => {
  let cursor: string | undefined;

  for (;;) {
    const page = await prisma.vote.findMany({
      where: { contestId },
      select: { id: true, contestPhotoId: true, photoRefId: true, createdAt: true },
      orderBy: { id: "asc" },
      take: VOTE_SCAN_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (page.length === 0) {
      return;
    }
    page.forEach(onVote);
    if (page.length < VOTE_SCAN_PAGE_SIZE) {
      return;
    }
    cursor = page[page.length - 1].id;
  }
};

const computeContestRanking = async (contestId: string): Promise<ContestRanking> => {
  const [participants, levelRequirements] = await Promise.all([
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

  // The image currently occupying each contest-photo slot, and when its current
  // stint started - a vote only counts toward a photo's score if it was cast
  // while that same image was live there AND on/after the stint start, so a
  // trade always starts the new photo's live count at zero even if the exact
  // same photo is later re-selected into this same slot. Any votes from an
  // earlier stint are instead captured in bankedVotes (see
  // ContestPhotoTradeRecord / contest.service.ts tradePhoto).
  const currentPhotoIdBySlot = new Map<string, string | null>();
  const stintStartedAtBySlot = new Map<string, Date>();
  participants.forEach((participant) => {
    participant.photos.forEach((photo) => {
      currentPhotoIdBySlot.set(photo.id, photo.photoId);
      stintStartedAtBySlot.set(photo.id, photo.stintStartedAt ?? photo.createdAt);
    });
  });

  const voteCountByPhoto = new Map<string, number>();
  await scanContestVotes(contestId, (vote) => {
    const liveImage = currentPhotoIdBySlot.get(vote.contestPhotoId);
    // A null photoRefId is a legacy vote cast before swap-tracking existed -
    // treat it as belonging to whichever photo is live now.
    if (vote.photoRefId !== null && vote.photoRefId !== liveImage) {
      return;
    }
    const stintStartedAt = stintStartedAtBySlot.get(vote.contestPhotoId);
    if (stintStartedAt && vote.createdAt < stintStartedAt) {
      return;
    }
    voteCountByPhoto.set(vote.contestPhotoId, (voteCountByPhoto.get(vote.contestPhotoId) || 0) + 1);
  });

  const photos = participants
    .flatMap((participant) => participant.photos.map((photo) => {
      // initialVotes is a baseline for the photo this slot originally launched
      // with - it shouldn't follow a later swapped-in photo.
      const stillOriginalPhoto = !photo.originalPhotoId || photo.originalPhotoId === photo.photoId;
      const initialVotes = stillOriginalPhoto ? (photo.initialVotes || 0) : 0;
      const bankedVotes = photo.bankedVotes || 0;

      return {
        photoId: photo.id,
        userPhotoId: photo.photoId,
        participantId: participant.id,
        userId: participant.userId,
        score: (voteCountByPhoto.get(photo.id) || 0) + initialVotes + bankedVotes,
        voteCount: (voteCountByPhoto.get(photo.id) || 0) + initialVotes + bankedVotes,
        createdAt: photo.createdAt,
        tieBreakKey: photo.id,
      };
    }))
    .sort(compareByScoreAndTieBreak)
    .map((photo, index) => ({ ...photo, rank: index + 1 }));

  const photoScoreByParticipant = new Map<string, number>();
  const photoVoteCountByParticipant = new Map<string, number>();
  photos.forEach((photo) => {
    photoScoreByParticipant.set(
      photo.participantId,
      (photoScoreByParticipant.get(photo.participantId) || 0) + photo.score
    );
    photoVoteCountByParticipant.set(
      photo.participantId,
      (photoVoteCountByParticipant.get(photo.participantId) || 0) + photo.voteCount
    );
  });

  const photographers = participants
    .filter((participant) => participant.photos.length > 0)
    .map((participant) => {
      const score = photoScoreByParticipant.get(participant.id) || 0;
      const voteCount = photoVoteCountByParticipant.get(participant.id) || 0;
      return {
        participantId: participant.id,
        userId: participant.userId,
        score,
        voteCount,
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
type RankingCacheEntry = { builtAt: number; ranking: ContestRanking };

const RANKING_CACHE_TTL_MS = 3000;
const RANKING_CACHE_MAX_ENTRIES = 200;
const rankingCache = new Map<string, RankingCacheEntry>();
const rankingBuildsInFlight = new Map<string, Promise<ContestRanking>>();

const rememberRanking = (contestId: string, ranking: ContestRanking) => {
  rankingCache.set(contestId, { builtAt: Date.now(), ranking });
  while (rankingCache.size > RANKING_CACHE_MAX_ENTRIES) {
    const oldest = rankingCache.keys().next();
    if (oldest.done) break;
    rankingCache.delete(oldest.value);
  }
};

/** Drops any memoized ranking so the next read rebuilds from the database. */
const invalidateContestRanking = (contestId: string) => {
  rankingCache.delete(contestId);
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

  const build = computeContestRanking(contestId)
    .then((ranking) => {
      rememberRanking(contestId, ranking);
      return ranking;
    })
    .finally(() => {
      if (rankingBuildsInFlight.get(contestId) === build) {
        rankingBuildsInFlight.delete(contestId);
      }
    });
  rankingBuildsInFlight.set(contestId, build);

  return build;
};

const persistContestRanking = async (tx: Prisma.TransactionClient, ranking: ContestRanking) => {
  await tx.contestRankingResult.deleteMany({ where: { contestId: ranking.contestId } });

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

  if (photoResults.length + photographerResults.length > 0) {
    await tx.contestRankingResult.createMany({ data: [...photoResults, ...photographerResults] });
  }

  await updateInBatches(ranking.photographers, async (photographer) => {
    await tx.contestParticipant.update({
      where: { id: photographer.participantId },
      data: { rank: photographer.rank, level: photographer.level },
    });
  });

  await updateInBatches(ranking.photos, async (photo) => {
    await tx.contestPhoto.update({
      where: { id: photo.photoId },
      data: { rank: photo.rank },
    });
  });
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
