import { ContestParticipantStatus, ContestStatus } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { getOnlineCount } from "../../../helpers/websocketSetUp";
import { versionedCache } from "../../../shared/versionedCache";

export const getSiteStats = async () => {
  const online = getOnlineCount();

  const playingNow = await versionedCache.get(
    "site-stats",
    "playing-now",
    {},
    async () => {
      const activePlayers = await prisma.contestParticipant.findMany({
        where: {
          status: ContestParticipantStatus.ACTIVE,
          contest: { status: ContestStatus.ACTIVE },
        },
        select: { userId: true },
        distinct: ["userId"],
      });

      return activePlayers.length;
    },
    { ttlSeconds: 15 },
  );

  return {
    online,
    playingNow,
  };
};
