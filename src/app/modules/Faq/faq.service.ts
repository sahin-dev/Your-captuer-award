import httpStatus from "http-status";
import ApiError from "../../../errors/ApiError";
import { paginationHelper } from "../../../helpers/paginationHelper";
import prisma from "../../../shared/prisma";

type FaqInput = {
  question: string;
  answer: string;
  category?: string;
  order?: number;
  isActive?: boolean;
};

type FaqFilters = {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  isActive?: boolean;
};

const buildWhere = (filters: FaqFilters) => {
  return {
    ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    ...(filters.category && { category: filters.category }),
    ...(filters.search && {
      OR: [
        { question: { contains: filters.search, mode: "insensitive" as const } },
        { answer: { contains: filters.search, mode: "insensitive" as const } },
        { category: { contains: filters.search, mode: "insensitive" as const } },
      ],
    }),
  };
};

const getPublicFaqs = async (filters: Omit<FaqFilters, "isActive">) => {
  return prisma.faq.findMany({
    where: buildWhere({ ...filters, isActive: true }),
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
};

const getAllFaqs = async (filters: FaqFilters) => {
  const { skip, limit } = paginationHelper.calculatePagination({
    page: filters.page,
    limit: filters.limit,
  });
  const where = buildWhere(filters);

  const [faqs, total] = await Promise.all([
    prisma.faq.findMany({
      skip,
      take: limit,
      where,
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.faq.count({ where }),
  ]);

  return {
    data: faqs,
    meta: paginationHelper.getPaginationMetaData(filters.page ?? 1, limit, total),
  };
};

const getFaqById = async (id: string, activeOnly = false) => {
  const faq = await prisma.faq.findFirst({
    where: {
      id,
      ...(activeOnly && { isActive: true }),
    },
  });

  if (!faq) {
    throw new ApiError(httpStatus.NOT_FOUND, "FAQ not found");
  }

  return faq;
};

const createFaq = async (data: FaqInput) => {
  return prisma.faq.create({
    data: {
      question: data.question,
      answer: data.answer,
      category: data.category,
      order: data.order ?? 0,
      isActive: data.isActive ?? true,
    },
  });
};

const updateFaq = async (id: string, data: Partial<FaqInput>) => {
  await getFaqById(id);

  return prisma.faq.update({
    where: { id },
    data: {
      ...(data.question !== undefined && { question: data.question }),
      ...(data.answer !== undefined && { answer: data.answer }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.order !== undefined && { order: data.order }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
};

const deleteFaq = async (id: string) => {
  await getFaqById(id);
  await prisma.faq.delete({ where: { id } });

  return "FAQ deleted successfully";
};

export const faqService = {
  getPublicFaqs,
  getAllFaqs,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq,
};
