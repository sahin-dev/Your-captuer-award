import { notDeletedContest } from "../Contest/contestLifecycle";
import { contestService } from "../Contest/contest.service";
import { contestData, updateContestData } from "../Contest/contest.type";
import { photographyOfTheYearRankingService } from "./photographyOfTheYearRanking.service";
import { ContestFinalizationStatus, ContestStatus } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import logger from "../../../shared/logger";
import { notifyPotyResultRecipient } from "./photographyOfTheYear.notification";

const ensurePhotographyOfTheYear = async (contestId: string) => {
  const contest = await prisma.contest.findFirst({
    where: { id: contestId, isPhotographyOfYear: true, ...notDeletedContest },
    select: { id: true },
  });
  if (!contest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Photographer of the Year contest not found");
  }
};

const createPhotographyOfTheYear = async (
  creatorId: string,
  body: contestData,
  banner: Express.Multer.File,
) => contestService.createContest(creatorId, {
  ...body,
  isPhotographyOfYear: true,
  recurring: false,
  prizes: [],
  prizeIds: [],
  levelAwards: [],
  isMoneyContest: false,
  entryFeeAmount: body.entryFeeAmount ?? 0,
  coinRequirement: false,
  entryFeeCoins: 0,
}, banner);

const updatePhotographyOfTheYear = (
  contestId: string,
  body: updateContestData,
  banner?: Express.Multer.File,
) => contestService.updateContest(contestId, {
  ...body,
  entryFeeAmount: body.entryFeeAmount,
  isMoneyContest: false,
  minPrize: 0,
  maxPrize: 0,
  coinRequirement: false,
  entryFeeCoins: 0,
  prizes: [],
  prizeIds: [],
  levelAwards: [],
}, banner as Express.Multer.File, true);

const getContests = () => photographyOfTheYearRankingService.getPhotographyOfYearContests();
const getRanking = (contestId: string, page?: number, limit?: number) =>
  photographyOfTheYearRankingService.buildPhotographyOfYearRanking(contestId, page, limit);
const getPhotographerRanking = (contestId: string, page?: number, limit?: number) =>
  photographyOfTheYearRankingService.buildPhotographyOfYearPhotographerRanking(contestId, page, limit);

const getMyEntry = (contestId: string, userId: string) =>
  photographyOfTheYearRankingService.getMyPhotographyOfYearEntry(contestId, userId);

type PhotographyOfTheYearJudgingInput = {
  winnerPhotoIds?: string[];
  firstPhotoId?: string;
  secondPhotoId?: string;
  thirdPhotoId?: string;
};

const getJudgingResult = async (contestId: string) => {
  await ensurePhotographyOfTheYear(contestId);
  const result = await prisma.photographyOfTheYearResult.findUnique({ where: { contestId } });
  if (!result) return { winners: [] as string[] };

  const legacyWinners = [result.firstPhotoId, result.secondPhotoId, result.thirdPhotoId]
    .filter((id): id is string => Boolean(id));
  return {
    ...result,
    winners: result.winnerPhotoIds?.length ? result.winnerPhotoIds : legacyWinners,
  };
};

