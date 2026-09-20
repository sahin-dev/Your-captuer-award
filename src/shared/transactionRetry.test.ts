import test from "node:test";
import assert from "node:assert/strict";
import { isTransientWriteConflict, runWithWriteConflictRetry } from "./transactionRetry";
import { Prisma } from "../prismaClient";

const writeConflict = () => new Prisma.PrismaClientKnownRequestError(
  "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
  { code: "P2034", clientVersion: "test" }
);

test("recognises the Prisma write-conflict code", () => {
  assert.equal(isTransientWriteConflict(writeConflict()), true);
});

test("recognises a raw MongoDB write conflict without a Prisma code", () => {
  assert.equal(isTransientWriteConflict(new Error("WriteConflict error: this operation conflicted")), true);
});

test("does not retry unrelated failures", () => {
  assert.equal(isTransientWriteConflict(new Error("Contest not found")), false);
  assert.equal(
    isTransientWriteConflict(new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "test" })),
    false
  );
});

test("replays the operation until it succeeds", async () => {
  let calls = 0;
  const result = await runWithWriteConflictRetry(async () => {
    calls += 1;
    if (calls < 3) throw writeConflict();
    return "persisted";
  }, { baseDelayMs: 1 });

  assert.equal(result, "persisted");
  assert.equal(calls, 3);
});

test("gives up after the last attempt and rethrows", async () => {
  let calls = 0;
  await assert.rejects(
    () => runWithWriteConflictRetry(async () => {
      calls += 1;
      throw writeConflict();
    }, { attempts: 3, baseDelayMs: 1 }),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
  );
  assert.equal(calls, 3);
});

test("rethrows a non-transient failure immediately", async () => {
  let calls = 0;
  await assert.rejects(
    () => runWithWriteConflictRetry(async () => {
      calls += 1;
      throw new Error("Contest could not be frozen for finalization");
    }, { baseDelayMs: 1 }),
    /could not be frozen/
  );
  assert.equal(calls, 1);
});
