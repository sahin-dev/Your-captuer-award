import { Request, Response } from "express";
import httpStatus from "http-status";
import sendResponse from "../../../shared/ApiResponse";
import catchAsync from "../../../shared/catchAsync";
import { contestData } from "../Contest/contest.type";
import { photographyOfTheYearService } from "./photographyOfTheYear.service";

const create = catchAsync(async (req: any, res: Response) => {
  const contest = await photographyOfTheYearService.createPhotographyOfTheYear(
    req.user.id,
    req.body as contestData,
    req.file,
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Photographer of the Year contest created successfully",
    data: contest,
  });
});

const update = catchAsync(async (req: any, res: Response) => {
  const contest = await photographyOfTheYearService.updatePhotographyOfTheYear(
    req.params.contestId,
    req.body,
    req.file,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Photographer of the Year contest updated successfully",
    data: contest,
  });
});

const getContests = catchAsync(async (_req: Request, res: Response) => {
  const contests = await photographyOfTheYearService.getContests();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Photographer of the Year contests fetched successfully",
    data: contests,
  });
});

const getRanking = catchAsync(async (req: Request, res: Response) => {
  const ranking = await photographyOfTheYearService.getRanking(
    req.params.contestId,
    Number(req.query.page) || undefined,
    Number(req.query.limit) || undefined,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Photographer of the Year ranking fetched successfully",
    data: {
      photos: ranking.data,
      meta: ranking.meta,
    },
  });
});

const getPhotographerRanking = catchAsync(async (req: Request, res: Response) => {
  const ranking = await photographyOfTheYearService.getPhotographerRanking(
    req.params.contestId,
    Number(req.query.page) || undefined,
    Number(req.query.limit) || undefined,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Photographer of the Year photographer ranking fetched successfully",
    data: ranking,
  });
});

const getMyEntry = catchAsync(async (req: any, res: Response) => {
  const entry = await photographyOfTheYearService.getMyEntry(req.params.contestId, req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Photographer of the Year entry fetched successfully",
    data: entry,
  });
});

const getJudgingResult = catchAsync(async (req: any, res: Response) => {
  const result = await photographyOfTheYearService.getJudgingResult(req.params.contestId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Photographer of the Year judging result fetched successfully",
    data: result,
  });
});

const submitJudgingResults = catchAsync(async (req: any, res: Response) => {
  const result = await photographyOfTheYearService.submitJudgingResults(
    req.params.contestId,
    req.body,
    req.user.id,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Photographer of the Year results saved and participants notified",
    data: result,
  });
});

const join = catchAsync(async (req: any, res: Response) => {
  const result = await photographyOfTheYearService.join(
    req.user.id,
    req.params.contestId,
    req.body?.acceptedRuleKeys,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User joined the Photographer of the Year contest successfully",
    data: result,
  });
});

const upload = catchAsync(async (req: any, res: Response) => {
  const files = req.files ?? (req.file ? [req.file] : []);
  const result = await photographyOfTheYearService.upload(
    req.params.contestId,
    req.user.id,
    req.body?.photoIds,
    files,
    req.body?.acceptedRuleKeys,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Photos submitted to the Photographer of the Year contest successfully",
    data: result,
  });
});

export const photographyOfTheYearController = { create, update, getContests, getRanking, getPhotographerRanking, getMyEntry, getJudgingResult, submitJudgingResults, join, upload };
