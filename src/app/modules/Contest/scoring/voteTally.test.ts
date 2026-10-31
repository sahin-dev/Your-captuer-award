import test from "node:test";
import assert from "node:assert/strict";
import { countsForCurrentStint, getInitialVotes, getSlotScore, getStintStart } from "./voteTally";

const createdAt = new Date("2026-01-01T00:00:00Z");
const slot = { photoId: "imageA", originalPhotoId: "imageA", initialVotes: 5, bankedVotes: 2, stintStartedAt: null, createdAt };

test("a slot with no stint starts when the slot was created", () => {
  assert.equal(getStintStart(slot), createdAt);
});

test("initial votes stay with the original image only", () => {
  assert.equal(getInitialVotes(slot), 5);
  assert.equal(getInitialVotes({ ...slot, photoId: "imageB" }), 0);
});

test("a vote for a traded-out image no longer counts", () => {
  const vote = { photoRefId: "imageB", createdAt: new Date("2026-01-02T00:00:00Z") };
  assert.equal(countsForCurrentStint(slot, vote), false);
});

test("a vote cast before the current stint does not count", () => {
  const traded = { ...slot, stintStartedAt: new Date("2026-01-03T00:00:00Z") };
  const vote = { photoRefId: "imageA", createdAt: new Date("2026-01-02T00:00:00Z") };
  assert.equal(countsForCurrentStint(traded, vote), false);
});

test("a legacy vote with no image reference counts for the live image", () => {
  const vote = { photoRefId: null, createdAt: new Date("2026-01-02T00:00:00Z") };
  assert.equal(countsForCurrentStint(slot, vote), true);
});

test("the score adds live, initial and banked votes", () => {
  assert.equal(getSlotScore(slot, 10), 17);
});
