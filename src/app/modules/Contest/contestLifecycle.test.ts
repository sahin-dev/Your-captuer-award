import test from "node:test";
import assert from "node:assert/strict";
import { ContestStatus } from "../../../prismaClient";
import { acceptingEntriesWhere, acceptsEntries, activeContestWhere } from "./contestLifecycle";
import { policyFor } from "./contestTypePolicy";

const now = new Date("2026-06-01T12:00:00Z");
const before = new Date("2026-05-01T00:00:00Z");
const later = new Date("2026-07-01T00:00:00Z");
const muchLater = new Date("2026-12-31T00:00:00Z");

const contest = (overrides: Partial<Parameters<typeof acceptsEntries>[0]>) => ({
  status: ContestStatus.ACTIVE,
  startDate: before,
  endDate: later,
  isPhotographyOfYear: false,
  deletedAt: null,
  ...overrides,
});

test("regular contests take entries only while active", () => {
  assert.equal(acceptsEntries(contest({}), now), true);
  assert.equal(acceptsEntries(contest({ status: ContestStatus.UPCOMING, startDate: later, endDate: muchLater }), now), false);
  assert.equal(acceptsEntries(contest({ status: ContestStatus.CLOSED }), now), false);
  assert.equal(acceptsEntries(contest({ endDate: before }), now), false);
});

test("Photographer of the Year takes entries while scheduled and while active", () => {
  const poty = { isPhotographyOfYear: true };
  assert.equal(acceptsEntries(contest({ ...poty, status: ContestStatus.UPCOMING, startDate: later, endDate: muchLater }), now), true);
  assert.equal(acceptsEntries(contest({ ...poty }), now), true);
});

test("Photographer of the Year stops taking entries when it ends, closes or is deleted", () => {
  const poty = { isPhotographyOfYear: true };
  assert.equal(acceptsEntries(contest({ ...poty, endDate: before }), now), false);
  assert.equal(acceptsEntries(contest({ ...poty, status: ContestStatus.CLOSED }), now), false);
  assert.equal(acceptsEntries(contest({ ...poty, status: ContestStatus.COMPLETED }), now), false);
  assert.equal(acceptsEntries(contest({ ...poty, status: ContestStatus.FINALIZING }), now), false);
  assert.equal(acceptsEntries(contest({ ...poty, status: ContestStatus.UPCOMING, startDate: later, endDate: muchLater, deletedAt: now }), now), false);
});

test("the database filter keeps the active rule and adds only scheduled Photographer of the Year", () => {
  const where = acceptingEntriesWhere(now) as { OR: unknown[] };
  assert.equal(where.OR.length, 2);
  assert.deepEqual(where.OR[0], activeContestWhere(now));
  const potyBranch = (where.OR[1] as { AND: Record<string, unknown>[] }).AND[0];
  assert.equal(potyBranch.isPhotographyOfYear, true);
  assert.deepEqual(potyBranch.status, { in: [ContestStatus.UPCOMING, ContestStatus.ACTIVE] });
  assert.deepEqual(potyBranch.endDate, { gt: now });
});

test("only Photographer of the Year opens entries before its start date", () => {
  assert.equal(policyFor({ isPhotographyOfYear: true }).opensEntriesBeforeStart, true);
  assert.equal(policyFor({ isPhotographyOfYear: false }).opensEntriesBeforeStart, false);
});
