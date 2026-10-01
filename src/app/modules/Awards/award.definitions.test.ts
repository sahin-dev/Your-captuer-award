import assert from "node:assert/strict";
import test from "node:test";

import { getContestLevelAchievementId } from "../Achievements/achievement.keys";
import { getContestLevelPrizeTypesThrough, prizeTypes } from "./award.definitions";

test("a contest level cumulatively earns itself and every lower level", () => {
  assert.deepEqual(getContestLevelPrizeTypesThrough(prizeTypes.AMATEUR), [
    prizeTypes.AMATEUR,
  ]);

  assert.deepEqual(getContestLevelPrizeTypesThrough(prizeTypes.SUPREME), [
    prizeTypes.AMATEUR,
    prizeTypes.TALENTED,
    prizeTypes.SUPREME,
  ]);

  assert.deepEqual(getContestLevelPrizeTypesThrough(prizeTypes.TOP_NOTCH), [
    prizeTypes.AMATEUR,
    prizeTypes.TALENTED,
    prizeTypes.SUPREME,
    prizeTypes.SUPERIOR,
    prizeTypes.TOP_NOTCH,
  ]);
});

test("non-level contest awards do not produce level achievements", () => {
  assert.deepEqual(getContestLevelPrizeTypesThrough(prizeTypes.TOP_PHOTO), []);
});

test("level achievement IDs are stable per contest and distinct across contests", () => {
  const first = getContestLevelAchievementId("participant-1", "contest-1", prizeTypes.SUPREME);
  const repeated = getContestLevelAchievementId("participant-1", "contest-1", prizeTypes.SUPREME);
  const anotherContest = getContestLevelAchievementId("participant-2", "contest-2", prizeTypes.SUPREME);

  assert.match(first, /^[a-f0-9]{24}$/);
  assert.equal(first, repeated);
  assert.notEqual(first, anotherContest);
});
