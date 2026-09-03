import {
  AchievementKind,
  AwardTarget,
  AwardType,
  ContestFinalizationStatus,
  ContestGrantStatus,
  ContestLevelBadge,
  ContestStatus,
} from "../../../../prismaClient";
import type { PrizeType, YCLevel } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";
import ApiError from "../../../../errors/ApiError";
import httpStatus from "http-status";
import {
  ContestLevelBadgeValue,
  prizeTypes,
  contestLevelBadges,
  ycLevels,
  getAwardSlotKey,
  getContestLevelOrder,
  getRankBandLowerBound,
  normalizeAwardIdentity,
} from "../../Awards/award.definitions";
import { levelService } from "../../Level/level.service";
import { ContestRanking, contestRankingService } from "../ContestRanking/contestRanking.service";
import { notificationOrchestrator } from "../../Notification/notificationOrchestrator";

type AwardConfig = {
  id: string;
  category: PrizeType;
  type: AwardType | null;
  target: AwardTarget | null;
  rankLimit: number | null;
  slotKey?: string | null;
  key: number;
  boost: number;
  swap: number;
  coin: number;
};

type GrantCandidate = {
  grantKey: string;
  contestId: string;
  contestAwardId?: string;
  participantId: string;
  userId: string;
  photoId?: string;
  category: PrizeType;
  kind: AchievementKind;
  type?: AwardType;
  target?: AwardTarget;
  rankLimit?: number;
  levelBadge?: ContestLevelBadgeValue;
  levelOrder?: number;
  rank?: number;
  keyReward: number;
  boostReward: number;
  swapReward: number;
  coinReward: number;
};

type AwardSelection = {
  slotKey: string;
  photoId: string;
};

const FINALIZATION_LEASE_MS = 15 * 60 * 1000;

const levelAchievementByYCLevel: Partial<Record<YCLevel, {category: PrizeType; badge: ContestLevelBadgeValue}>> = {
  [ycLevels.AMATEUR]: { category: prizeTypes.AMATEUR, badge: contestLevelBadges.AMATEUR },
  [ycLevels.TALENTED]: { category: prizeTypes.TALENTED, badge: contestLevelBadges.TALENTED },
  [ycLevels.SUPREME]: { category: prizeTypes.SUPREME, badge: contestLevelBadges.SUPREME },
  [ycLevels.SUPERIOR]: { category: prizeTypes.SUPERIOR, badge: contestLevelBadges.SUPERIOR },
  [ycLevels.TOP_NOTCH]: { category: prizeTypes.TOP_NOTCH, badge: contestLevelBadges.TOP_NOTCH },
};

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const humanizeEnumValue = (value: string) =>
  value.split("_").map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(" ");

const notifyGrantRecipients = async (grants: { userId: string; kind: AchievementKind; category: PrizeType; levelBadge: string | null; keyReward: number; boostReward: number; swapReward: number; coinReward: number }[]) => {
  for (const grant of grants) {
    const prizeParts: string[] = [];
    if (grant.keyReward > 0) prizeParts.push(`${grant.keyReward} promote${grant.keyReward > 1 ? "s" : ""}`);
    if (grant.boostReward > 0) prizeParts.push(`${grant.boostReward} charge${grant.boostReward > 1 ? "s" : ""}`);
    if (grant.swapReward > 0) prizeParts.push(`${grant.swapReward} trade${grant.swapReward > 1 ? "s" : ""}`);
    if (grant.coinReward > 0) prizeParts.push(`${grant.coinReward} coin${grant.coinReward > 1 ? "s" : ""}`);
    const prizeText = prizeParts.length > 0 ? prizeParts.join(", ") : "a new achievement";

    const achievementTitle = grant.kind === AchievementKind.CONTEST_LEVEL && grant.levelBadge
      ? `${humanizeEnumValue(grant.levelBadge)} Level`
      : `${humanizeEnumValue(grant.category)} Award`;

    await notificationOrchestrator.notifyAchievementUnlocked(grant.userId, achievementTitle, prizeText);
  }
};

const notifyContestParticipants = async (contestName: string, ranking: ContestRanking) => {
  for (const photographer of ranking.photographers) {
    await notificationOrchestrator.notifyContestEnded(
      photographer.userId,
      contestName,
      photographer.rank,
      ranking.photographers.length,
    );
  }
};

