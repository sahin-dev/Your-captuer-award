import { Request, Response } from "express";
import httpStatus from "http-status";
import sendResponse from "../../../shared/ApiResponse";
import catchAsync from "../../../shared/catchAsync";
import { faqService } from "./faq.service";

const parseBoolean = (value: unknown) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const getPublicFaqs = catchAsync(async (req: Request, res: Response) => {
  const { search, category } = req.query as { search?: string; category?: string };
  const result = await faqService.getPublicFaqs({ search, category });

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "FAQs fetched successfully",
    data: result,
  });
});

const getAllFaqs = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, search, category, isActive } = req.query as {
    page?: string;
    limit?: string;
    search?: string;
    category?: string;
    isActive?: string;
  };

  const result = await faqService.getAllFaqs({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search,
    category,
    isActive: parseBoolean(isActive),
  });

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "FAQs fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

const getFaqById = catchAsync(async (req: Request, res: Response) => {
  const result = await faqService.getFaqById(req.params.id, true);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "FAQ fetched successfully",
    data: result,
  });
});

const createFaq = catchAsync(async (req: Request, res: Response) => {
  const result = await faqService.createFaq(req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "FAQ created successfully",
    data: result,
  });
});

const updateFaq = catchAsync(async (req: Request, res: Response) => {
  const result = await faqService.updateFaq(req.params.id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "FAQ updated successfully",
    data: result,
  });
});

const deleteFaq = catchAsync(async (req: Request, res: Response) => {
  const result = await faqService.deleteFaq(req.params.id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "FAQ deleted successfully",
    data: result,
  });
});

export const faqController = {
  getPublicFaqs,
  getAllFaqs,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq,
};
