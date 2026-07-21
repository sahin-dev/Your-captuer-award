import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/ApiResponse";
import { prizeService } from "./prize.service";

const createPrize = catchAsync(async (req: Request, res: Response) => {
  const prize = await prizeService.createPrize(req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Prize created successfully",
    data: prize,
  });
});

const getPrizes = catchAsync(async (req: Request, res: Response) => {
  const includeInactive = req.query.includeInactive === "true";
  const prizes = await prizeService.getPrizes(includeInactive);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Prizes fetched successfully",
    data: prizes,
  });
});

const getAwardDefinitions = catchAsync(async (req: Request, res: Response) => {
  const prizes = await prizeService.getPrizes(false);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Award definitions fetched successfully",
    data: prizes,
  });
});

const getPrizeById = catchAsync(async (req: Request, res: Response) => {
  const prize = await prizeService.getPrizeById(req.params.prizeId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Prize fetched successfully",
    data: prize,
  });
});

const updatePrize = catchAsync(async (req: Request, res: Response) => {
  const prize = await prizeService.updatePrize(req.params.prizeId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Prize updated successfully",
    data: prize,
  });
});

const deletePrize = catchAsync(async (req: Request, res: Response) => {
  const prize = await prizeService.deletePrize(req.params.prizeId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Prize deleted successfully",
    data: prize,
  });
});

export const prizeController = {
  createPrize,
  getPrizes,
  getAwardDefinitions,
  getPrizeById,
  updatePrize,
  deletePrize,
};

