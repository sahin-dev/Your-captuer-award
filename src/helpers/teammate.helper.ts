import { TeamMemberStatus } from "../prismaClient";
import prisma from "../shared/prisma";

// Returns the userIds of every active teammate of the given user (excluding the user themselves).
export const getTeammateUserIds = async (userId: string): Promise<string[]> => {
  const membership = await prisma.teamMember.findUnique({ where: { memberId: userId } });

  if (!membership || membership.status !== TeamMemberStatus.ACTIVE) {
    return [];
  }

  const teammates = await prisma.teamMember.findMany({
    where: {
      teamId: membership.teamId,
      memberId: { not: userId },
      status: TeamMemberStatus.ACTIVE,
    },
    select: { memberId: true },
  });

  return teammates.map((teammate) => teammate.memberId);
};
