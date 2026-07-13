import httpStatus from "http-status";
import ApiError from "../../../errors/ApiError";
import { RecurringContestStatus, RecurringType } from "../../../prismaClient";
import { calculateNextOccurance } from "../../../helpers/nextOccurance";
import prisma from "../../../shared/prisma";
import { prizeService } from "../Prize/prize.service";

type RecurringUpdateData = {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  maxUploads?: number;
  isMoneyContest?: boolean;
  maxPrize?: number;
  minPrize?: number;
  level_requirements?: number[];
  rules?: Array<{ name: string; description: string; icon?: string }>;
};

const getRecurringContests = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const [recurringContests, total] = await Promise.all([
    prisma.recurringContest.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.recurringContest.count(),
  ]);

  return { recurringContests, total, page, limit };
};

const getRecurringContestById = async (recurringContestId: string) => {
  const recurringContest = await prisma.recurringContest.findUnique({
    where: { id: recurringContestId },
    include: { contestAwards: true },
  });

  if (!recurringContest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Recurring contest not found");
  }

  return recurringContest;
};

const updateRecurringContest = async (recurringContestId: string, data: RecurringUpdateData) => {
  const recurringContest = await getRecurringContestById(recurringContestId);
  const startDate = data.startDate ? new Date(data.startDate) : recurringContest.startDate;
  const endDate = data.endDate ? new Date(data.endDate) : recurringContest.endDate;

  if (startDate > endDate) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Start date cannot be after end date");
  }

  const duration = endDate.getTime() - startDate.getTime();

  return prisma.recurringContest.update({
    where: { id: recurringContestId },
    data: {
      title: data.title,
      description: data.description,
      startDate: data.startDate ? startDate : undefined,
      endDate: data.endDate ? endDate : undefined,
      maxUploads: data.maxUploads,
      isMoneyContest: data.isMoneyContest,
      maxPrize: data.maxPrize,
      minPrize: data.minPrize,
      level_requirements: data.level_requirements,
      rules: data.rules ? JSON.stringify(data.rules) : undefined,
      recurring:
        data.startDate || data.endDate
          ? {
              set: {
                ...recurringContest.recurring,
                duration,
              },
            }
          : undefined,
    },
  });
};

const pauseRecurringContest = async (recurringContestId: string) => {
  await getRecurringContestById(recurringContestId);

  return prisma.recurringContest.update({
    where: { id: recurringContestId },
    data: { status: RecurringContestStatus.PAUSED },
  });
};

const resumeRecurringContest = async (recurringContestId: string) => {
  const recurringContest = await getRecurringContestById(recurringContestId);
  const now = new Date();
  const nextOccurrence = calculateNextOccurance(now, recurringContest.recurring.recurringType);

  return prisma.recurringContest.update({
    where: { id: recurringContestId },
    data: {
      status: RecurringContestStatus.ACTIVE,
      recurring: {
        set: {
          ...recurringContest.recurring,
          previousOccurrence: now,
          nextOccurrence,
        },
      },
    },
  });
};

const endRecurringContest = async (recurringContestId: string) => {
  await getRecurringContestById(recurringContestId);

  return prisma.recurringContest.update({
    where: { id: recurringContestId },
    data: { status: RecurringContestStatus.ENDED },
  });
};

const updateRecurringInterval = async (
  recurringContestId: string,
  recurringType: RecurringType,
  nextOccurrence?: string
) => {
  const recurringContest = await getRecurringContestById(recurringContestId);
  const previousOccurrence = new Date();
  const recalculatedNextOccurrence = nextOccurrence
    ? new Date(nextOccurrence)
    : calculateNextOccurance(previousOccurrence, recurringType);

  if (recalculatedNextOccurrence <= previousOccurrence) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Next occurrence must be in the future");
  }

  return prisma.recurringContest.update({
    where: { id: recurringContestId },
    data: {
      recurring: {
        set: {
          ...recurringContest.recurring,
          recurringType,
          previousOccurrence,
          nextOccurrence: recalculatedNextOccurrence,
        },
      },
    },
  });
};

const getGeneratedContests = async (recurringContestId: string, page = 1, limit = 20) => {
  await getRecurringContestById(recurringContestId);
  const skip = (page - 1) * limit;

  const [contests, total] = await Promise.all([
    prisma.contest.findMany({
      where: { recurringContestId },
      skip,
      take: limit,
      orderBy: { startDate: "desc" },
    }),
    prisma.contest.count({ where: { recurringContestId } }),
  ]);

  return { contests, total, page, limit };
};

const getRecurringAwards = async (recurringContestId: string) => {
  await getRecurringContestById(recurringContestId);
  return prizeService.getRecurringContestAwards(recurringContestId);
};

const replaceRecurringAwards = async (recurringContestId: string, awardPrizeIds: string[]) => {
  await getRecurringContestById(recurringContestId);
  return prizeService.replaceRecurringContestAwards(recurringContestId, awardPrizeIds);
};

export const recurringContestService = {
  getRecurringContests,
  getRecurringContestById,
  updateRecurringContest,
  pauseRecurringContest,
  resumeRecurringContest,
  endRecurringContest,
  updateRecurringInterval,
  getGeneratedContests,
  getRecurringAwards,
  replaceRecurringAwards,
};

