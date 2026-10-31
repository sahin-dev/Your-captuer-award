import httpStatus from "http-status";
import ApiError from "../../../../../errors/ApiError";
import prisma from "../../../../../shared/prisma";
import { RuleHandler } from "./ruleHandler";

type LegacySubmissionRules = {
  intro?: string;
  disallowed?: string[];
  removalNotice?: string;
  allowAiImages?: boolean;
  duplicatePolicy?: "ALLOW" | "DISALLOW_SAME_PHOTO";
};

type SubmissionRulesValue = string[] | LegacySubmissionRules;

const toBulletList = (items: string[]) => items.map((item) => `- ${item}`);

export const submissionRulesHandler: RuleHandler<SubmissionRulesValue> = {
  summarize(value) {
    if (Array.isArray(value)) {
      return toBulletList(value).join("\n");
    }
    return [value?.intro, ...toBulletList(value?.disallowed || []), value?.removalNotice]
      .filter(Boolean)
      .join("\n");
  },

  async onUpload({ contestId, photoIds }, value) {
    const duplicatePolicy = Array.isArray(value) ? "DISALLOW_SAME_PHOTO" : value?.duplicatePolicy;
    if (duplicatePolicy !== "DISALLOW_SAME_PHOTO" || photoIds.length === 0) {
      return;
    }

    const alreadySubmitted = await prisma.contestPhoto.findFirst({
      where: { contestId, photoId: { in: photoIds } },
    });
    if (alreadySubmitted) {
      throw new ApiError(httpStatus.BAD_REQUEST, "This photo has already been submitted to the contest");
    }
  },
};
