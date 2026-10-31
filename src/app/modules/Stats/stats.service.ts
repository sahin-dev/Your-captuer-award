import { ContestParticipantStatus, ContestStatus } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { getOnlineCount } from "../../../helpers/websocketSetUp";
import { versionedCache } from "../../../shared/versionedCache";

const countPlayersInActiveContests = async () => {
  const activeContests = await prisma.contest.findMany({
    where: { status: ContestStatus.ACTIVE },
    select: { id: true },
  });
  const activePlayers = await prisma.contestParticipant.findMany({
    where: {
      contestId: { in: activeContests.map((contest) => contest.id) },
      status: ContestParticipantStatus.ACTIVE,
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  return activePlayers.length;
};

export const getSiteStats = () =>
  versionedCache.get(
    "site-stats",
    "summary",
    {},
    async () => {
      const [online, playingNow] = await Promise.all([getOnlineCount(), countPlayersInActiveContests()]);
      return { online, playingNow };
    },
    { ttlSeconds: 15 },
  );
