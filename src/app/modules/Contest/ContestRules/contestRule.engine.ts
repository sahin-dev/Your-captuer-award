import httpStatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import { Contest, ContestParticipant, ContestParticipantStatus, ContestPhoto, User } from "../../../../prismaClient";
import {
  ContestRuleKey,
  isContestRuleKey,
  LevelRequirementValue,
  SubmissionFormatValue,
} from "./contestRule.definitions";
import { contestRuleService } from "./contestRules.service";
import { getTeammateUserIds } from "../../../../helpers/teammate.helper";
import { activeContestWhere } from "../contestLifecycle";
import { readImageDimensions as getImageDimensions } from "../../../../helpers/imageMetadata";
import { normalizeImageMimeType } from "../../../../shared/uploadFormats";

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
  files?: Express.Multer.File[];
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

  // Uploading a photo implies acceptance of the contractual join rules.
  // `minAge` on the ELIGIBILITY rule is displayed copy only - it is deliberately
  // not enforced here, so joining is never gated on the user's date of birth.
  if (autoAccept) {
    await Promise.all(requiredRuleKeys.map((key) => prisma.contestRuleAcceptance.upsert({
      where: { contestId_userId_key: { contestId, userId, key } },
      update: { acceptedAt: new Date() },
      create: { contestId, userId, key },
    })));
  }

  const submittedRuleKeys = autoAccept
    ? requiredRuleKeys
    : parseAcceptedRuleKeys(acceptedRuleKeysInput).filter(isContestRuleKey);
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
    ? await prisma.contestPhoto.count({ where: { contestId, participantId, photoId: { not: null } } })
    : 0;

  if (existingUploadCount + incomingUploadCount > submissionLimit) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Maximum upload limit exceeded");
  }
};

// A submission can arrive as freshly uploaded files or as ids of photos the
// user already has in their gallery. Both are checked against the same rule -
// otherwise uploading to the gallery first would be a way around the contest's
// allowed formats, minimum resolution and size cap.
type SubmissionCandidate = {
  label: string;
  mimeType: string | null;
  sizeBytes: number | null;
  dimensions: { width: number; height: number } | null;
};

const describeFileCandidate = (file: Express.Multer.File): SubmissionCandidate => ({
  label: file.originalname,
  mimeType: file.mimetype ? normalizeImageMimeType(file.mimetype) : null,
  sizeBytes: Number.isFinite(file.size) ? file.size : null,
  dimensions: getImageDimensions(file),
});

// Photos uploaded before format metadata was recorded carry none of it, and
// there is no fair way to hold an existing gallery to a rule that did not exist
// when those photos were stored. They are grandfathered: submitted as-is, with
// no format, resolution or size check. Everything uploaded from now on records
// its metadata at upload time and is checked normally.
const describeStoredPhotoCandidate = (photo: {
  id: string;
  title: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
}): SubmissionCandidate | null => {
  if (!photo.mimeType || !photo.width || !photo.height) {
    return null;
  }

  return {
    label: photo.title || "photo",
    mimeType: normalizeImageMimeType(photo.mimeType),
    sizeBytes: photo.sizeBytes,
    dimensions: { width: photo.width, height: photo.height },
  };
};

