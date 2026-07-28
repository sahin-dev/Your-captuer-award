import {
  AwardTarget,
  AwardType,
  ContestLevelBadge,
  PrizeType,
} from "../../../prismaClient";

export type AwardIdentityInput = {
  category?: PrizeType | null;
  type?: AwardType | null;
  target?: AwardTarget | null;
  rankLimit?: number | null;
};

export type AwardIdentity = {
  category: PrizeType;
  type: AwardType;
  target: AwardTarget;
  rankLimit: number | null;
};

const topRankCategoryByLimit: Record<number, PrizeType> = {
  10: PrizeType.TOP_10,
  20: PrizeType.TOP_20,
  50: PrizeType.TOP_50,
  100: PrizeType.TOP_100,
};

const topRankLimitByCategory: Partial<Record<PrizeType, number>> = {
  [PrizeType.TOP_10]: 10,
  [PrizeType.TOP_20]: 20,
  [PrizeType.TOP_50]: 50,
  [PrizeType.TOP_100]: 100,
};

const levelBadgeByPrizeType: Partial<Record<PrizeType, ContestLevelBadge>> = {
  [PrizeType.AMATEUR]: ContestLevelBadge.AMATEUR,
  [PrizeType.TALENTED]: ContestLevelBadge.TALENTED,
  [PrizeType.SUPREME]: ContestLevelBadge.SUPREME,
  [PrizeType.SUPERIOR]: ContestLevelBadge.SUPERIOR,
  [PrizeType.TOP_NOTCH]: ContestLevelBadge.TOP_NOTCH,
};

export const contestLevelBadgeOrder: Record<ContestLevelBadge, number> = {
  [ContestLevelBadge.AMATEUR]: 1,
  [ContestLevelBadge.TALENTED]: 2,
  [ContestLevelBadge.SUPREME]: 3,
  [ContestLevelBadge.SUPERIOR]: 4,
  [ContestLevelBadge.TOP_NOTCH]: 5,
};

export const contestLevelPrizeTypes = Object.keys(levelBadgeByPrizeType) as PrizeType[];

export const isContestLevelPrizeType = (category?: PrizeType | null) => {
  return Boolean(category && levelBadgeByPrizeType[category]);
};

export const isContestPrizeCategory = (category?: PrizeType | null) => {
  return Boolean(category && !isContestLevelPrizeType(category));
};

export const getContestLevelBadge = (category: PrizeType) => {
  return levelBadgeByPrizeType[category] || null;
};

export const getContestLevelOrder = (category: PrizeType) => {
  const badge = getContestLevelBadge(category);
  return badge ? contestLevelBadgeOrder[badge] : null;
};

const categoryFromAward = (type: AwardType, rankLimit: number | null) => {
  if (type === AwardType.TOP_RANK) {
    if (!rankLimit || !topRankCategoryByLimit[rankLimit]) {
      throw new Error("TOP_RANK awards require rankLimit 10, 20, 50, or 100");
    }

    return topRankCategoryByLimit[rankLimit];
  }

  const categoryMap: Record<Exclude<AwardType, "TOP_RANK">, PrizeType> = {
    [AwardType.TOP_PHOTO]: PrizeType.TOP_PHOTO,
    [AwardType.TOP_PHOTOGRAPHER]: PrizeType.TOP_PHOTOGRAPHER,
    [AwardType.WINNER]: PrizeType.WINNER,
    [AwardType.YC_PICK]: PrizeType.YC_PICK,
  };

  return categoryMap[type as Exclude<AwardType, "TOP_RANK">];
};

const defaultTargetForType = (type: AwardType) => {
  if (type === AwardType.TOP_PHOTO || type === AwardType.YC_PICK) {
    return AwardTarget.PHOTO;
  }

  return AwardTarget.PHOTOGRAPHER;
};

export const normalizeAwardIdentity = (input: AwardIdentityInput): AwardIdentity => {
  if (input.type) {
    const rankLimit = input.type === AwardType.TOP_RANK ? input.rankLimit || null : null;
    const target = input.target || defaultTargetForType(input.type);
    const category = input.category || categoryFromAward(input.type, rankLimit);
    const defaultTarget = defaultTargetForType(input.type);

    if (!isContestPrizeCategory(category)) {
      throw new Error("Contest level badges are not configurable contest prizes");
    }

    if (input.type !== AwardType.TOP_RANK && target !== defaultTarget) {
      throw new Error(`${input.type} awards must target ${defaultTarget}`);
    }

    return {
      category,
      type: input.type,
      target,
      rankLimit,
    };
  }

  if (!input.category) {
    throw new Error("Award identity requires either type or category");
  }

  if (!isContestPrizeCategory(input.category)) {
    throw new Error("Contest level badges are not configurable contest prizes");
  }

  const rankLimit = topRankLimitByCategory[input.category] || null;
  if (rankLimit) {
    return {
      category: input.category,
      type: AwardType.TOP_RANK,
      target: input.target || AwardTarget.PHOTOGRAPHER,
      rankLimit,
    };
  }

  const identityMap: Partial<Record<PrizeType, AwardIdentity>> = {
    [PrizeType.TOP_PHOTO]: {
      category: PrizeType.TOP_PHOTO,
      type: AwardType.TOP_PHOTO,
      target: AwardTarget.PHOTO,
      rankLimit: null,
    },
    [PrizeType.TOP_PHOTOGRAPHER]: {
      category: PrizeType.TOP_PHOTOGRAPHER,
      type: AwardType.TOP_PHOTOGRAPHER,
      target: AwardTarget.PHOTOGRAPHER,
      rankLimit: null,
    },
    [PrizeType.WINNER]: {
      category: PrizeType.WINNER,
      type: AwardType.WINNER,
      target: AwardTarget.PHOTOGRAPHER,
      rankLimit: null,
    },
    [PrizeType.YC_PICK]: {
      category: PrizeType.YC_PICK,
      type: AwardType.YC_PICK,
      target: AwardTarget.PHOTO,
      rankLimit: null,
    },
  };

  const identity = identityMap[input.category];
  if (!identity) {
    throw new Error(`Unsupported contest prize category: ${input.category}`);
  }

  return {
    ...identity,
    target: input.target || identity.target,
  };
};

export const getAwardKey = (input: AwardIdentityInput) => {
  const identity = normalizeAwardIdentity(input);
  return `${identity.type}:${identity.target}:${identity.rankLimit || "NONE"}`;
};

export const getAwardSlotKey = (input: AwardIdentityInput) => {
  const identity = normalizeAwardIdentity(input);
  return `${identity.type}:${identity.target}`;
};

export const topRankLimits = [100, 50, 20, 10] as const;