const claimFinalization = async (contestId: string) => {
  const existing = await prisma.contestFinalization.upsert({
    where: { contestId },
    update: {},
    create: { contestId },
  });

  if (existing.status === ContestFinalizationStatus.COMPLETED) {
    return false;
  }

  const staleBefore = new Date(Date.now() - FINALIZATION_LEASE_MS);
  const claimed = await prisma.contestFinalization.updateMany({
    where: {
      contestId,
      OR: [
        { status: { in: [ContestFinalizationStatus.PENDING, ContestFinalizationStatus.FAILED] } },
        { status: ContestFinalizationStatus.RUNNING, startedAt: { lte: staleBefore } },
      ],
    },
    data: {
      status: ContestFinalizationStatus.RUNNING,
      startedAt: new Date(),
      completedAt: null,
      error: null,
      attemptCount: { increment: 1 },
    },
  });

  return claimed.count === 1;
};

const loadAwardConfigs = async (contestId: string): Promise<AwardConfig[]> => {
  const configs = await prisma.contestAward.findMany({ where: { contestId, enabled: true } });

  const normalized = configs.map((config) => {
    const identity = normalizeAwardIdentity(config);
    const savedSlotKey = "slotKey" in config && typeof config.slotKey === "string"
      ? config.slotKey
      : null;
    return {
      ...config,
      ...identity,
      slotKey: savedSlotKey || getAwardSlotKey(identity),
    };
  });

  const slots = normalized.map((award) => award.slotKey);
  if (new Set(slots).size !== slots.length) {
    throw new Error("Contest has more than one configured award for the same award type and target");
  }

  return normalized;
};

const awardRecipients = (award: AwardConfig, ranking: ContestRanking, selections: AwardSelection[]) => {
  const identity = normalizeAwardIdentity(award);

  if (identity.type === AwardType.TOP_RANK) {
    const rankLimit = identity.rankLimit || 0;
    const lowerBound = getRankBandLowerBound(rankLimit);
    return identity.target === AwardTarget.PHOTO
      ? ranking.photos.filter((photo) => photo.rank >= lowerBound && photo.rank <= rankLimit)
      : ranking.photographers.filter((photographer) => photographer.rank >= lowerBound && photographer.rank <= rankLimit);
  }

  if (identity.type === AwardType.TOP_PHOTO) {
    return ranking.photos.slice(0, 1);
  }

  return ranking.photographers.slice(0, 1);
};

const buildAwardGrants = (
  contestId: string,
  awards: AwardConfig[],
  ranking: ContestRanking,
  selections: AwardSelection[]
): GrantCandidate[] => {
  return awards.flatMap((award) => {
    const identity = normalizeAwardIdentity(award);
    const slotKey = award.slotKey || getAwardSlotKey(identity);

    return awardRecipients(award, ranking, selections).map((recipient) => {
      const isPhotoRecipient = "photoId" in recipient;
      const recipientKey = isPhotoRecipient ? recipient.photoId : recipient.participantId;

      return {
        grantKey: `${contestId}:AWARD:${slotKey}:${recipientKey}`,
        contestId,
        contestAwardId: award.id,
        participantId: recipient.participantId,
        userId: recipient.userId,
        ...(isPhotoRecipient && { photoId: recipient.photoId }),
        category: identity.category,
        kind: AchievementKind.CONTEST_AWARD,
        type: identity.type,
        target: identity.target,
        ...(identity.rankLimit && { rankLimit: identity.rankLimit }),
        rank: recipient.rank,
        keyReward: award.key,
        boostReward: award.boost,
        swapReward: award.swap,
        coinReward: award.coin,
      };
    });
  });
};

type LevelAwardConfig = {
  level: ContestLevelBadge;
  boost: number;
  swap: number;
  key: number;
  coin: number;
};

// Contest level rewards are optional - admins configure a payout for reaching Amateur/Talented/
// Supreme/Superior/Top Notch, or configure nothing at all, in which case leveling up in a contest
// remains a badge-only achievement (rewardByLevel lookup misses and every reward stays 0), exactly
// matching the pre-existing behavior before this feature existed.
const buildLevelGrants = (
  contestId: string,
  ranking: ContestRanking,
  levelAwards: LevelAwardConfig[]
): GrantCandidate[] => {
  const rewardByLevel = new Map(levelAwards.map((award) => [award.level, award]));

  return ranking.photographers.flatMap((photographer) => {
    const levelAchievement = levelAchievementByYCLevel[photographer.level];
    if (!levelAchievement) {
      return [];
    }

    const levelOrder = getContestLevelOrder(levelAchievement.category);
    if (!levelOrder) {
      return [];
    }

    const reward = rewardByLevel.get(levelAchievement.badge);

    return [{
      grantKey: `${contestId}:LEVEL:${photographer.participantId}`,
      contestId,
      participantId: photographer.participantId,
      userId: photographer.userId,
      category: levelAchievement.category,
      kind: AchievementKind.CONTEST_LEVEL,
      levelBadge: levelAchievement.badge,
      levelOrder,
      rank: photographer.rank,
      keyReward: reward?.key ?? 0,
      boostReward: reward?.boost ?? 0,
      swapReward: reward?.swap ?? 0,
      coinReward: reward?.coin ?? 0,
    }];
  });
};

