import { z } from "zod";
import prisma from "../../../shared/prisma";
import { contestLevelAwardArraySchema } from "./contestLevelAward.validation";

type LevelAwardInput = z.infer<typeof contestLevelAwardArraySchema>;

const getContestLevelAwards = async (contestId: string) => {
  return prisma.contestLevelAward.findMany({ where: { contestId } });
};

const replaceContestLevelAwards = async (contestId: string, levelAwards: LevelAwardInput) => {
  await prisma.$transaction(async (tx) => {
    await tx.contestLevelAward.deleteMany({ where: { contestId } });
    if (levelAwards.length > 0) {
      await tx.contestLevelAward.createMany({
        data: levelAwards.map((award) => ({ contestId, ...award })),
      });
    }
  });

  return getContestLevelAwards(contestId);
};

const getRecurringContestLevelAwards = async (recurringContestId: string) => {
  return prisma.recurringContestLevelAward.findMany({ where: { recurringContestId } });
};

const replaceRecurringContestLevelAwards = async (recurringContestId: string, levelAwards: LevelAwardInput) => {
  await prisma.$transaction(async (tx) => {
    await tx.recurringContestLevelAward.deleteMany({ where: { recurringContestId } });
    if (levelAwards.length > 0) {
      await tx.recurringContestLevelAward.createMany({
        data: levelAwards.map((award) => ({ recurringContestId, ...award })),
      });
    }
  });

  return getRecurringContestLevelAwards(recurringContestId);
};

const copyRecurringLevelAwardsToContest = async (recurringContestId: string, contestId: string) => {
  const levelAwards = await getRecurringContestLevelAwards(recurringContestId);
  if (!levelAwards.length) {
    return [];
  }

  await prisma.contestLevelAward.createMany({
    data: levelAwards.map((award) => ({
      contestId,
      level: award.level,
      boost: award.boost,
      swap: award.swap,
      key: award.key,
      coin: award.coin,
    })),
  });

  return getContestLevelAwards(contestId);
};

export const contestLevelAwardService = {
  getContestLevelAwards,
  replaceContestLevelAwards,
  getRecurringContestLevelAwards,
  replaceRecurringContestLevelAwards,
  copyRecurringLevelAwardsToContest,
};
