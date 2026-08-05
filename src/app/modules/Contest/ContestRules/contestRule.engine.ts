import httpStatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import { ContestParticipant, ContestStatus } from "../../../../prismaClient";
import {
  ContestRuleKey,
  isContestRuleKey,
  LevelRequirementValue,
  SubmissionFormatValue,
} from "./contestRule.definitions";
import { contestRuleService } from "./contestRules.service";
import { imageSize } from "image-size";

type LegacySubmissionRulesValue = {
  allowAiImages?: boolean;
  duplicatePolicy?: "ALLOW" | "DISALLOW_SAME_PHOTO";
};

type EligibilityValue = {
  minAge?: number;
  requiresAcceptance?: boolean;
};

type CopyrightValue = {
  requiresOwnership?: boolean;
  requiresAcceptance?: boolean;
};

type VotingValue = {
  membersOnly?: boolean;
  requireContestParticipant?: boolean;
  disallowSelfVote?: boolean;
};

type ParticipationValue = {
  requiresTermsAcceptance?: boolean;
};

type UploadValidationPayload = {
  contestId: string;
  userId: string;
  participantId?: string;
  file?: Express.Multer.File;
  photoIds?: string[];
  acceptedRuleKeys?: unknown;
  isJoiningThroughUpload?: boolean;
};

const parseAcceptedRuleKeys = (acceptedRuleKeys?: unknown): ContestRuleKey[] => {
  if (!acceptedRuleKeys) {
    return [];
  }

  if (Array.isArray(acceptedRuleKeys)) {
    return acceptedRuleKeys as ContestRuleKey[];
  }

  if (typeof acceptedRuleKeys === "string") {
    const trimmed = acceptedRuleKeys.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? (parsed as ContestRuleKey[]) : [];
    } catch {
      return trimmed.split(",").map((key) => key.trim()) as ContestRuleKey[];
    }
  }

  return [];
};

const requireAcceptedRule = (
  acceptedRuleKeys: ContestRuleKey[],
  ruleKey: ContestRuleKey,
  message: string
) => {
  if (!acceptedRuleKeys.includes(ruleKey)) {
    throw new ApiError(httpStatus.BAD_REQUEST, message);
  }
};

const calculateAge = (date: Date) => {
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }

  return age;
};

const getUserBirthDate = (user: Record<string, unknown>) => {
  const value = user.dateOfBirth || user.birthDate || user.dob;
  if (!value) {
    return null;
  }

  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getImageDimensions = (file: Express.Multer.File) => {
  try {
    const dimensions = imageSize(file.buffer);
    if (dimensions.width && dimensions.height) {
      return { width: dimensions.width, height: dimensions.height };
    }
  } catch {
    return null;
  }

  return null;
};

const validateJoinRules = async (
  contestId: string,
  userId: string,
  acceptedRuleKeysInput?: unknown,
  autoAccept = false
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  const eligibility = await contestRuleService.getEnabledRuleValue<EligibilityValue>(contestId, "ELIGIBILITY");
  const copyright = await contestRuleService.getEnabledRuleValue<CopyrightValue>(contestId, "COPYRIGHT");
  const participation = await contestRuleService.getEnabledRuleValue<ParticipationValue>(contestId, "PARTICIPATION");

  const requiredRuleKeys: ContestRuleKey[] = [];
  if (eligibility?.requiresAcceptance) {
    requiredRuleKeys.push("ELIGIBILITY");
  }
  if (copyright && (copyright.requiresAcceptance || copyright.requiresOwnership)) {
    requiredRuleKeys.push("COPYRIGHT");
  }
  if (participation?.requiresTermsAcceptance) {
    requiredRuleKeys.push("PARTICIPATION");
  }

  // Uploading a photo implies acceptance of the join rules, so record acceptance
  // without requiring the client to send acceptedRuleKeys or blocking on minAge.
  if (autoAccept) {
    await Promise.all(requiredRuleKeys.map((key) => prisma.contestRuleAcceptance.upsert({
      where: { contestId_userId_key: { contestId, userId, key } },
      update: { acceptedAt: new Date() },
      create: { contestId, userId, key },
    })));
    return;
  }

  const submittedRuleKeys = parseAcceptedRuleKeys(acceptedRuleKeysInput).filter(isContestRuleKey);
  const savedAcceptances = await prisma.contestRuleAcceptance.findMany({
    where: { contestId, userId },
    select: { key: true },
  });
  const acceptedRuleKeys = Array.from(new Set([
    ...savedAcceptances.map((acceptance) => acceptance.key).filter(isContestRuleKey),
    ...submittedRuleKeys,
  ]));

  if (requiredRuleKeys.includes("ELIGIBILITY")) {
    requireAcceptedRule(
      acceptedRuleKeys,
      "ELIGIBILITY",
      "Eligibility rule must be accepted before joining this contest"
    );
  }

  if (eligibility?.minAge) {
    const birthDate = getUserBirthDate(user as unknown as Record<string, unknown>);
    if (!birthDate) {
      throw new ApiError(httpStatus.BAD_REQUEST, "A valid birth date is required for this contest");
    }
    if (calculateAge(birthDate) < eligibility.minAge) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `You must be at least ${eligibility.minAge} years old to join this contest`
      );
    }
  }

  if (requiredRuleKeys.includes("COPYRIGHT")) {
    requireAcceptedRule(
      acceptedRuleKeys,
      "COPYRIGHT",
      "Copyright rule must be accepted before joining this contest"
    );
  }

  if (requiredRuleKeys.includes("PARTICIPATION")) {
    requireAcceptedRule(
      acceptedRuleKeys,
      "PARTICIPATION",
      "Participation terms must be accepted before joining this contest"
    );
  }

  await Promise.all(submittedRuleKeys.map((key) => prisma.contestRuleAcceptance.upsert({
    where: { contestId_userId_key: { contestId, userId, key } },
    update: { acceptedAt: new Date() },
    create: { contestId, userId, key },
  })));
};

