import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import { YCLevel } from "../../../prismaClient";

/**
 * Participant Level Management Service
 * Handles level progression based on votes/exposure
 * 
 * Level Progression:
 * NEW: 0-10 votes
 * AMATEUR: 11-50 votes
 * TALENTED: 51-150 votes
 * SUPREME: 151-300 votes
 * SUPERIOR: 301-500 votes
 * TOP_NOTCH: 500+ votes
 */

const LEVEL_MILESTONES: Record<YCLevel, number> = {
  NEW: 0,
  AMATEUR: 11,
  TALENTED: 51,
  SUPREME: 151,
  SUPERIOR: 301,
  TOP_NOTCH: 501,
};

const LEVEL_ORDER: YCLevel[] = ["NEW", "AMATEUR", "TALENTED", "SUPREME", "SUPERIOR", "TOP_NOTCH"];

/**
 * Get current level based on vote count
 */
function getLevelFromVotes(voteCount: number): YCLevel {
  if (voteCount >= LEVEL_MILESTONES.TOP_NOTCH) return "TOP_NOTCH";
  if (voteCount >= LEVEL_MILESTONES.SUPERIOR) return "SUPERIOR";
  if (voteCount >= LEVEL_MILESTONES.SUPREME) return "SUPREME";
  if (voteCount >= LEVEL_MILESTONES.TALENTED) return "TALENTED";
  if (voteCount >= LEVEL_MILESTONES.AMATEUR) return "AMATEUR";
  return "NEW";
}

/**
 * Check if participant leveled up and return milestone info
 */
async function checkLevelUpMilestone(participantId: string, totalVotes: number) {
  const participant = await prisma.contestParticipant.findUnique({
    where: { id: participantId },
    select: { level: true },
  });

  if (!participant) {
    throw new ApiError(httpStatus.NOT_FOUND, "Participant not found");
  }

  const newLevel = getLevelFromVotes(totalVotes);
  const levelChanged = participant.level !== newLevel;

  return {
    levelChanged,
    oldLevel: participant.level,
    newLevel,
    totalVotes,
    nextMilestone:
      LEVEL_ORDER.indexOf(newLevel) < LEVEL_ORDER.length - 1
        ? LEVEL_MILESTONES[LEVEL_ORDER[LEVEL_ORDER.indexOf(newLevel) + 1]]
        : null,
  };
}

/**
 * Update participant level based on current votes
 * Called after every vote is added
 */
async function updateParticipantLevel(participantId: string) {
  try {
    const participant = await prisma.contestParticipant.findUnique({
      where: { id: participantId },
      include: { photos: { select: { votes: { select: { id: true } } } } },
    });

    if (!participant) {
      throw new ApiError(httpStatus.NOT_FOUND, "Participant not found");
    }

    // Count total votes for all photos
    const totalVotes = participant.photos.reduce((sum, photo) => sum + photo.votes.length, 0);

    const newLevel = getLevelFromVotes(totalVotes);

    // Update if level changed
    if (participant.level !== newLevel) {
      await prisma.contestParticipant.update({
        where: { id: participantId },
        data: { level: newLevel },
      });

      console.log(
        `[Level Up] Participant ${participantId} promoted from ${participant.level} to ${newLevel} (${totalVotes} votes)`
      );

      return {
        levelChanged: true,
        oldLevel: participant.level,
        newLevel,
        totalVotes,
      };
    }

    return {
      levelChanged: false,
      level: newLevel,
      totalVotes,
    };
  } catch (error) {
    console.error(`[Level Update Error] Failed to update participant level:`, error);
    throw error;
  }
}

/**
 * Get participant level statistics
 */
async function getParticipantLevelStats(participantId: string) {
  const participant = await prisma.contestParticipant.findUnique({
    where: { id: participantId },
    select: {
      level: true,
      photos: {
        select: {
          votes: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!participant) {
    throw new ApiError(httpStatus.NOT_FOUND, "Participant not found");
  }

  const totalVotes = participant.photos.reduce((sum, photo) => sum + photo.votes.length, 0);
  const currentLevelIndex = LEVEL_ORDER.indexOf(participant.level);
  const currentMilestone = LEVEL_MILESTONES[participant.level];
  const nextLevelIndex = currentLevelIndex + 1;
  const nextMilestone =
    nextLevelIndex < LEVEL_ORDER.length ? LEVEL_MILESTONES[LEVEL_ORDER[nextLevelIndex]] : null;

  const votesUntilNextLevel = nextMilestone ? nextMilestone - totalVotes : null;

  return {
    currentLevel: participant.level,
    totalVotes,
    currentLevelIndex,
    nextLevel: nextLevelIndex < LEVEL_ORDER.length ? LEVEL_ORDER[nextLevelIndex] : null,
    currentMilestone,
    nextMilestone,
    votesUntilNextLevel: votesUntilNextLevel !== null && votesUntilNextLevel > 0 ? votesUntilNextLevel : 0,
    progress: nextMilestone ? ((totalVotes - currentMilestone) / (nextMilestone - currentMilestone)) * 100 : 100,
  };
}

/**
 * Get all participants at a specific level
 */
async function getParticipantsByLevel(contestId: string, level: YCLevel) {
  return await prisma.contestParticipant.findMany({
    where: { contestId, level },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
    },
  });
}

/**
 * Rank participants by level and votes
 */
async function rankParticipantsByPerformance(contestId: string) {
  const participants = await prisma.contestParticipant.findMany({
    where: { contestId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      photos: {
        select: {
          votes: { select: { id: true } },
        },
      },
    },
  });

  // Calculate votes and rank
  const ranked = participants
    .map((p) => ({
      participantId: p.id,
      userId: p.userId,
      user: p.user,
      level: p.level,
      totalVotes: p.photos.reduce((sum, photo) => sum + photo.votes.length, 0),
    }))
    .sort((a, b) => {
      // Sort by vote count descending
      const voteDiff = b.totalVotes - a.totalVotes;
      if (voteDiff !== 0) return voteDiff;

      // Then by level
      return LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level);
    });

  return ranked.map((p, index) => ({
    ...p,
    rank: index + 1,
  }));
}

export const participantLevelService = {
  getLevelFromVotes,
  checkLevelUpMilestone,
  updateParticipantLevel,
  getParticipantLevelStats,
  getParticipantsByLevel,
  rankParticipantsByPerformance,
  LEVEL_MILESTONES,
};