const submitJudgingResults = async (
  contestId: string,
  input: PhotographyOfTheYearJudgingInput,
  _adminId: string,
) => {
  const contest = await prisma.contest.findFirst({
    where: { id: contestId, isPhotographyOfYear: true, ...notDeletedContest },
    select: { id: true, title: true, endDate: true, status: true },
  });
  if (!contest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Photographer of the Year contest not found");
  }
  if (contest.endDate > new Date()) {
    throw new ApiError(httpStatus.BAD_REQUEST, "POTY judging opens after the contest ends");
  }
  const previous = await prisma.photographyOfTheYearResult.findUnique({ where: { contestId } });
  if (contest.status === ContestStatus.COMPLETED && previous) {
    throw new ApiError(httpStatus.BAD_REQUEST, "POTY results have already been published");
  }

  const requestedPhotoIds = input.winnerPhotoIds?.length
    ? input.winnerPhotoIds
    : [input.firstPhotoId, input.secondPhotoId, input.thirdPhotoId].filter(
        (id): id is string => Boolean(id),
      );
  if (requestedPhotoIds.length < 1 || requestedPhotoIds.length > 10) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Select between one and ten POTY winners");
  }
  if (new Set(requestedPhotoIds).size !== requestedPhotoIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Each selected winner must be a different photo");
  }

  // The ranking service is the source of truth for the automatic top 10.
  const ranking = await photographyOfTheYearRankingService.buildPhotographyOfYearRanking(contestId, 1, 10);
  const photosById = new Map(ranking.data.map((photo) => [photo.contestPhotoId, photo]));
  const selectedPhotos = requestedPhotoIds.map((photoId) => photosById.get(photoId));
  if (selectedPhotos.some((photo) => !photo)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Every POTY winner must come from the automatic top 10");
  }

  // Make sure the top-10 notification is delivered even when no new regular
  // contest vote has been processed since the ranking window closed.
  await photographyOfTheYearRankingService.notifyTopTenForContest(contestId);

  const completedAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const savedResult = await tx.photographyOfTheYearResult.upsert({
      where: { contestId },
      create: {
        contestId,
        winnerPhotoIds: requestedPhotoIds,
        firstPhotoId: requestedPhotoIds[0] ?? null,
        secondPhotoId: requestedPhotoIds[1] ?? null,
        thirdPhotoId: requestedPhotoIds[2] ?? null,
      },
      update: {
        winnerPhotoIds: requestedPhotoIds,
        firstPhotoId: requestedPhotoIds[0] ?? null,
        secondPhotoId: requestedPhotoIds[1] ?? null,
        thirdPhotoId: requestedPhotoIds[2] ?? null,
      },
    });
    await tx.contest.update({
      where: { id: contestId },
      data: { status: ContestStatus.COMPLETED, finalizedAt: completedAt },
    });
    await tx.contestFinalization.updateMany({
      where: { contestId },
      data: { status: ContestFinalizationStatus.COMPLETED, completedAt, error: null },
    });
    return savedResult;
  });

  const previousPlacements = previous?.winnerPhotoIds?.length
    ? previous.winnerPhotoIds
    : [previous?.firstPhotoId, previous?.secondPhotoId, previous?.thirdPhotoId]
        .filter((id): id is string => Boolean(id));
  const recipients = await prisma.user.findMany({
    where: { id: { in: selectedPhotos.filter((photo): photo is NonNullable<typeof photo> => Boolean(photo)).map((photo) => photo.photographer.id) } },
    select: { id: true, email: true, fullName: true, username: true },
  });
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));
  const notificationEffects = selectedPhotos.flatMap((photo, index) => {
    if (!photo || previousPlacements[index] === requestedPhotoIds[index]) return [];
    const recipient = recipientById.get(photo.photographer.id);
    if (!recipient) return [];
    return [notifyPotyResultRecipient(
      {
        id: recipient.id,
        email: recipient.email,
        fullName: recipient.fullName,
        username: recipient.username,
      },
      {
        contestId,
        contestTitle: contest.title,
        contestPhotoId: photo.contestPhotoId,
        photoTitle: photo.title || `Entry #${photo.rank}`,
        rank: photo.rank,
        voteCount: photo.voteCount,
      },
      index + 1,
    ).catch((error) => {
      logger.error({ err: error, contestId, contestPhotoId: photo.contestPhotoId, place: index + 1 }, "POTY result notification delivery failed");
    })];
  });
  await Promise.allSettled(notificationEffects);

  return {
    ...result,
    winners: requestedPhotoIds,
  };
};

const join = async (userId: string, contestId: string, acceptedRuleKeys?: string[]) => {
  await ensurePhotographyOfTheYear(contestId);
  return contestService.joinContest(userId, contestId, acceptedRuleKeys, "POTY");
};

const upload = async (
  contestId: string,
  userId: string,
  photoIds: string[] | string | undefined,
  files: Express.Multer.File[],
  acceptedRuleKeys?: string[],
) => {
  await ensurePhotographyOfTheYear(contestId);
  return contestService.uploadPhotoToContest(contestId, userId, photoIds, files, acceptedRuleKeys, "POTY");
};

export const photographyOfTheYearService = {
  createPhotographyOfTheYear,
  updatePhotographyOfTheYear,
  getContests,
  getRanking,
  getPhotographerRanking,
  getMyEntry,
  getJudgingResult,
  submitJudgingResults,
  join,
  upload,
};
