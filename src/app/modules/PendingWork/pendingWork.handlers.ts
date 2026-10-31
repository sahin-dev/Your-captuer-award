import { TeamMemberStatus } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import logger from "../../../shared/logger";
import { contestProgressService } from "../Contest/ContestProgress/contestProgress.service";
import { levelService } from "../Level/level.service";
import { teamService } from "../Team/team.service";
import { PendingWorkItem, pendingWorkQueue, PendingWorkType } from "./pendingWork.queue";

// What to do for each kind of pending work. This file is the one place that
// knows about all the modules, so a module that adds work (Vote, Contest) only
// imports the queue and does not depend on Team or Level. Only the Agenda job
// imports this file.

const checkTeamMatchQueue = async (item: PendingWorkItem) => {
  const userId = item.targetId;
  const membership = await prisma.teamMember.findUnique({ where: { memberId: userId } });
  if (!membership || membership.status !== TeamMemberStatus.ACTIVE || !item.contestId) {
    return;
  }
  await teamService.checkAndAdvanceWaitingQueue(membership.teamId, item.contestId);
};

const handlers: Record<PendingWorkType, (item: PendingWorkItem) => Promise<unknown>> = {
  PARTICIPANT_LEVEL: (item) =>
    contestProgressService.evaluateParticipantLevel(item.contestId as string, item.targetId),
  USER_LEVEL: (item) => levelService.evaluateAndUpdateUserLevel(item.targetId),
  TEAM_QUEUE_CHECK: checkTeamMatchQueue,
};

const handlePendingWork = async (item: PendingWorkItem) => {
  const handler = handlers[item.type as PendingWorkType];
  if (!handler) {
    logger.error({ key: item.key }, "No handler for pending work type");
    return;
  }
  await handler(item);
};

export const drainPendingWork = () => pendingWorkQueue.drain(handlePendingWork);
