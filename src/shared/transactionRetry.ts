import { Prisma } from "../prismaClient";

// MongoDB uses optimistic concurrency: a transaction is aborted as soon as any
// other writer touches a document it has already written. The server labels
// those aborts transient and expects the client to replay the whole
// transaction, but Prisma only surfaces them as P2034 ("write conflict or a
// deadlock") - it never retries on its own. Anything that writes rows a live
// contest also writes (ranks, levels, grants) has to do the replay itself.
const WRITE_CONFLICT_CODE = "P2034";
const TRANSIENT_ERROR_PATTERN = /write conflict|writeconflict|transienttransactionerror|please retry/i;

export const isTransientWriteConflict = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === WRITE_CONFLICT_CODE;
  }
  return error instanceof Error && TRANSIENT_ERROR_PATTERN.test(error.message);
};

type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  label?: string;
};

/**
 * Replays `operation` while MongoDB keeps rejecting it as a transient write
 * conflict. Backoff is exponential with jitter so two racing finalizers do not
 * line up on the same retry tick.
 */
export const runWithWriteConflictRetry = async <T>(
  operation: () => Promise<T>,
  { attempts = 5, baseDelayMs = 120, label = "transaction" }: RetryOptions = {}
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientWriteConflict(error) || attempt === attempts) {
        throw error;
      }
      lastError = error;
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * baseDelayMs);
      console.warn(`Write conflict on ${label} (attempt ${attempt}/${attempts}); retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};