const ensureGrant = async (candidate: GrantCandidate) => {
  return prisma.contestAwardGrant.upsert({
    where: { grantKey: candidate.grantKey },
    update: {},
    create: candidate,
  });
};

const processGrant = async (grantId: string) => {
  const staleBefore = new Date(Date.now() - FINALIZATION_LEASE_MS);
  const claimed = await prisma.contestAwardGrant.updateMany({
    where: {
      id: grantId,
      OR: [
        { status: { in: [ContestGrantStatus.PENDING, ContestGrantStatus.FAILED] } },
        { status: ContestGrantStatus.PROCESSING, updatedAt: { lte: staleBefore } },
      ],
    },
    data: { status: ContestGrantStatus.PROCESSING, error: null },
  });

  if (claimed.count !== 1) {
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const grant = await tx.contestAwardGrant.findUniqueOrThrow({ where: { id: grantId } });

      if (grant.kind === AchievementKind.CONTEST_LEVEL) {
        await tx.contestAchievement.deleteMany({
          where: {
            participantId: grant.participantId,
            contestId: grant.contestId,
            OR: [
              { kind: AchievementKind.CONTEST_LEVEL },
              { category: { in: [prizeTypes.AMATEUR, prizeTypes.TALENTED, prizeTypes.SUPREME, prizeTypes.SUPERIOR, prizeTypes.TOP_NOTCH] } },
            ],
          },
        });
      }

      const existingAchievement = await tx.contestAchievement.findFirst({
        where: { grantKey: grant.grantKey },
      });
      if (!existingAchievement) {
        await tx.contestAchievement.create({
          data: {
            participantId: grant.participantId,
            contestId: grant.contestId,
            category: grant.category,
            kind: grant.kind,
            type: grant.type,
            target: grant.target,
            rankLimit: grant.rankLimit,
            levelBadge: grant.levelBadge,
            levelOrder: grant.levelOrder,
            photoId: grant.photoId,
            grantKey: grant.grantKey,
          },
        });
      }

      const hasReward = grant.keyReward > 0 || grant.boostReward > 0 || grant.swapReward > 0 || grant.coinReward > 0;
      if (hasReward) {
        const rewardTransaction = await tx.contestRewardTransaction.findUnique({ where: { grantId: grant.id } });
        if (!rewardTransaction) {
          await tx.contestRewardTransaction.create({
            data: {
              grantId: grant.id,
              userId: grant.userId,
              key: grant.keyReward,
              boost: grant.boostReward,
              swap: grant.swapReward,
              coin: grant.coinReward,
            },
          });
          await tx.userStore.upsert({
            where: { userId: grant.userId },
            create: {
              userId: grant.userId,
              key: grant.keyReward,
              boost: grant.boostReward,
              swap: grant.swapReward,
              coins: grant.coinReward,
            },
            update: {
              key: { increment: grant.keyReward },
              boost: { increment: grant.boostReward },
              swap: { increment: grant.swapReward },
              coins: { increment: grant.coinReward },
            },
          });
        }
      }

      await tx.contestAwardGrant.update({
        where: { id: grant.id },
        data: { status: ContestGrantStatus.COMPLETED, processedAt: new Date(), error: null },
      });
    });
  } catch (error) {
    await prisma.contestAwardGrant.update({
      where: { id: grantId },
      data: { status: ContestGrantStatus.FAILED, error: getErrorMessage(error) },
    });
    throw error;
  }
};

