import test from "node:test";
import assert from "node:assert/strict";
import { drainBackgroundTasks, runInBackground } from "./backgroundTasks";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("runInBackground returns before the task finishes and drain waits for it", async () => {
  let finished = false;
  runInBackground("slow", async () => {
    await wait(50);
    finished = true;
  });

  assert.equal(finished, false);
  await drainBackgroundTasks(1000);
  assert.equal(finished, true);
});

test("a failing task is contained and does not reject drain", async () => {
  runInBackground("failing", async () => {
    throw new Error("boom");
  });

  await assert.doesNotReject(drainBackgroundTasks(1000));
});

test("drain gives up after the timeout", async () => {
  runInBackground("stuck", () => wait(500));

  const started = Date.now();
  await drainBackgroundTasks(50);
  assert.ok(Date.now() - started < 400);
  await drainBackgroundTasks(1000);
});
