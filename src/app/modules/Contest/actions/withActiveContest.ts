import httpStatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import prisma, { PrismaTx } from "../../../../shared/prisma";
import { runWithWriteConflictRetry } from "../../../../shared/transactionRetry";
import { lockActiveContest } from "../contestLifecycle";

type TransactionOptions = { maxWait?: number; timeout?: number };

// Runs `work` in a transaction that first confirms the contest is still active,
// and replays it if MongoDB reports a write conflict. Keep `work` free of side
// effects outside the database (emails, uploads), because it can run twice.
// Do not use this for votes: see assertVotingOpen in vote.service.ts.
export const withActiveContest = <T>(
  contestId: string,
  closedMessage: string,
  work: (tx: PrismaTx) => Promise<T>,
  options?: TransactionOptions,
) =>
  runWithWriteConflictRetry(
    () => prisma.$transaction(async (tx) => {
      if (!(await lockActiveContest(tx, contestId))) {
        throw new ApiError(httpStatus.CONFLICT, closedMessage);
      }
      return work(tx);
    }, options),
    { label: `contest ${contestId}` },
  );
