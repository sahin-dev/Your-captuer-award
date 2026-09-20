import { ContestStatus, Prisma } from "../../../prismaClient";

/** Database guard for operations that are legal only while voting is open. */
export const activeContestWhere = (now = new Date()): Prisma.ContestWhereInput => ({
  status: ContestStatus.ACTIVE,
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
  startDate: { lte: now },
  endDate: { gt: now },
});
