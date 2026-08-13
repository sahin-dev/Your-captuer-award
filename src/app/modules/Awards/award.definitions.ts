import type {
  AwardTarget,
  AwardType,
  PrizeType,
  YCLevel,
} from "../../../prismaClient";

export const prizeTypes = {
  TOP_PHOTO: "TOP_PHOTO",
  TOP_PHOTOGRAPHER: "TOP_PHOTOGRAPHER",
  AMATEUR: "AMATEUR",
  TALENTED: "TALENTED",
  SUPREME: "SUPREME",
  SUPERIOR: "SUPERIOR",
  TOP_100_PHOTO: "TOP_100_PHOTO",
  TOP_100_PHOTOGRAPHER: "TOP_100_PHOTOGRAPHER",
  TOP_50_PHOTO: "TOP_50_PHOTO",
  TOP_50_PHOTOGRAPHER: "TOP_50_PHOTOGRAPHER",
  TOP_20_PHOTO: "TOP_20_PHOTO",
  TOP_20_PHOTOGRAPHER: "TOP_20_PHOTOGRAPHER",
  TOP_10_PHOTO: "TOP_10_PHOTO",
  TOP_10_PHOTOGRAPHER: "TOP_10_PHOTOGRAPHER",
  WINNER: "WINNER",
  TOP_NOTCH: "TOP_NOTCH",
} as const satisfies Record<PrizeType, PrizeType>;

export const awardTypes = {
  TOP_RANK: "TOP_RANK",
  TOP_PHOTO: "TOP_PHOTO",
  TOP_PHOTOGRAPHER: "TOP_PHOTOGRAPHER",
  WINNER: "WINNER",
} as const satisfies Record<AwardType, AwardType>;

export const awardTargets = {
  PHOTO: "PHOTO",
  PHOTOGRAPHER: "PHOTOGRAPHER",
} as const satisfies Record<AwardTarget, AwardTarget>;

export const ycLevels = {
  NEW: "NEW",
  AMATEUR: "AMATEUR",
  TALENTED: "TALENTED",
  SUPREME: "SUPREME",
  SUPERIOR: "SUPERIOR",
  TOP_NOTCH: "TOP_NOTCH",
} as const satisfies Record<YCLevel, YCLevel>;

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

const topRankCategoryByLimit: Record<number, Record<AwardTarget, PrizeType>> = {
  10: { PHOTO: prizeTypes.TOP_10_PHOTO, PHOTOGRAPHER: prizeTypes.TOP_10_PHOTOGRAPHER },
  20: { PHOTO: prizeTypes.TOP_20_PHOTO, PHOTOGRAPHER: prizeTypes.TOP_20_PHOTOGRAPHER },
  50: { PHOTO: prizeTypes.TOP_50_PHOTO, PHOTOGRAPHER: prizeTypes.TOP_50_PHOTOGRAPHER },
  100: { PHOTO: prizeTypes.TOP_100_PHOTO, PHOTOGRAPHER: prizeTypes.TOP_100_PHOTOGRAPHER },
};

const topRankLimitByCategory: Partial<Record<PrizeType, number>> = {
  [prizeTypes.TOP_10_PHOTO]: 10,
  [prizeTypes.TOP_10_PHOTOGRAPHER]: 10,
  [prizeTypes.TOP_20_PHOTO]: 20,
  [prizeTypes.TOP_20_PHOTOGRAPHER]: 20,
  [prizeTypes.TOP_50_PHOTO]: 50,
  [prizeTypes.TOP_50_PHOTOGRAPHER]: 50,
  [prizeTypes.TOP_100_PHOTO]: 100,
  [prizeTypes.TOP_100_PHOTOGRAPHER]: 100,
};

const topRankTargetByCategory: Partial<Record<PrizeType, AwardTarget>> = {
  [prizeTypes.TOP_10_PHOTO]: awardTargets.PHOTO,
  [prizeTypes.TOP_10_PHOTOGRAPHER]: awardTargets.PHOTOGRAPHER,
  [prizeTypes.TOP_20_PHOTO]: awardTargets.PHOTO,
  [prizeTypes.TOP_20_PHOTOGRAPHER]: awardTargets.PHOTOGRAPHER,
  [prizeTypes.TOP_50_PHOTO]: awardTargets.PHOTO,
  [prizeTypes.TOP_50_PHOTOGRAPHER]: awardTargets.PHOTOGRAPHER,
  [prizeTypes.TOP_100_PHOTO]: awardTargets.PHOTO,
  [prizeTypes.TOP_100_PHOTOGRAPHER]: awardTargets.PHOTOGRAPHER,
};

