import { ContestParticipantStatus, ContestStatus } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { getOnlineCount } from "../../../helpers/websocketSetUp";

export const getSiteStats = async () => {
  const online = getOnlineCount();

  const activePlayers = await prisma.contestParticipant.findMany({
    where: {
      status: ContestParticipantStatus.ACTIVE,
      contest: { status: ContestStatus.ACTIVE },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  return {
    online,
    playingNow: activePlayers.length,
  };
};
