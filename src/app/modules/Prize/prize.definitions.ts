import type { AwardTarget, AwardType, PrizeType } from "../../../prismaClient";
import { awardTargets, awardTypes, prizeTypes } from "../Awards/award.definitions";

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
    10: prizeTypes.TOP_10,
    20: prizeTypes.TOP_20,
    50: prizeTypes.TOP_50,
    100: prizeTypes.TOP_100,
  }[rankLimit],
  type: awardTypes.TOP_RANK,
  target,
  rankLimit,
  title: `Top ${rankLimit} ${target === awardTargets.PHOTO ? "Photos" : "Photographers"}`,
  description: `Awarded to the ${rankLimit} highest-ranked ${target === awardTargets.PHOTO ? "photos" : "photographers"}.`,
  icon: target === awardTargets.PHOTO ? "image" : "users",
  ...rewards,
  isDefault,
  order,
});

export const defaultPrizeDefinitions: PrizeDefinition[] = [
  {
    category: prizeTypes.TOP_PHOTO,
    type: awardTypes.TOP_PHOTO,
    target: awardTargets.PHOTO,
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
    category: prizeTypes.TOP_PHOTOGRAPHER,
    type: awardTypes.TOP_PHOTOGRAPHER,
    target: awardTargets.PHOTOGRAPHER,
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
    category: prizeTypes.WINNER,
    type: awardTypes.WINNER,
    target: awardTargets.PHOTOGRAPHER,
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
    category: prizeTypes.YC_PICK,
    type: awardTypes.YC_PICK,
    target: awardTargets.PHOTO,
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
  topRankDefinition(10, awardTargets.PHOTO, { boost: 5, swap: 0, key: 1, coin: 500 }, false, 50),
  topRankDefinition(10, awardTargets.PHOTOGRAPHER, { boost: 10, swap: 1, key: 2, coin: 1000 }, false, 60),
  topRankDefinition(20, awardTargets.PHOTO, { boost: 4, swap: 0, key: 1, coin: 300 }, false, 70),
  topRankDefinition(20, awardTargets.PHOTOGRAPHER, { boost: 8, swap: 1, key: 1, coin: 600 }, false, 80),
  topRankDefinition(50, awardTargets.PHOTO, { boost: 3, swap: 0, key: 1, coin: 150 }, false, 90),
  topRankDefinition(50, awardTargets.PHOTOGRAPHER, { boost: 6, swap: 0, key: 1, coin: 300 }, false, 100),
  topRankDefinition(100, awardTargets.PHOTO, { boost: 2, swap: 0, key: 0, coin: 75 }, false, 110),
  topRankDefinition(100, awardTargets.PHOTOGRAPHER, { boost: 4, swap: 0, key: 1, coin: 150 }, false, 120),
];