export const contestLevelBadges = {
  AMATEUR: "AMATEUR",
  TALENTED: "TALENTED",
  SUPREME: "SUPREME",
  SUPERIOR: "SUPERIOR",
  TOP_NOTCH: "TOP_NOTCH",
} as const;

export type ContestLevelBadgeValue = (typeof contestLevelBadges)[keyof typeof contestLevelBadges];

const levelBadgeByPrizeType: Partial<Record<PrizeType, ContestLevelBadgeValue>> = {
  [prizeTypes.AMATEUR]: contestLevelBadges.AMATEUR,
  [prizeTypes.TALENTED]: contestLevelBadges.TALENTED,
  [prizeTypes.SUPREME]: contestLevelBadges.SUPREME,
  [prizeTypes.SUPERIOR]: contestLevelBadges.SUPERIOR,
  [prizeTypes.TOP_NOTCH]: contestLevelBadges.TOP_NOTCH,
};

export const contestLevelBadgeOrder: Record<ContestLevelBadgeValue, number> = {
  [contestLevelBadges.AMATEUR]: 1,
  [contestLevelBadges.TALENTED]: 2,
  [contestLevelBadges.SUPREME]: 3,
  [contestLevelBadges.SUPERIOR]: 4,
  [contestLevelBadges.TOP_NOTCH]: 5,
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

const categoryFromAward = (type: AwardType, rankLimit: number | null, target: AwardTarget) => {
  if (type === awardTypes.TOP_RANK) {
    if (!rankLimit || !topRankCategoryByLimit[rankLimit]) {
      throw new Error("TOP_RANK awards require rankLimit 10, 20, 50, or 100");
    }

    return topRankCategoryByLimit[rankLimit][target];
  }

  const categoryMap: Record<Exclude<AwardType, "TOP_RANK">, PrizeType> = {
    [awardTypes.TOP_PHOTO]: prizeTypes.TOP_PHOTO,
    [awardTypes.TOP_PHOTOGRAPHER]: prizeTypes.TOP_PHOTOGRAPHER,
    [awardTypes.WINNER]: prizeTypes.WINNER,
  };

  return categoryMap[type as Exclude<AwardType, typeof awardTypes.TOP_RANK>];
};

const defaultTargetForType = (type: AwardType) => {
  if (type === awardTypes.TOP_PHOTO) {
    return awardTargets.PHOTO;
  }

  return awardTargets.PHOTOGRAPHER;
};

export const normalizeAwardIdentity = (input: AwardIdentityInput): AwardIdentity => {
  if (input.type) {
    const rankLimit = input.type === awardTypes.TOP_RANK ? input.rankLimit || null : null;
    const target = input.target || defaultTargetForType(input.type);
    const category = input.category || categoryFromAward(input.type, rankLimit, target);
    const defaultTarget = defaultTargetForType(input.type);

    if (!isContestPrizeCategory(category)) {
      throw new Error("Contest level badges are not configurable contest prizes");
    }

    if (input.type !== awardTypes.TOP_RANK && target !== defaultTarget) {
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
      type: awardTypes.TOP_RANK,
      target: topRankTargetByCategory[input.category]!,
      rankLimit,
    };
  }

  const identityMap: Partial<Record<PrizeType, AwardIdentity>> = {
    [prizeTypes.TOP_PHOTO]: {
      category: prizeTypes.TOP_PHOTO,
      type: awardTypes.TOP_PHOTO,
      target: awardTargets.PHOTO,
      rankLimit: null,
    },
    [prizeTypes.TOP_PHOTOGRAPHER]: {
      category: prizeTypes.TOP_PHOTOGRAPHER,
      type: awardTypes.TOP_PHOTOGRAPHER,
      target: awardTargets.PHOTOGRAPHER,
      rankLimit: null,
    },
    [prizeTypes.WINNER]: {
      category: prizeTypes.WINNER,
      type: awardTypes.WINNER,
      target: awardTargets.PHOTOGRAPHER,
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
