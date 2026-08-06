import { LevelName, PrizeType } from "../../../prismaClient";
import { prizeTypes } from "../Awards/award.definitions";

export type BadgeRequirement = {
    categories: PrizeType[];
    required: number;
};

export type LevelRule = {
    order: number;
    levelName: LevelName;
    votePower: number;
    receivedVotes: number;
    promotedVotes: number;
    badges: BadgeRequirement[];
};

export const LEVEL_RULES: LevelRule[] = [
    {
        order: 1,
        levelName: LevelName.APPRENTICE,
        votePower: 2,
        receivedVotes: 2500,
        promotedVotes: 100,
        badges: [{ categories: [prizeTypes.AMATEUR], required: 5 }],
    },
    {
        order: 2,
        levelName: LevelName.STUDENT,
        votePower: 4,
        receivedVotes: 5000,
        promotedVotes: 250,
        badges: [{ categories: [prizeTypes.TALENTED], required: 5 }],
    },
    {
        order: 3,
        levelName: LevelName.TRAINED,
        votePower: 6,
        receivedVotes: 7500,
        promotedVotes: 500,
        badges: [{ categories: [prizeTypes.SUPREME], required: 10 }],
    },
    {
        order: 4,
        levelName: LevelName.TALENTED,
        votePower: 8,
        receivedVotes: 10000,
        promotedVotes: 1000,
        badges: [{ categories: [prizeTypes.SUPERIOR], required: 20 }],
    },
    {
        order: 5,
        levelName: LevelName.CONTENDER,
        votePower: 10,
        receivedVotes: 20000,
        promotedVotes: 1500,
        badges: [
            { categories: [PrizeType.YC_PICK], required: 5 },
            { categories: [PrizeType.TOP_100_PHOTO, PrizeType.TOP_100_PHOTOGRAPHER], required: 1 },
        ],
    },
    {
        order: 6,
        levelName: LevelName.VIRTUOSO,
        votePower: 12,
        receivedVotes: 75000,
        promotedVotes: 2500,
        badges: [
            { categories: [PrizeType.TOP_100_PHOTO, PrizeType.TOP_100_PHOTOGRAPHER], required: 3 },
            { categories: [PrizeType.TOP_50_PHOTO, PrizeType.TOP_50_PHOTOGRAPHER], required: 1 },
        ],
    },
    {
        order: 7,
        levelName: LevelName.LEADER,
        votePower: 14,
        receivedVotes: 150000,
        promotedVotes: 7500,
        badges: [
            { categories: [PrizeType.TOP_100_PHOTO, PrizeType.TOP_100_PHOTOGRAPHER], required: 5 },
            { categories: [PrizeType.TOP_50_PHOTO, PrizeType.TOP_50_PHOTOGRAPHER], required: 3 },
            { categories: [PrizeType.TOP_20_PHOTO, PrizeType.TOP_20_PHOTOGRAPHER], required: 1 },
        ],
    },
    {
        order: 8,
        levelName: LevelName.AVANTGARDE,
        votePower: 16,
        receivedVotes: 350000,
        promotedVotes: 10000,
        badges: [
            { categories: [PrizeType.TOP_100_PHOTO, PrizeType.TOP_100_PHOTOGRAPHER], required: 20 },
            { categories: [PrizeType.TOP_50_PHOTO, PrizeType.TOP_50_PHOTOGRAPHER], required: 5 },
            { categories: [PrizeType.TOP_20_PHOTO, PrizeType.TOP_20_PHOTOGRAPHER], required: 3 },
            { categories: [PrizeType.TOP_10_PHOTO, PrizeType.TOP_10_PHOTOGRAPHER], required: 1 },
        ],
    },
    {
        order: 9,
        levelName: LevelName.PRO,
        votePower: 18,
        receivedVotes: 750000,
        promotedVotes: 15000,
        badges: [
            { categories: [PrizeType.TOP_100_PHOTO, PrizeType.TOP_100_PHOTOGRAPHER], required: 30 },
            { categories: [PrizeType.TOP_50_PHOTO, PrizeType.TOP_50_PHOTOGRAPHER], required: 10 },
            { categories: [PrizeType.TOP_20_PHOTO, PrizeType.TOP_20_PHOTOGRAPHER], required: 5 },
            { categories: [PrizeType.WINNER], required: 1 },
        ],
    },
];

export const LEVEL_BADGE_TYPES = Array.from(
    new Set(LEVEL_RULES.flatMap(rule => rule.badges.flatMap(badge => badge.categories)))
);
