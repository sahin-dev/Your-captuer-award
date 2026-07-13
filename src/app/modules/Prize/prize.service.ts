import httpStatus from "http-status";
import ApiError from "../../../errors/ApiError";
import prisma from "../../../shared/prisma";
import { PrizeType } from "../../../prismaClient";
import { z } from "zod";
import { createPrizeSchema, updatePrizeSchema } from "./prize.validation";

type PrizeCreateData = z.infer<typeof createPrizeSchema>;
type PrizeUpdateData = z.infer<typeof updatePrizeSchema>;

const ensureCategoryAvailable = async (category: PrizeType, ignoredPrizeId?: string) => {
  const existingPrize = await prisma.prize.findFirst({
    where: {
      category,
      isActive: true,
      ...(ignoredPrizeId && { NOT: { id: ignoredPrizeId } }),
    },
  });

  if (existingPrize) {
    throw new ApiError(httpStatus.BAD_REQUEST, "An active prize already exists for this category");
  }
};

const createPrize = async (data: PrizeCreateData) => {
  await ensureCategoryAvailable(data.category);

  return prisma.prize.create({
    data,
  });
};

const getPrizes = async (includeInactive = false) => {
  return prisma.prize.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { createdAt: "desc" },
  });
};

const getPrizeById = async (prizeId: string) => {
  const prize = await prisma.prize.findUnique({ where: { id: prizeId } });

  if (!prize) {
    throw new ApiError(httpStatus.NOT_FOUND, "Prize not found");
  }

  return prize;
};

const updatePrize = async (prizeId: string, data: PrizeUpdateData) => {
  const prize = await getPrizeById(prizeId);

  if (data.category) {
    await ensureCategoryAvailable(data.category, prize.id);
  }

  return prisma.prize.update({
    where: { id: prizeId },
    data,
  });
};

const deletePrize = async (prizeId: string) => {
  await getPrizeById(prizeId);

  return prisma.prize.update({
    where: { id: prizeId },
    data: { isActive: false },
  });
};

const getActivePrizesByIds = async (prizeIds: string[]) => {
  const uniquePrizeIds = [...new Set(prizeIds)];

  const prizes = await prisma.prize.findMany({
    where: {
      id: { in: uniquePrizeIds },
      isActive: true,
    },
  });

  if (prizes.length !== uniquePrizeIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "One or more selected prizes are invalid or inactive");
  }

  const categories = new Set(prizes.map((prize) => prize.category));
  if (categories.size !== prizes.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Only one prize per category can be selected");
  }

  return prizes;
};

const createContestAwardsFromPrizeIds = async (contestId: string, prizeIds: string[]) => {
  if (!prizeIds.length) {
    return [];
  }

  const prizes = await getActivePrizesByIds(prizeIds);

  await prisma.contestAward.createMany({
    data: prizes.map((prize) => ({
      contestId,
      prizeId: prize.id,
      category: prize.category,
      icon: prize.icon,
      key: prize.key,
      boost: prize.boost,
      swap: prize.swap,
      coin: prize.coin,
    })),
  });

  return getContestAwards(contestId);
};

const createRecurringContestAwardsFromPrizeIds = async (recurringContestId: string, prizeIds: string[]) => {
  if (!prizeIds.length) {
    return [];
  }

  const prizes = await getActivePrizesByIds(prizeIds);

  await prisma.recurringContestAward.createMany({
    data: prizes.map((prize) => ({
      recurringContestId,
      prizeId: prize.id,
      category: prize.category,
      icon: prize.icon,
      key: prize.key,
      boost: prize.boost,
      swap: prize.swap,
      coin: prize.coin,
    })),
  });

  return getRecurringContestAwards(recurringContestId);
};

const replaceRecurringContestAwards = async (recurringContestId: string, prizeIds: string[]) => {
  await prisma.recurringContestAward.deleteMany({ where: { recurringContestId } });
  return createRecurringContestAwardsFromPrizeIds(recurringContestId, prizeIds);
};

const copyRecurringAwardsToContest = async (recurringContestId: string, contestId: string) => {
  const awards = await prisma.recurringContestAward.findMany({ where: { recurringContestId } });

  if (!awards.length) {
    return [];
  }

  await prisma.contestAward.createMany({
    data: awards.map((award) => ({
      contestId,
      prizeId: award.prizeId,
      category: award.category,
      icon: award.icon,
      key: award.key,
      boost: award.boost,
      swap: award.swap,
      coin: award.coin,
    })),
  });

  return getContestAwards(contestId);
};

const getContestAwards = async (contestId: string) => {
  return prisma.contestAward.findMany({
    where: { contestId },
    orderBy: { createdAt: "asc" },
  });
};

const getRecurringContestAwards = async (recurringContestId: string) => {
  return prisma.recurringContestAward.findMany({
    where: { recurringContestId },
    orderBy: { createdAt: "asc" },
  });
};

export const prizeService = {
  createPrize,
  getPrizes,
  getPrizeById,
  updatePrize,
  deletePrize,
  createContestAwardsFromPrizeIds,
  createRecurringContestAwardsFromPrizeIds,
  replaceRecurringContestAwards,
  copyRecurringAwardsToContest,
  getContestAwards,
  getRecurringContestAwards,
};

