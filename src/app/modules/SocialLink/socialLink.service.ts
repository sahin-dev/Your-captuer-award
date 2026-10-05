import httpStatus from "http-status";
import ApiError from "../../../errors/ApiError";
import prisma from "../../../shared/prisma";
import { SocialPlatform } from "../../../prismaClient";
import { versionedCache } from "../../../shared/versionedCache";

type SocialLinkInput = {
  platform: SocialPlatform;
  url: string;
  order?: number;
  isActive?: boolean;
};

const getActiveSocialLinks = async () => {
  return versionedCache.get("social-link", "active", {}, () =>
    prisma.socialLink.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  );
};

const getAllSocialLinks = async () => {
  return versionedCache.get("social-link", "all", {}, () =>
    prisma.socialLink.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  );
};

const createSocialLink = async (data: SocialLinkInput) => {
  const socialLink = await prisma.socialLink.create({
    data: {
      platform: data.platform,
      url: data.url,
      order: data.order ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  await versionedCache.invalidate("social-link");
  return socialLink;
};

const updateSocialLink = async (id: string, data: Partial<SocialLinkInput>) => {
  const existing = await prisma.socialLink.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Social link not found");
  }

  const socialLink = await prisma.socialLink.update({
    where: { id },
    data: {
      ...(data.platform !== undefined && { platform: data.platform }),
      ...(data.url !== undefined && { url: data.url }),
      ...(data.order !== undefined && { order: data.order }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
  await versionedCache.invalidate("social-link");
  return socialLink;
};

const deleteSocialLink = async (id: string) => {
  const existing = await prisma.socialLink.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Social link not found");
  }

  await prisma.socialLink.delete({ where: { id } });
  await versionedCache.invalidate("social-link");
  return "Social link deleted successfully";
};

export const socialLinkService = {
  getActiveSocialLinks,
  getAllSocialLinks,
  createSocialLink,
  updateSocialLink,
  deleteSocialLink,
};
