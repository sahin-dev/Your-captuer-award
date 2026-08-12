import { Request, Response } from "express";
import sendResponse from "../../../shared/ApiResponse";
import catchAsync from "../../../shared/catchAsync";
import { getSiteStats } from "./stats.service";

// GET /stats
// Currently online (browsing) and playing-now (active contest participant) counts
// @access Public
export const getStats = catchAsync(async (req: Request, res: Response) => {
  const stats = await getSiteStats();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Site stats fetched successfully",
    data: stats,
  });
});
