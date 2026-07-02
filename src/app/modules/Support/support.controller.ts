import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from "http-status";
import { supportService } from "./support.service";

const createSupport = catchAsync(async (req: Request, res: Response) => {
  const result = await supportService.createSupport(req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Support ticket submitted successfully",
    data: result,
  });
});

const updateSupportStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await supportService.updateSupportStatus(id, status);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Support ticket status updated successfully",
    data: result,
  });
});

const getAllSupports = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, search } = req.query;
  const pageNum = page ? Number(page) : undefined;
  const limitNum = limit ? Number(limit) : undefined;

  const result = await supportService.getAllSupports(pageNum, limitNum, search);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Support tickets fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

const getSupportById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await supportService.getSupportById(id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Support ticket details fetched successfully",
    data: result,
  });
});

export const supportController = {
  createSupport,
  updateSupportStatus,
  getAllSupports,
  getSupportById,
};
