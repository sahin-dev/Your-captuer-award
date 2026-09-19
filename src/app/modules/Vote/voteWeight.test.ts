import assert from "node:assert/strict";
import test from "node:test";
import { getVoteWeight } from "./voteWeight.service";

test("every vote contributes exactly one regardless of stored legacy weight", () => {
  assert.equal(getVoteWeight({ weight: 100, power: 50 }), 1);
  assert.equal(getVoteWeight({ weight: null, power: 20 }), 1);
  assert.equal(getVoteWeight({}), 1);
});
