import httpStatus from "http-status";
import ApiError from "../../../errors/ApiError";
import prisma from "../../../shared/prisma";
import { SocialPlatform } from "../../../prismaClient";

type SocialLinkInput = {
  platform: SocialPlatform;
  url: string;
  order?: number;
  isActive?: boolean;
};

const getActiveSocialLinks = async () => {
  return prisma.socialLink.findMany({
    where: { isActive: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
};

const getAllSocialLinks = async () => {
  return prisma.socialLink.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
};

const createSocialLink = async (data: SocialLinkInput) => {
  return prisma.socialLink.create({
    data: {
      platform: data.platform,
      url: data.url,
      order: data.order ?? 0,
      isActive: data.isActive ?? true,
    },
  });
};

const updateSocialLink = async (id: string, data: Partial<SocialLinkInput>) => {
  const existing = await prisma.socialLink.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Social link not found");
  }

  return prisma.socialLink.update({
    where: { id },
    data: {
      ...(data.platform !== undefined && { platform: data.platform }),
      ...(data.url !== undefined && { url: data.url }),
      ...(data.order !== undefined && { order: data.order }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
};

const deleteSocialLink = async (id: string) => {
  const existing = await prisma.socialLink.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Social link not found");
  }

  await prisma.socialLink.delete({ where: { id } });
  return "Social link deleted successfully";
};

export const socialLinkService = {
  getActiveSocialLinks,
  getAllSocialLinks,
  createSocialLink,
  updateSocialLink,
  deleteSocialLink,
};
