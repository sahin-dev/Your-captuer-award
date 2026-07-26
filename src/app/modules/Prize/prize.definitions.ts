import { AwardTarget, AwardType, PrizeType } from "../../../prismaClient";

export type PrizeDefinition = {
  category: PrizeType;
  type: AwardType;
  target: AwardTarget;
  rankLimit: number | null;
  title: string;
  description: string;
  icon: string;
  boost: number;
  swap: number;
  key: number;
  coin: number;
  isDefault: boolean;
  order: number;
};

const topRankDefinition = (
  rankLimit: 10 | 20 | 50 | 100,
  target: AwardTarget,
  rewards: Pick<PrizeDefinition, "boost" | "swap" | "key" | "coin">,
  isDefault: boolean,
  order: number
): PrizeDefinition => ({
  category: {
    10: PrizeType.TOP_10,
    20: PrizeType.TOP_20,
    50: PrizeType.TOP_50,
    100: PrizeType.TOP_100,
  }[rankLimit],
  type: AwardType.TOP_RANK,
  target,
  rankLimit,
  title: `Top ${rankLimit} ${target === AwardTarget.PHOTO ? "Photos" : "Photographers"}`,
  description: `Awarded to the ${rankLimit} highest-ranked ${target === AwardTarget.PHOTO ? "photos" : "photographers"}.`,
  icon: target === AwardTarget.PHOTO ? "image" : "users",
  ...rewards,
  isDefault,
  order,
});

export const defaultPrizeDefinitions: PrizeDefinition[] = [
  {
    category: PrizeType.TOP_PHOTO,
    type: AwardType.TOP_PHOTO,
    target: AwardTarget.PHOTO,
    rankLimit: null,
    title: "Top Photo",
    description: "Awarded to the highest-ranked photo in the contest.",
    icon: "trophy",
    boost: 10,
    swap: 1,
    key: 1,
    coin: 500,
    isDefault: true,
    order: 10,
  },
  {
    category: PrizeType.TOP_PHOTOGRAPHER,
    type: AwardType.TOP_PHOTOGRAPHER,
    target: AwardTarget.PHOTOGRAPHER,
    rankLimit: null,
    title: "Top Photographer",
    description: "Awarded to the photographer with the highest total contest score.",
    icon: "camera",
    boost: 20,
    swap: 2,
    key: 2,
    coin: 1000,
    isDefault: true,
    order: 20,
  },
  {
    category: PrizeType.WINNER,
    type: AwardType.WINNER,
    target: AwardTarget.PHOTOGRAPHER,
    rankLimit: null,
    title: "Winner",
    description: "Grand winner award for the contest's highest-ranked photographer.",
    icon: "medal",
    boost: 30,
    swap: 3,
    key: 3,
    coin: 1500,
    isDefault: false,
    order: 30,
  },
  {
    category: PrizeType.YC_PICK,
    type: AwardType.YC_PICK,
    target: AwardTarget.PHOTO,
    rankLimit: null,
    title: "YC Pick",
    description: "Editorial photo selected by Your Capture Award.",
    icon: "star",
    boost: 5,
    swap: 0,
    key: 1,
    coin: 250,
    isDefault: false,
    order: 40,
  },
  topRankDefinition(10, AwardTarget.PHOTO, { boost: 5, swap: 0, key: 1, coin: 500 }, false, 50),
  topRankDefinition(10, AwardTarget.PHOTOGRAPHER, { boost: 10, swap: 1, key: 2, coin: 1000 }, false, 60),
  topRankDefinition(20, AwardTarget.PHOTO, { boost: 4, swap: 0, key: 1, coin: 300 }, false, 70),
  topRankDefinition(20, AwardTarget.PHOTOGRAPHER, { boost: 8, swap: 1, key: 1, coin: 600 }, false, 80),
  topRankDefinition(50, AwardTarget.PHOTO, { boost: 3, swap: 0, key: 1, coin: 150 }, false, 90),
  topRankDefinition(50, AwardTarget.PHOTOGRAPHER, { boost: 6, swap: 0, key: 1, coin: 300 }, false, 100),
  topRankDefinition(100, AwardTarget.PHOTO, { boost: 2, swap: 0, key: 0, coin: 75 }, false, 110),
  topRankDefinition(100, AwardTarget.PHOTOGRAPHER, { boost: 4, swap: 0, key: 1, coin: 150 }, false, 120),
];
