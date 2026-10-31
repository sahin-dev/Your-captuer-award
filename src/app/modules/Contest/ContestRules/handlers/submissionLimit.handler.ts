import httpStatus from "http-status";
import ApiError from "../../../../../errors/ApiError";
import prisma from "../../../../../shared/prisma";
import { RuleHandler } from "./ruleHandler";

export const submissionLimitHandler: RuleHandler<number> = {
  summarize: (limit) => `${limit} photo submits per participant`,

  async onUpload({ contestId, participantId, files, photoIds }, limit) {
    const incomingUploadCount = files.length || photoIds.length;
    const existingUploadCount = participantId
      ? await prisma.contestPhoto.count({ where: { contestId, participantId, photoId: { not: null } } })
      : 0;

    if (existingUploadCount + incomingUploadCount > limit) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Maximum upload limit exceeded");
    }
  },
};
