import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from "http-status";
import { socialLinkService } from "./socialLink.service";

const getActiveSocialLinks = catchAsync(async (req: Request, res: Response) => {
  const result = await socialLinkService.getActiveSocialLinks();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Social links fetched successfully",
    data: result,
  });
});

const getAllSocialLinks = catchAsync(async (req: Request, res: Response) => {
  const result = await socialLinkService.getAllSocialLinks();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Social links fetched successfully",
    data: result,
  });
});

const createSocialLink = catchAsync(async (req: Request, res: Response) => {
  const result = await socialLinkService.createSocialLink(req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Social link created successfully",
    data: result,
  });
});

const updateSocialLink = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await socialLinkService.updateSocialLink(id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Social link updated successfully",
    data: result,
  });
});

const deleteSocialLink = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await socialLinkService.deleteSocialLink(id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Social link deleted successfully",
    data: result,
  });
});

export const socialLinkController = {
  getActiveSocialLinks,
  getAllSocialLinks,
  createSocialLink,
  updateSocialLink,
  deleteSocialLink,
};