const finalizeContest = async (contestId: string) => {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    throw new Error("Contest not found");
  }

  if (contest.status === ContestStatus.COMPLETED) {
    return prisma.contestFinalization.findUnique({ where: { contestId } });
  }

  if (contest.endDate.getTime() > Date.now()) {
    throw new Error("Contest cannot be finalized before its end date");
  }

  const claimed = await claimFinalization(contestId);
  if (!claimed) {
    return prisma.contestFinalization.findUnique({ where: { contestId } });
  }

  await prisma.contest.update({
    where: { id: contestId },
    data: { status: ContestStatus.FINALIZING, endedAt: contest.endedAt || new Date() },
  });

  try {
    const [ranking, awards, selections, levelAwards] = await Promise.all([
      contestRankingService.buildContestRanking(contestId),
      loadAwardConfigs(contestId),
      prisma.contestAwardSelection.findMany({
        where: { contestId },
        select: { slotKey: true, photoId: true },
      }),
      prisma.contestLevelAward.findMany({ where: { contestId } }),
    ]);

    await prisma.$transaction(
      (tx) => contestRankingService.persistContestRanking(tx, ranking),
      { timeout: 30000, maxWait: 30000 }
    );

    const candidates = [
      ...buildAwardGrants(contestId, awards, ranking, selections),
      ...buildLevelGrants(contestId, ranking, levelAwards),
    ];
    const grants:Awaited<ReturnType<typeof ensureGrant>>[] = [];
    for (const candidate of candidates) {
      grants.push(await ensureGrant(candidate));
    }
    for (const grant of grants) {
      await processGrant(grant.id);
    }
    const incompleteGrantCount = await prisma.contestAwardGrant.count({
      where: {
        id: { in: grants.map((grant) => grant.id) },
        status: { not: ContestGrantStatus.COMPLETED },
      },
    });
    if (incompleteGrantCount > 0) {
      throw new Error(`${incompleteGrantCount} contest award grants are still incomplete`);
    }

    for (const photographer of ranking.photographers) {
      await levelService.evaluateAndUpdateUserLevel(photographer.userId);
    }

    const completedAt = new Date();
    await prisma.$transaction([
      prisma.contest.update({
        where: { id: contestId },
        data: { status: ContestStatus.COMPLETED, finalizedAt: completedAt },
      }),
      prisma.contestFinalization.update({
        where: { contestId },
        data: {
          status: ContestFinalizationStatus.COMPLETED,
          scoringVersion: ranking.scoringVersion,
          completedAt,
          error: null,
        },
      }),
    ]);

    await notifyGrantRecipients(grants);
    await notifyContestParticipants(contest.title, ranking);

    return prisma.contestFinalization.findUnique({ where: { contestId } });
  } catch (error) {
    const message = getErrorMessage(error);
    await prisma.$transaction([
      prisma.contest.update({
        where: { id: contestId },
        data: { status: ContestStatus.FINALIZATION_FAILED },
      }),
      prisma.contestFinalization.update({
        where: { contestId },
        data: { status: ContestFinalizationStatus.FAILED, error: message },
      }),
    ]);
    throw error;
  }
};

const getContestAwardResults = async (contestId: string) => {
  return prisma.contestAwardGrant.findMany({
    where: {
      contestId,
      kind: AchievementKind.CONTEST_AWARD,
      status: ContestGrantStatus.COMPLETED,
    },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
  });
};

const selectAwardPhoto = async (
  contestId: string,
  contestAwardId: string,
  photoId: string,
  selectedById: string
) => {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contest not found");
  }
  if (contest.status === ContestStatus.COMPLETED || contest.status === ContestStatus.FINALIZING) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Award selections cannot be changed after finalization has started");
  }

  const award = await prisma.contestAward.findFirst({
    where: { id: contestAwardId, contestId, enabled: true },
  });
  if (!award) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contest award not found");
  }

  const identity = normalizeAwardIdentity(award);
  if (identity.type !== AwardType.TOP_PHOTO && identity.type !== AwardType.TOP_PHOTOGRAPHER) {
    throw new ApiError(httpStatus.BAD_REQUEST, "This award type does not support manual photo selection");
  }

  const photo = await prisma.contestPhoto.findFirst({
    where: { id: photoId, contestId, participant: { status: "ACTIVE" } },
    select: { id: true, participantId: true },
  });
  if (!photo) {
    throw new ApiError(httpStatus.BAD_REQUEST, "An active contest photo is required for this award");
  }

  const slotKey = award.slotKey || getAwardSlotKey(identity);
  const selectionKey = `${contestId}:${slotKey}`;
  return prisma.contestAwardSelection.upsert({
    where: { selectionKey },
    update: {
      contestAwardId: award.id,
      photoId: photo.id,
      participantId: photo.participantId,
      selectedById,
    },
    create: {
      selectionKey,
      contestId,
      contestAwardId: award.id,
      slotKey,
      photoId: photo.id,
      participantId: photo.participantId,
      selectedById,
    },
  });
};

const getContestAwardSelections = async (contestId: string) => {
  return prisma.contestAwardSelection.findMany({
    where: { contestId },
    orderBy: { createdAt: "asc" },
  });
};

export const contestFinalizationService = {
  finalizeContest,
  getContestAwardResults,
  selectAwardPhoto,
  getContestAwardSelections,
};
