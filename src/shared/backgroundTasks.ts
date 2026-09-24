import logger from "./logger";

// Work that runs after the response is sent. It is kept in memory only, so it
// is lost if the process is killed; use it for derived data that the next
// request would recompute anyway, not for anything that must happen.
const pending = new Set<Promise<void>>();

export const runInBackground = (name: string, task: () => Promise<unknown>) => {
  const run: Promise<void> = Promise.resolve()
    .then(task)
    .then(
      () => undefined,
      (error) => {
        logger.error({ err: error, task: name }, "Background task failed");
      }
    )
    .finally(() => {
      pending.delete(run);
    });
  pending.add(run);
};

// Called on shutdown so a PM2 reload lets in-flight tasks finish before the
// database connection closes. Gives up after timeoutMs.
export const drainBackgroundTasks = async (timeoutMs = 8000) => {
  if (pending.size === 0) {
    return;
  }

  logger.info({ count: pending.size }, "Waiting for background tasks");
  let timer: NodeJS.Timeout | undefined;
  const timedOut = await Promise.race([
    Promise.allSettled([...pending]).then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), timeoutMs);
    }),
  ]);
  clearTimeout(timer);

  if (timedOut) {
    logger.warn({ count: pending.size }, "Background tasks still running at shutdown, abandoning them");
  }
};