const validateSubmissionFormat = async (
  contestId: string,
  files: Express.Multer.File[] = [],
  photoIds: string[] = []
) => {
  if (files.length === 0 && photoIds.length === 0) {
    return;
  }

  const format = await contestRuleService.getEnabledRuleValue<SubmissionFormatValue>(contestId, "SUBMISSION_FORMAT");
  if (!format) {
    return;
  }
  const normalizedMimeTypes = format.mimeTypes.map(normalizeImageMimeType);
  const maxSizeBytes = format.maxSizeMB * 1024 * 1024;

  const storedPhotos = photoIds.length > 0
    ? await prisma.userPhoto.findMany({
        where: { id: { in: photoIds } },
        select: { id: true, title: true, mimeType: true, width: true, height: true, sizeBytes: true },
      })
    : [];

  const candidates: SubmissionCandidate[] = [
    ...files.map(describeFileCandidate),
    // Grandfathered photos describe as null and drop out here.
    ...storedPhotos.flatMap((photo) => {
      const candidate = describeStoredPhotoCandidate(photo);
      return candidate ? [candidate] : [];
    }),
  ];

  for (const candidate of candidates) {
    if (!candidate.mimeType || !normalizedMimeTypes.includes(candidate.mimeType)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `${candidate.label}: photo format is not allowed for this contest`);
    }
    if (candidate.sizeBytes !== null && candidate.sizeBytes > maxSizeBytes) {
      throw new ApiError(httpStatus.BAD_REQUEST, `${candidate.label}: photo size must be ${format.maxSizeMB}MB or less`);
    }

    if (!candidate.dimensions) {
      throw new ApiError(httpStatus.BAD_REQUEST, `${candidate.label}: unable to read photo dimensions`);
    }
    if (candidate.dimensions.width < format.minWidth || candidate.dimensions.height < format.minHeight) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${candidate.label}: photo resolution must be at least ${format.minWidth}px x ${format.minHeight}px`
      );
    }
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
  const incomingUploadCount = payload.files?.length || payload.photoIds?.length || 0;

  await validateSubmissionLimit(payload.contestId, payload.participantId, incomingUploadCount);
  await validateSubmissionFormat(payload.contestId, payload.files, payload.photoIds);
  await validateSubmissionRules(payload.contestId, payload.photoIds);

  if (payload.isJoiningThroughUpload) {
    await validateJoinRules(payload.contestId, payload.userId, payload.acceptedRuleKeys, true);
  }
};

type VotingPhoto = ContestPhoto & { participant: ContestParticipant };

// Records the caller already loaded, so validation does not fetch them again.
type VotingPreloaded = {
  contest?: Contest;
  user?: User;
  contestPhotos?: VotingPhoto[];
};

/**
 * Validates one ballot (one or more photos) for a voter. Everything that
 * depends only on the voter - the VOTING rule, their participant record and
 * their teammates - is loaded once, in parallel, instead of once per photo.
 * Checks run in the same order as before so the error a user sees is unchanged.
 */
const validateVotingRules = async (
  contestId: string,
  userId: string,
  photoIds: string[],
  preloaded: VotingPreloaded = {}
): Promise<{ voterParticipant: ContestParticipant | null }> => {
  const preloadedPhotoById = new Map((preloaded.contestPhotos ?? []).map((photo) => [photo.id, photo]));
  const missingPhotoIds = photoIds.filter((id) => !preloadedPhotoById.has(id));

  const [voting, contest, user, voterParticipant, loadedPhotos, teammateUserIds] = await Promise.all([
    contestRuleService.getEnabledRuleValue<VotingValue>(contestId, "VOTING"),
    preloaded.contest ?? prisma.contest.findFirst({ where: { id: contestId, ...activeContestWhere() } }),
    preloaded.user ?? prisma.user.findUnique({ where: { id: userId } }),
    prisma.contestParticipant.findFirst({
      where: { contestId, userId, status: ContestParticipantStatus.ACTIVE },
    }),
    missingPhotoIds.length > 0
      ? prisma.contestPhoto.findMany({
          where: {
            contestId,
            id: { in: missingPhotoIds },
            photoId: { not: null },
            participant: { status: ContestParticipantStatus.ACTIVE },
          },
          include: { participant: true },
        })
      : Promise.resolve([] as VotingPhoto[]),
    getTeammateUserIds(userId),
  ]);

  if (!contest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contest not found");
  }

  if (voting?.membersOnly && !user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (voting?.requireContestParticipant && !voterParticipant) {
    throw new ApiError(httpStatus.NOT_FOUND, "Participant not found");
  }

  const photoById = new Map([...preloadedPhotoById, ...loadedPhotos.map((photo) => [photo.id, photo] as const)]);
  for (const photoId of photoIds) {
    const contestPhoto = photoById.get(photoId);
    if (!contestPhoto) {
      throw new ApiError(httpStatus.NOT_FOUND, "Contest photo not found");
    }

    if (contestPhoto.participant.userId === userId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "You are not allowed to vote on your own photo");
    }

    if (teammateUserIds.includes(contestPhoto.participant.userId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "You are not allowed to vote on your teammate's photo");
    }
  }

  return { voterParticipant };
};

const getLevelRequirements = async (contestId: string) => {
  return (await contestRuleService.getEnabledRuleValue<LevelRequirementValue[]>(contestId, "LEVEL_REQUIREMENTS")) || [];
};

export const contestRuleEngine = {
  // Exposed so the trade/replace paths enforce the same SUBMISSION_FORMAT rule
  // as a first-time submission - a photo swapped into a contest is just as much
  // a contest entry as one uploaded into it.
  validateSubmissionFormat,
  parseAcceptedRuleKeys,
  validateJoinRules,
  validateUploadRules,
  validateVotingRules,
  getLevelRequirements,
};
