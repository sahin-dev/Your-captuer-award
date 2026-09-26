import test from "node:test";
import assert from "node:assert/strict";
import { dedupeLabels, hasLabel } from "./labels";

test("hasLabel ignores case and surrounding spaces", () => {
  assert.equal(hasLabel(["Nature"], "nature"), true);
  assert.equal(hasLabel(["nature"], " NATURE "), true);
  assert.equal(hasLabel(["Portrait"], "Nature"), false);
  assert.equal(hasLabel([], "Nature"), false);
});

test("dedupeLabels keeps the first spelling and the order", () => {
  assert.deepEqual(dedupeLabels(["Nature", "Portrait", "nature", "NATURE", "Portrait"]), ["Nature", "Portrait"]);
  assert.deepEqual(dedupeLabels(["Street", "Nature"]), ["Street", "Nature"]);
  assert.deepEqual(dedupeLabels([]), []);
});
