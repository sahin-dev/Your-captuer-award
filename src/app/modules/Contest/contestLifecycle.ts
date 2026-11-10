import { ContestStatus, Prisma } from "../../../prismaClient";
import prisma, { PrismaTx } from "../../../shared/prisma";

// Everything about a contest's status lives here: which changes are legal, and
// what each status allows. Other code should ask these helpers instead of
// keeping its own list of statuses.
//
//   UPCOMING -> ACTIVE -> FINALIZING -> COMPLETED
//                            |  ^  \
//                            v  |   -> CLOSED -> COMPLETED (Photographer of the Year)
//                   FINALIZATION_FAILED
//
// NEW, OPEN and JOINED are legacy values and are not part of this flow.

const allowedTransitions: Partial<Record<ContestStatus, ContestStatus[]>> = {
  [ContestStatus.UPCOMING]: [ContestStatus.ACTIVE],
  [ContestStatus.ACTIVE]: [ContestStatus.FINALIZING],
  // FINALIZING -> FINALIZING lets a finalizer that crashed be picked up again.
  [ContestStatus.FINALIZING]: [
    ContestStatus.FINALIZING,
    ContestStatus.COMPLETED,
    ContestStatus.CLOSED,
    ContestStatus.FINALIZATION_FAILED,
  ],
  [ContestStatus.FINALIZATION_FAILED]: [ContestStatus.FINALIZING],
  [ContestStatus.CLOSED]: [ContestStatus.COMPLETED],
};

const statusesThatCanBecome = (target: ContestStatus) =>
  (Object.keys(allowedTransitions) as ContestStatus[]).filter((status) =>
    allowedTransitions[status]?.includes(target),
  );

const editableStatuses: ContestStatus[] = [ContestStatus.NEW, ContestStatus.UPCOMING];
const completedStatuses: ContestStatus[] = [ContestStatus.COMPLETED, ContestStatus.CLOSED];
// Once finalization starts the photo set is frozen: rankings, grants and award
// selections all reference it.
const frozenStatuses: ContestStatus[] = [ContestStatus.FINALIZING, ContestStatus.COMPLETED, ContestStatus.CLOSED];
// Admin tabs. "Active" means not concluded yet, "Ended" means finished, successfully or not.
const activeTabStatuses: ContestStatus[] = [
  ContestStatus.NEW,
  ContestStatus.UPCOMING,
  ContestStatus.OPEN,
  ContestStatus.JOINED,
  ContestStatus.ACTIVE,
  ContestStatus.FINALIZING,
];
const endedTabStatuses: ContestStatus[] = [
  ContestStatus.COMPLETED,
  ContestStatus.CLOSED,
  ContestStatus.FINALIZATION_FAILED,
];

export const contestStatus = {
  completedStatuses,
  editableStatuses,
  frozenStatuses,
  activeTabStatuses,
  endedTabStatuses,
  isCompleted: (status: ContestStatus) => completedStatuses.includes(status),
  isEditable: (status: ContestStatus) => editableStatuses.includes(status),
  isFrozen: (status: ContestStatus) => frozenStatuses.includes(status),

  // The only way to change a contest's status. The check and the write are one
  // database operation, so two workers cannot both make the same change, and it
  // returns false when the move is not allowed or already happened.
  async change(
    contestId: string,
    to: ContestStatus,
    extraData: Prisma.ContestUpdateManyMutationInput = {},
    where: Prisma.ContestWhereInput = {},
    db: PrismaTx | typeof prisma = prisma,
  ) {
    const changed = await db.contest.updateMany({
      where: { ...where, id: contestId, status: { in: statusesThatCanBecome(to) } },
      data: { ...extraData, status: to },
    });
    return changed.count === 1;
  },
};

// Mongo documents created before `deletedAt` existed have no such field, and
// Prisma's {deletedAt: null} does not match a missing field, so it must also
// accept isSet:false or every older contest disappears from every list.
export const notDeletedContest: Prisma.ContestWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
};

/** Database guard for operations that are legal only while voting is open. */
export const activeContestWhere = (now = new Date()): Prisma.ContestWhereInput => ({
  status: ContestStatus.ACTIVE,
  ...notDeletedContest,
  startDate: { lte: now },
  endDate: { gt: now },
});

// Registrations and submissions (join, submit, withdraw an entry). Every contest
// accepts them while active; Photographer of the Year also accepts them while
// scheduled (contestTypePolicy.opensEntriesBeforeStart). Voting does NOT use
// this: it stays on activeContestWhere, so nothing is scored before the start.
export const acceptingEntriesWhere = (now = new Date()): Prisma.ContestWhereInput => ({
  OR: [
    activeContestWhere(now),
    {
      AND: [
        {
          isPhotographyOfYear: true,
          status: { in: [ContestStatus.UPCOMING, ContestStatus.ACTIVE] },
          endDate: { gt: now },
        },
        notDeletedContest,
      ],
    },
  ],
});

// The same rule for a contest already loaded in memory. Must agree with
// acceptingEntriesWhere (see contestLifecycle.test.ts).
export const acceptsEntries = (
  contest: { status: ContestStatus; startDate: Date; endDate: Date; isPhotographyOfYear?: boolean | null; deletedAt?: Date | null },
  now = new Date(),
) => {
  if (contest.deletedAt || contest.endDate <= now) return false;
  if (contest.status === ContestStatus.ACTIVE && contest.startDate <= now) return true;
  return Boolean(contest.isPhotographyOfYear) && contest.status === ContestStatus.UPCOMING;
};

// Like lockActiveContest, for registrations and submissions.
export const lockContestForEntries = async (tx: PrismaTx, contestId: string) => {
  const locked = await tx.contest.updateMany({
    where: { id: contestId, ...acceptingEntriesWhere() },
    data: { updatedAt: new Date() },
  });
  return locked.count === 1;
};

// Claims the contest inside a transaction: it fails if the contest is no longer
// active, and any status change running at the same time conflicts with it.
// Use this for occasional actions (upload, trade, promote, delete). Do not use
// it for votes: it writes the contest document, and writes to one document from
// many transactions at once abort each other (see assertVotingOpen in vote.service.ts).
export const lockActiveContest = async (tx: PrismaTx, contestId: string) => {
  const locked = await tx.contest.updateMany({
    where: { id: contestId, ...activeContestWhere() },
    data: { updatedAt: new Date() },
  });
  return locked.count === 1;
};
