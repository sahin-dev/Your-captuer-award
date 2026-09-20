import type { Agenda, Job } from "agenda";

// Agenda has no built-in retry. Job#run() calls computeNextRunAt() *before* the
// handler executes, so a repeating job's next tick is already booked and a
// throw costs nothing. A one-off job (contest:watcher, promotion:remove) gets
// nextRunAt = null instead, so the first failure is also the last - the job
// stays in the collection as a corpse and nothing ever runs it again.
//
// Agenda does track failCount/failReason/failedAt and emits "fail", which is
// enough to reschedule the job ourselves. (lockLifetime is a different thing:
// it only recovers jobs whose *process* died while holding the lock, not jobs
// whose handler threw.)
const MAX_JOB_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 30 * 1000;

export const registerJobRetries = (agenda: Agenda) => {
  agenda.on("fail", async (error: Error, job: Job) => {
    const { name, data, failCount = 1 } = job.attrs;

    try {
      if (job.attrs.repeatInterval || job.attrs.repeatAt) {
        console.error(`Agenda job ${name} failed (${failCount}x); its next scheduled run is unaffected:`, error.message);
        return;
      }

      if (failCount >= MAX_JOB_ATTEMPTS) {
        console.error(`Agenda job ${name} failed ${failCount} times; giving up.`, data, error.message);
        return;
      }

      // 30s, 1m, 2m, 4m - long enough for a write conflict or a brief database
      // blip to clear, short enough that a contest still finalizes promptly.
      const delayMs = RETRY_BASE_DELAY_MS * 2 ** (failCount - 1);
      job.schedule(new Date(Date.now() + delayMs));
      await job.save();
      console.warn(
        `Agenda job ${name} failed (attempt ${failCount}/${MAX_JOB_ATTEMPTS}); retrying in ${Math.round(delayMs / 1000)}s:`,
        error.message
      );
    } catch (retryError) {
      console.error(`Could not schedule a retry for Agenda job ${name}`, retryError);
    }
  });
};