const validateSubmissionLimit = async (
  contestId: string,
  participantId: string | undefined,
  incomingUploadCount: number
) => {
  const submissionLimit = await contestRuleService.getEnabledRuleValue<number>(contestId, "SUBMISSION_LIMIT");
  if (submissionLimit === null) {
    return;
  }
  const existingUploadCount = participantId
    ? await prisma.contestPhoto.count({ where: { contestId, participantId } })
    : 0;

  if (existingUploadCount + incomingUploadCount > submissionLimit) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Maximum upload limit exceeded");
  }
};

const validateSubmissionFormat = async (contestId: string, file?: Express.Multer.File) => {
  if (!file) {
    return;
  }

  const format = await contestRuleService.getEnabledRuleValue<SubmissionFormatValue>(contestId, "SUBMISSION_FORMAT");
  if (!format) {
    return;
  }
  const normalizedMimeTypes = format.mimeTypes.map((mimeType) => mimeType.toLowerCase());

  if (!normalizedMimeTypes.includes(file.mimetype.toLowerCase())) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Photo format is not allowed for this contest");
  }

  const maxSizeBytes = format.maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Photo size must be ${format.maxSizeMB}MB or less`);
  }

  const dimensions = getImageDimensions(file);
  if (!dimensions) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Unable to read photo dimensions");
  }
  if (dimensions.width < format.minWidth || dimensions.height < format.minHeight) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Photo resolution must be at least ${format.minWidth}px x ${format.minHeight}px`
    );
  }
};

const validateSubmissionRules = async (contestId: string, photoIds?: string[]) => {
  const submissionRules = await contestRuleService.getEnabledRuleValue<string[] | LegacySubmissionRulesValue>(
    contestId,
    "SUBMISSION_RULES"
  );

  const duplicatePolicy = Array.isArray(submissionRules)
    ? "DISALLOW_SAME_PHOTO"
    : submissionRules?.duplicatePolicy;

  if (duplicatePolicy === "DISALLOW_SAME_PHOTO" && photoIds && photoIds.length > 0) {
    const alreadySubmitted = await prisma.contestPhoto.findFirst({
      where: { contestId, photoId: { in: photoIds } },
    });

    if (alreadySubmitted) {
      throw new ApiError(httpStatus.BAD_REQUEST, "This photo has already been submitted to the contest");
    }
  }
};

const validateUploadRules = async (payload: UploadValidationPayload) => {
  const incomingUploadCount = payload.file ? 1 : payload.photoIds?.length || 0;

  await validateSubmissionLimit(payload.contestId, payload.participantId, incomingUploadCount);
  await validateSubmissionFormat(payload.contestId, payload.file);
  await validateSubmissionRules(payload.contestId, payload.photoIds);

  if (payload.isJoiningThroughUpload) {
    await validateJoinRules(payload.contestId, payload.userId, payload.acceptedRuleKeys, true);
  }
};

const validateVotingRules = async (
  contestId: string,
  userId: string,
  photoId: string
): Promise<{ voterParticipant: ContestParticipant | null }> => {
  const voting = await contestRuleService.getEnabledRuleValue<VotingValue>(contestId, "VOTING");

  const contest = await prisma.contest.findUnique({ where: { id: contestId, status: ContestStatus.ACTIVE } });
  if (!contest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contest not found");
  }

  if (voting?.membersOnly) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }
  }

  const voterParticipant = await prisma.contestParticipant.findFirst({ where: { contestId, userId } });
  if (voting?.requireContestParticipant && !voterParticipant) {
    throw new ApiError(httpStatus.NOT_FOUND, "Participant not found");
  }

  const contestPhoto = await prisma.contestPhoto.findFirst({
    where: { contestId, id: photoId },
    include: { participant: true },
  });
  if (!contestPhoto) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contest photo not found");
  }

  if (voting?.disallowSelfVote && contestPhoto.participant.userId === userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "You are not allowed to vote yourself");
  }

  return { voterParticipant };
};

const getLevelRequirements = async (contestId: string) => {
  return (await contestRuleService.getEnabledRuleValue<LevelRequirementValue[]>(contestId, "LEVEL_REQUIREMENTS")) || [];
};

export const contestRuleEngine = {
  parseAcceptedRuleKeys,
  validateJoinRules,
  validateUploadRules,
  validateVotingRules,
  getLevelRequirements,
};
