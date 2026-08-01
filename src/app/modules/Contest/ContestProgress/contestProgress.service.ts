import type { PrizeType, YCLevel } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";
import { achievementService } from "../../Achievements/achievement.service";
import { prizeTypes, ycLevels } from "../../Awards/award.definitions";
import { getVoteWeight } from "../../Vote/voteWeight.service";
import { contestRuleEngine } from "../ContestRules/contestRule.engine";
import { getContestLevelForScore } from "../ContestRanking/contestRanking.service";

const achievementByLevel: Partial<Record<YCLevel, PrizeType>> = {
  [ycLevels.AMATEUR]: prizeTypes.AMATEUR,
  [ycLevels.TALENTED]: prizeTypes.TALENTED,
  [ycLevels.SUPREME]: prizeTypes.SUPREME,
  [ycLevels.SUPERIOR]: prizeTypes.SUPERIOR,
  [ycLevels.TOP_NOTCH]: prizeTypes.TOP_NOTCH,
};

const levelOrder: Record<YCLevel, number> = {
  [ycLevels.NEW]: 0,
  [ycLevels.AMATEUR]: 1,
  [ycLevels.TALENTED]: 2,
  [ycLevels.SUPREME]: 3,
  [ycLevels.SUPERIOR]: 4,
  [ycLevels.TOP_NOTCH]: 5,
};

const evaluateParticipantLevel = async (contestId: string, participantId: string) => {
  const [participant, votes, requirements] = await Promise.all([
    prisma.contestParticipant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        level: true,
        photos: { select: { id: true, initialVotes: true } },
      },
    }),
    prisma.vote.findMany({
      where: { contestId, photo: { participantId } },
      select: { weight: true, power: true },
    }),
    contestRuleEngine.getLevelRequirements(contestId),
  ]);

  if (!participant || requirements.length === 0) {
    return null;
  }

  const score = votes.reduce((total, vote) => total + getVoteWeight(vote), 0)
    + participant.photos.reduce((total, photo) => total + (photo.initialVotes || 0), 0);
  const eligibleLevel = getContestLevelForScore(score, requirements);
  const targetLevel = levelOrder[eligibleLevel] > levelOrder[participant.level]
    ? eligibleLevel
    : participant.level;

  if (targetLevel !== participant.level) {
    await prisma.contestParticipant.update({
      where: { id: participant.id },
      data: { level: targetLevel },
    });
  }

  const achievement = achievementByLevel[targetLevel];
  if (achievement) {
    await achievementService.upsertContestLevelAchievement(participant.id, contestId, achievement);
  }

  return { participantId, score, level: targetLevel };
};

export const contestProgressService = {
  evaluateParticipantLevel,
};
