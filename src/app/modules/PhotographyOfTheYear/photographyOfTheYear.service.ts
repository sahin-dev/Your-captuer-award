import { contestService } from "../Contest/contest.service";
import { contestData, updateContestData } from "../Contest/contest.type";
import { photographyOfTheYearRankingService } from "./photographyOfTheYearRanking.service";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import { POTY_DEFAULT_ENTRY_FEE_USD } from "./photographyOfTheYearPrizePool";

const ensurePhotographyOfTheYear = async (contestId: string) => {
  const contest = await prisma.contest.findFirst({
    where: { id: contestId, isPhotographyOfYear: true, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
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
  entryFeeAmount: body.entryFeeAmount || POTY_DEFAULT_ENTRY_FEE_USD,
  coinRequirement: false,
  entryFeeCoins: 0,
}, banner);

const updatePhotographyOfTheYear = (
  contestId: string,
  body: updateContestData,
  banner?: Express.Multer.File,
) => contestService.updateContest(contestId, {
  ...body,
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

const join = async (userId: string, contestId: string, acceptedRuleKeys?: string[]) => {
  await ensurePhotographyOfTheYear(contestId);
  return contestService.joinContest(userId, contestId, acceptedRuleKeys, true);
};

const upload = async (
  contestId: string,
  userId: string,
  photoIds: string[] | string | undefined,
  files: Express.Multer.File[],
  acceptedRuleKeys?: string[],
) => {
  await ensurePhotographyOfTheYear(contestId);
  return contestService.uploadPhotoToContest(contestId, userId, photoIds, files, acceptedRuleKeys, true);
};

export const photographyOfTheYearService = {
  createPhotographyOfTheYear,
  updatePhotographyOfTheYear,
  getContests,
  getRanking,
  getPhotographerRanking,
  getMyEntry,
  join,
  upload,
};
