import httpStatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import { Contest, ContestParticipant, ContestParticipantStatus, ContestPhoto, User } from "../../../../prismaClient";
import {
  ContestRuleKey,
  isContestRuleKey,
  LevelRequirementValue,
} from "./contestRule.definitions";
import { ContestRuleSet, contestRuleService } from "./contestRules.service";
import { acceptanceRuleOrder, ruleHandlers, uploadRuleOrder } from "./handlers";
import { UploadContext } from "./handlers/ruleHandler";
import { getTeammateUserIds } from "../../../../helpers/teammate.helper";
import { activeContestWhere } from "../contestLifecycle";

type VotingValue = {
  membersOnly?: boolean;
  requireContestParticipant?: boolean;
  disallowSelfVote?: boolean;
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

const saveRuleAcceptances = (contestId: string, userId: string, keys: ContestRuleKey[]) =>
  Promise.all(keys.map((key) => prisma.contestRuleAcceptance.upsert({
    where: { contestId_userId_key: { contestId, userId, key } },
    update: { acceptedAt: new Date() },
    create: { contestId, userId, key },
  })));

const validateJoinRules = async (
  contestId: string,
  userId: string,
  acceptedRuleKeysInput?: unknown,
  autoAccept = false
) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  const rules = await contestRuleService.loadRuleSet(contestId);
  const requiredRuleKeys = acceptanceRuleOrder.filter((key) => {
    const value = rules.value(key);
    return value !== null && ruleHandlers[key].acceptance?.isRequired(value);
  });

  // Uploading a photo implies acceptance of the contractual join rules.
  const submittedRuleKeys = autoAccept
    ? requiredRuleKeys
    : parseAcceptedRuleKeys(acceptedRuleKeysInput).filter(isContestRuleKey);
  if (autoAccept) {
    await saveRuleAcceptances(contestId, userId, submittedRuleKeys);
  }

  const savedAcceptances = await prisma.contestRuleAcceptance.findMany({
    where: { contestId, userId },
    select: { key: true },
  });
  const acceptedRuleKeys = new Set<string>([
    ...savedAcceptances.map((acceptance) => acceptance.key),
    ...submittedRuleKeys,
  ]);

  const missingKey = requiredRuleKeys.find((key) => !acceptedRuleKeys.has(key));
  if (missingKey) {
    throw new ApiError(httpStatus.BAD_REQUEST, ruleHandlers[missingKey].acceptance?.errorMessage);
  }

  if (!autoAccept) {
    await saveRuleAcceptances(contestId, userId, submittedRuleKeys);
  }
};

const runUploadRule = async (key: ContestRuleKey, rules: ContestRuleSet, context: UploadContext) => {
  const value = rules.value(key);
  if (value !== null) {
    await ruleHandlers[key].onUpload?.(context, value);
  }
};

// Exposed so the trade path enforces the same SUBMISSION_FORMAT rule as a
// first-time submission - a photo swapped into a contest is just as much a
// contest entry as one uploaded into it.
const validateSubmissionFormat = async (
  contestId: string,
  files: Express.Multer.File[] = [],
  photoIds: string[] = []
) => {
  const rules = await contestRuleService.loadRuleSet(contestId);
  await runUploadRule("SUBMISSION_FORMAT", rules, { contestId, files, photoIds });
};

// Returns the submission limit so the caller can check it again inside its
// transaction without loading the rules a second time.
const validateUploadRules = async (payload: UploadValidationPayload) => {
  const { contestId, userId, participantId, files = [], photoIds = [] } = payload;
  const rules = await contestRuleService.loadRuleSet(contestId);

  for (const key of uploadRuleOrder) {
    await runUploadRule(key, rules, { contestId, participantId, files, photoIds });
  }

  if (payload.isJoiningThroughUpload) {
    await validateJoinRules(contestId, userId, payload.acceptedRuleKeys, true);
  }

  return { submissionLimit: rules.value<number>("SUBMISSION_LIMIT") };
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
  validateSubmissionFormat,
  parseAcceptedRuleKeys,
  validateJoinRules,
  validateUploadRules,
  validateVotingRules,
  getLevelRequirements,
};
