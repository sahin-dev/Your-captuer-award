import { Prisma } from "../../../prismaClient";
import prisma, { PrismaTx } from "../../../shared/prisma";
import logger from "../../../shared/logger";

// A durable to-do list. Instead of doing slow follow-up work after every
// action, code adds a row here and the "work:drainPending" Agenda job does the
// work later. Adding the same key again does not create a second row, so 50
// votes for one user cause one level check, not 50.
//
// To add a new kind of work:
//   1. add its name to PendingWorkType
//   2. add its handler in pendingWork.handlers.ts

export type PendingWorkType = "PARTICIPANT_LEVEL" | "USER_LEVEL" | "TEAM_QUEUE_CHECK";

export type PendingWorkItem = {
  id: string;
  key: string;
  type: string;
  targetId: string;
  contestId: string | null;
  updatedAt: Date;
};

type EnqueueOptions = {
  contestId?: string;
  // Pass the transaction client to save the work together with the change that
  // caused it, so neither can exist without the other.
  tx?: PrismaTx;
};

const DRAIN_BATCH_SIZE = 1000;

const buildKey = (type: PendingWorkType, targetId: string, contestId?: string) =>
  [type, targetId, contestId].filter(Boolean).join(":");

const enqueue = async (type: PendingWorkType, targetId: string, options: EnqueueOptions = {}) => {
  const { contestId, tx } = options;
  const key = buildKey(type, targetId, contestId);
  const db = tx ?? prisma;

  try {
    await db.pendingWork.upsert({
      where: { key },
      // Touching updatedAt tells drain() that something new happened while the
      // row was being processed, so the row is kept for the next run.
      update: { updatedAt: new Date() },
      create: { key, type, targetId, contestId },
    });
  } catch (error) {
    // Two requests added the same key at the same moment: the work is queued.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
};

// Runs a batch, oldest first. A failed item stays in the list and is tried again
// on the next run; one bad item does not stop the others. Order by createdAt, not
// updatedAt: a busy user's row is updated by every vote, so ordering by updatedAt
// would keep moving it to the back and it might never run.
const drain = async (handle: (item: PendingWorkItem) => Promise<unknown>) => {
  const items = await prisma.pendingWork.findMany({
    orderBy: { createdAt: "asc" },
    take: DRAIN_BATCH_SIZE,
  });

  let completed = 0;
  for (const item of items) {
    try {
      await handle(item);
      await prisma.pendingWork.deleteMany({ where: { id: item.id, updatedAt: item.updatedAt } });
      completed += 1;
    } catch (error) {
      logger.error({ err: error, key: item.key }, "Pending work failed, will retry");
    }
  }

  return completed;
};

export const pendingWorkQueue = {
  enqueue,
  drain,
};
