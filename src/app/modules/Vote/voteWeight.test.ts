import test from "node:test";
import assert from "node:assert/strict";
import { getVotePowerForVoter, getVoteWeight } from "./voteWeight.service";

test("a vote counts as its stored voting power", () => {
  assert.equal(getVoteWeight({ power: 1 }), 1);
  assert.equal(getVoteWeight({ power: 2 }), 2);
  assert.equal(getVoteWeight({ power: 18 }), 18);
});

test("a vote never counts for less than one", () => {
  assert.equal(getVoteWeight({}), 1);
  assert.equal(getVoteWeight({ power: null }), 1);
  assert.equal(getVoteWeight({ power: 0 }), 1);
  assert.equal(getVoteWeight({ power: -3 }), 1);
  assert.equal(getVoteWeight({ power: Number.NaN }), 1);
});

test("new votes take the voter's voting power", () => {
  assert.equal(getVotePowerForVoter({ voting_power: 4 }), 4);
  assert.equal(getVotePowerForVoter({ voting_power: null }), 1);
  assert.equal(getVotePowerForVoter({}), 1);
});
