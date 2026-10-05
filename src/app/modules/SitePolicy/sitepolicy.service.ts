import ApiError from "../../../errors/ApiError";
import { SitePolicyType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import httpStatus from "http-status";
import sanitizeHtml from "sanitize-html";
import { versionedCache } from "../../../shared/versionedCache";

const richContentOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
  },
};

const normalizeTitle = (title: unknown) => {
  if (typeof title !== "string") return undefined;
  return sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, 200);
};

const normalizeContent = (content: unknown) => {
  if (typeof content !== "string") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Content is required");
  }
  return sanitizeHtml(content.trim(), richContentOptions);
};

const addSitePolicy = async (
  content: string,
  policyType: SitePolicyType,
  title?: string,
) => {
  const cleanContent = normalizeContent(content);
  const cleanTitle = normalizeTitle(title);

  if (policyType === SitePolicyType.PHOTOGRAPHER_OF_THE_YEAR && !cleanTitle) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Title is required");
  }

  const existingPolicy = await prisma.sitePolicy.findFirst({
    where: { type: policyType },
  });

  if (existingPolicy) {
    return await updateSitePolicy(existingPolicy.id, cleanContent, cleanTitle);
  } else {
    const policy = await prisma.sitePolicy.create({
      data: { content: cleanContent, type: policyType, title: cleanTitle },
    });
    await versionedCache.invalidate("site-policy");
    return policy;
  }
};

const updateSitePolicy = async (
  policyId: string,
  content: string,
  title?: string,
) => {
  const existingPolicy = await prisma.sitePolicy.findUnique({
    where: { id: policyId },
  });

  if (!existingPolicy) {
    throw new ApiError(httpStatus.NOT_FOUND, "Site policy not found");
  }
  const policy = await prisma.sitePolicy.update({
    where: { id: policyId },
    data: { content, ...(title !== undefined ? { title } : {}) },
  });
  await versionedCache.invalidate("site-policy");
  return policy;
};

const getSitePolicies = async (type?: SitePolicyType) => {
  const policies = await versionedCache.get(
    "site-policy",
    "list",
    { type },
    () => prisma.sitePolicy.findMany({ where: { type: type } }),
  );
  if (!policies || policies.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "Site policy not found");
  }

  return policies;
};

export const SitePolicyService = {
  addSitePolicy,
  updateSitePolicy,
  getSitePolicies,
};
