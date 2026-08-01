import { ContestParticipantStatus, ContestRankingScope } from "../../../../prismaClient";
import type { Prisma, YCLevel } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";
import { ycLevels } from "../../Awards/award.definitions";
import { getVoteWeight } from "../../Vote/voteWeight.service";
import { contestRuleEngine } from "../ContestRules/contestRule.engine";
import { LevelRequirementValue } from "../ContestRules/contestRule.definitions";

export const CONTEST_SCORING_VERSION = 1;

export type RankedPhoto = {
  photoId: string;
  userPhotoId: string;
  participantId: string;
  userId: string;
  score: number;
  rank: number;
  createdAt: Date;
  tieBreakKey: string;
};

export type RankedPhotographer = {
  participantId: string;
  userId: string;
  score: number;
  rank: number;
  level: YCLevel;
  createdAt: Date;
  tieBreakKey: string;
};

export type ContestRanking = {
  contestId: string;
  scoringVersion: number;
  photos: RankedPhoto[];
  photographers: RankedPhotographer[];
};

const ycLevelByRuleLevel: Record<LevelRequirementValue["level"], YCLevel> = {
  AMATEUR: ycLevels.AMATEUR,
  TALENTED: ycLevels.TALENTED,
  SUPREME: ycLevels.SUPREME,
  SUPERIOR: ycLevels.SUPERIOR,
  TOP_NOTCH: ycLevels.TOP_NOTCH,
};

export const getContestLevelForScore = (score: number, requirements: LevelRequirementValue[]) => {
  let level: YCLevel = ycLevels.NEW;

  [...requirements]
    .sort((left, right) => left.votes - right.votes)
    .forEach((requirement) => {
      if (score >= requirement.votes) {
        level = ycLevelByRuleLevel[requirement.level];
      }
    });

  return level;
};

const compareByScoreAndTieBreak = <T extends {score: number; createdAt: Date; tieBreakKey: string}>(left: T, right: T) => {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();
  return createdAtDifference || left.tieBreakKey.localeCompare(right.tieBreakKey);
};

const buildContestRanking = async (contestId: string): Promise<ContestRanking> => {
  const [participants, votes, levelRequirements] = await Promise.all([
    prisma.contestParticipant.findMany({
      where: { contestId, status: ContestParticipantStatus.ACTIVE },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        photos: {
          select: {
            id: true,
            photoId: true,
            initialVotes: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.vote.findMany({
      where: { contestId },
      select: { photoId: true, weight: true, power: true },
    }),
    contestRuleEngine.getLevelRequirements(contestId),
  ]);

  const voteScoreByPhoto = new Map<string, number>();
  votes.forEach((vote) => {
    voteScoreByPhoto.set(vote.photoId, (voteScoreByPhoto.get(vote.photoId) || 0) + getVoteWeight(vote));
  });

  const photos = participants
    .flatMap((participant) => participant.photos.map((photo) => ({
      photoId: photo.id,
      userPhotoId: photo.photoId,
      participantId: participant.id,
      userId: participant.userId,
      score: (voteScoreByPhoto.get(photo.id) || 0) + (photo.initialVotes || 0),
      createdAt: photo.createdAt,
      tieBreakKey: photo.id,
    })))
    .sort(compareByScoreAndTieBreak)
    .map((photo, index) => ({ ...photo, rank: index + 1 }));

  const photoScoreByParticipant = new Map<string, number>();
  photos.forEach((photo) => {
    photoScoreByParticipant.set(
      photo.participantId,
      (photoScoreByParticipant.get(photo.participantId) || 0) + photo.score
    );
  });

  const photographers = participants
    .filter((participant) => participant.photos.length > 0)
    .map((participant) => {
      const score = photoScoreByParticipant.get(participant.id) || 0;
      return {
        participantId: participant.id,
        userId: participant.userId,
        score,
        level: getContestLevelForScore(score, levelRequirements),
        createdAt: participant.createdAt,
        tieBreakKey: participant.id,
      };
    })
    .sort(compareByScoreAndTieBreak)
    .map((participant, index) => ({ ...participant, rank: index + 1 }));

  return {
    contestId,
    scoringVersion: CONTEST_SCORING_VERSION,
    photos,
    photographers,
  };
};

const persistContestRanking = async (tx: Prisma.TransactionClient, ranking: ContestRanking) => {
  await tx.contestRankingResult.deleteMany({ where: { contestId: ranking.contestId } });

  const photoResults = ranking.photos.map((photo) => ({
    resultKey: `${ranking.contestId}:PHOTO:${photo.photoId}`,
    contestId: ranking.contestId,
    scope: ContestRankingScope.PHOTO,
    participantId: photo.participantId,
    photoId: photo.photoId,
    score: photo.score,
    rank: photo.rank,
    tieBreakKey: `${photo.createdAt.toISOString()}:${photo.tieBreakKey}`,
    scoringVersion: ranking.scoringVersion,
  }));
  const photographerResults = ranking.photographers.map((photographer) => ({
    resultKey: `${ranking.contestId}:PHOTOGRAPHER:${photographer.participantId}`,
    contestId: ranking.contestId,
    scope: ContestRankingScope.PHOTOGRAPHER,
    participantId: photographer.participantId,
    score: photographer.score,
    rank: photographer.rank,
    level: photographer.level,
    tieBreakKey: `${photographer.createdAt.toISOString()}:${photographer.tieBreakKey}`,
    scoringVersion: ranking.scoringVersion,
  }));

  if (photoResults.length + photographerResults.length > 0) {
    await tx.contestRankingResult.createMany({ data: [...photoResults, ...photographerResults] });
  }

  await Promise.all(ranking.photographers.map((photographer) =>
    tx.contestParticipant.update({
      where: { id: photographer.participantId },
      data: { rank: photographer.rank, level: photographer.level },
    })
  ));

  await Promise.all(ranking.photos.map((photo) =>
    tx.contestPhoto.update({ where: { id: photo.photoId }, data: { rank: photo.rank } })
  ));
};

const getPersistedContestRanking = async (contestId: string, scope: ContestRankingScope) => {
  return prisma.contestRankingResult.findMany({
    where: { contestId, scope },
    orderBy: { rank: "asc" },
  });
};

export const contestRankingService = {
  buildContestRanking,
  persistContestRanking,
  getPersistedContestRanking,
};
