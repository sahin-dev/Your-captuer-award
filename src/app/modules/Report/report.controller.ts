import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from "http-status";
import { reportService } from "./report.service";
import { ReportStatus } from "../../../prismaClient";

const createReport = catchAsync(async (req: Request, res: Response) => {
  const reporterId = req.user.id;
  const result = await reportService.createReport(reporterId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "User reported successfully",
    data: result,
  });
});

const getReports = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, status } = req.query as { page?: string; limit?: string; status?: ReportStatus };
  const result = await reportService.getReports(page ? Number(page) : undefined, limit ? Number(limit) : undefined, status);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Reports fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

const getReportById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await reportService.getReportById(id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Report fetched successfully",
    data: result,
  });
});

const reviewReport = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const adminId = req.user.id;
  const { status, resolutionNote } = req.body;
  const result = await reportService.reviewReport(id, adminId, status, resolutionNote);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Report reviewed successfully",
    data: result,
  });
});

export const reportController = {
  createReport,
  getReports,
  getReportById,
  reviewReport,
};
