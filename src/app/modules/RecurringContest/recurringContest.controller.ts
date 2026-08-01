import { Request, Response } from "express";
import httpStatus from "http-status";
import sendResponse from "../../../shared/ApiResponse";
import catchAsync from "../../../shared/catchAsync";
import { recurringContestService } from "./recurringContest.service";

const getRecurringContests = catchAsync(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await recurringContestService.getRecurringContests(page, limit);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Recurring contests fetched successfully",
    data: result,
  });
});

const getRecurringContestById = catchAsync(async (req: Request, res: Response) => {
  const result = await recurringContestService.getRecurringContestById(req.params.recurringContestId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Recurring contest fetched successfully",
    data: result,
  });
});

const updateRecurringContest = catchAsync(async (req: Request, res: Response) => {
  const result = await recurringContestService.updateRecurringContest(req.params.recurringContestId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Recurring contest updated successfully",
    data: result,
  });
});

const pauseRecurringContest = catchAsync(async (req: Request, res: Response) => {
  const result = await recurringContestService.pauseRecurringContest(req.params.recurringContestId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Recurring contest paused successfully",
    data: result,
  });
});

const resumeRecurringContest = catchAsync(async (req: Request, res: Response) => {
  const result = await recurringContestService.resumeRecurringContest(req.params.recurringContestId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Recurring contest resumed successfully",
    data: result,
  });
});

const endRecurringContest = catchAsync(async (req: Request, res: Response) => {
  const result = await recurringContestService.endRecurringContest(req.params.recurringContestId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Recurring contest ended successfully",
    data: result,
  });
});

const updateRecurringInterval = catchAsync(async (req: Request, res: Response) => {
  const result = await recurringContestService.updateRecurringInterval(
    req.params.recurringContestId,
    req.body.recurringType,
    req.body.nextOccurrence,
    {
      timezone:req.body.timezone,
      endsAt:req.body.endsAt,
      maxOccurrences:req.body.maxOccurrences,
    }
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Recurring contest interval updated successfully",
    data: result,
  });
});

const getGeneratedContests = catchAsync(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await recurringContestService.getGeneratedContests(req.params.recurringContestId, page, limit);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Generated contests fetched successfully",
    data: result,
  });
});

const getRecurringAwards = catchAsync(async (req: Request, res: Response) => {
  const result = await recurringContestService.getRecurringAwards(req.params.recurringContestId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Recurring contest awards fetched successfully",
    data: result,
  });
});

const replaceRecurringAwards = catchAsync(async (req: Request, res: Response) => {
  const result = await recurringContestService.replaceRecurringAwards(
    req.params.recurringContestId,
    req.body.awardPrizeIds,
    req.body.awards
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Recurring contest awards updated successfully",
    data: result,
  });
});

export const recurringContestController = {
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

