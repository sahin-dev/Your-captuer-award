import test from "node:test";
import assert from "node:assert/strict";
import { getPeriodWindow, PAYOUT_TIME_ZONE } from "./teamPeriod";

const amsterdam = (date: Date) =>
  date.toLocaleString("en-GB", { timeZone: PAYOUT_TIME_ZONE, dateStyle: "short", timeStyle: "short" });

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

test("weekly window runs Sunday 09:00 Amsterdam to the next Sunday 09:00", () => {
  // Wednesday 2026-09-23, mid-week.
  const window = getPeriodWindow("WEEKLY", new Date("2026-09-23T12:00:00Z"));
  assert.equal(window.start.toISOString(), "2026-09-20T07:00:00.000Z"); // 09:00 CEST
  assert.equal(window.end.toISOString(), "2026-09-27T07:00:00.000Z");
  assert.equal(window.periodKey, "2026-09-20");
  assert.equal(amsterdam(window.start), "20/09/2026, 09:00");
  assert.equal(amsterdam(window.end), "27/09/2026, 09:00");
});

test("the reset happens at 09:00, not at midnight", () => {
  // 06:00 UTC Sunday = 08:00 Amsterdam - one hour BEFORE the reset, so the
  // period in progress is still the one that started the previous Sunday.
  const before = getPeriodWindow("WEEKLY", new Date("2026-09-20T06:00:00Z"));
  assert.equal(before.periodKey, "2026-09-13");
  assert.equal(before.end.toISOString(), "2026-09-20T07:00:00.000Z");

  // 07:00 UTC = 09:00 Amsterdam exactly - the new period has begun.
  const atReset = getPeriodWindow("WEEKLY", new Date("2026-09-20T07:00:00Z"));
  assert.equal(atReset.periodKey, "2026-09-20");
});

test("offset -1 selects the period a payout should pay", () => {
  // The job fires at the boundary; it must pay the week that just closed.
  const paying = getPeriodWindow("WEEKLY", new Date("2026-09-27T07:00:00Z"), -1);
  assert.equal(paying.periodKey, "2026-09-20");
  assert.equal(paying.start.toISOString(), "2026-09-20T07:00:00.000Z");
  assert.equal(paying.end.toISOString(), "2026-09-27T07:00:00.000Z");
});

test("consecutive weekly windows tile with no gap and no overlap", () => {
  let cursor = getPeriodWindow("WEEKLY", new Date("2026-01-07T12:00:00Z"));
  for (let i = 0; i < 60; i += 1) {
    const next = getPeriodWindow("WEEKLY", new Date(cursor.end.getTime() + 60_000));
    assert.equal(next.start.getTime(), cursor.end.getTime(), `gap at ${cursor.end.toISOString()}`);
    cursor = next;
  }
});

test("a week spanning the DST change is still exactly 7 days of wall clock", () => {
  // Europe/Amsterdam falls back at 03:00 on Sunday 2026-10-25, so it is the
  // week ENDING that morning which contains the transition - the window that
  // starts at 09:00 on the 25th is already CET at both ends.
  const spanning = getPeriodWindow("WEEKLY", new Date("2026-10-21T12:00:00Z"));
  assert.equal(amsterdam(spanning.start), "18/10/2026, 09:00");
  assert.equal(amsterdam(spanning.end), "25/10/2026, 09:00");
  assert.equal(spanning.start.toISOString(), "2026-10-18T07:00:00.000Z"); // CEST
  assert.equal(spanning.end.toISOString(), "2026-10-25T08:00:00.000Z");   // CET
  // Seven days of wall clock is 7*24h + 1h of real time across a fall-back.
  assert.equal(spanning.end.getTime() - spanning.start.getTime(), WEEK_MS + 3600_000);

  // The following week is wholly in CET: same 09:00 anchor, exactly 7*24h.
  const after = getPeriodWindow("WEEKLY", new Date("2026-10-28T12:00:00Z"));
  assert.equal(amsterdam(after.start), "25/10/2026, 09:00");
  assert.equal(after.start.getTime(), spanning.end.getTime());
  assert.equal(after.end.getTime() - after.start.getTime(), WEEK_MS);
});

test("the anchor stays 09:00 Amsterdam on both sides of DST", () => {
  const summer = getPeriodWindow("WEEKLY", new Date("2026-07-15T12:00:00Z"));
  const winter = getPeriodWindow("WEEKLY", new Date("2026-12-15T12:00:00Z"));
  assert.equal(amsterdam(summer.start).slice(-5), "09:00");
  assert.equal(amsterdam(winter.start).slice(-5), "09:00");
  // Same wall clock, different UTC instant: 07:00Z in summer, 08:00Z in winter.
  assert.equal(summer.start.toISOString().slice(11, 16), "07:00");
  assert.equal(winter.start.toISOString().slice(11, 16), "08:00");
});

test("monthly window runs 1st 09:00 Amsterdam to the next 1st 09:00", () => {
  const window = getPeriodWindow("MONTHLY", new Date("2026-09-15T12:00:00Z"));
  assert.equal(window.periodKey, "2026-09");
  assert.equal(amsterdam(window.start), "01/09/2026, 09:00");
  assert.equal(amsterdam(window.end), "01/10/2026, 09:00");

  // Just before the reset on the 1st, the previous month is still live.
  const beforeReset = getPeriodWindow("MONTHLY", new Date("2026-09-01T06:00:00Z"));
  assert.equal(beforeReset.periodKey, "2026-08");
});

test("monthly rolls over the year boundary", () => {
  const december = getPeriodWindow("MONTHLY", new Date("2026-12-10T12:00:00Z"));
  assert.equal(december.periodKey, "2026-12");
  assert.equal(amsterdam(december.end), "01/01/2027, 09:00");
  assert.equal(getPeriodWindow("MONTHLY", new Date("2027-01-01T06:00:00Z")).periodKey, "2026-12");
});

test("yearly window runs 1 Jan 09:00 Amsterdam to the next", () => {
  const window = getPeriodWindow("YEARLY", new Date("2026-06-01T12:00:00Z"));
  assert.equal(window.periodKey, "2026");
  assert.equal(amsterdam(window.start), "01/01/2026, 09:00");
  assert.equal(amsterdam(window.end), "01/01/2027, 09:00");
  // January is CET, so 09:00 local is 08:00Z.
  assert.equal(window.start.toISOString(), "2026-01-01T08:00:00.000Z");

  const beforeReset = getPeriodWindow("YEARLY", new Date("2026-01-01T06:00:00Z"));
  assert.equal(beforeReset.periodKey, "2025");
});

test("period keys keep the format already stored in TeamRewardTransaction", () => {
  assert.match(getPeriodWindow("WEEKLY", new Date()).periodKey, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(getPeriodWindow("MONTHLY", new Date()).periodKey, /^\d{4}-\d{2}$/);
  assert.match(getPeriodWindow("YEARLY", new Date()).periodKey, /^\d{4}$/);
});

test("windows never depend on when the question is asked inside the period", () => {
  // Any instant inside a week must produce the identical window.
  const base = getPeriodWindow("WEEKLY", new Date("2026-09-20T07:00:00Z"));
  for (const offsetMs of [1, 3600_000, 3 * 24 * 3600_000, WEEK_MS - 1000]) {
    const sample = getPeriodWindow("WEEKLY", new Date(base.start.getTime() + offsetMs));
    assert.equal(sample.periodKey, base.periodKey, `drifted at +${offsetMs}ms`);
    assert.equal(sample.start.getTime(), base.start.getTime());
  }
});
