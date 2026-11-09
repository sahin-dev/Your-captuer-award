import test from "node:test";
import assert from "node:assert/strict";
import { policyFor } from "./contestTypePolicy";

test("a Photographer of the Year contest with a fee needs Stripe payment", () => {
  const policy = policyFor({ isPhotographyOfYear: true });
  assert.equal(policy.requiresStripeEntry({ entryFeeAmount: 5 }), true);
});

test("a Photographer of the Year contest with no fee is free to join", () => {
  const policy = policyFor({ isPhotographyOfYear: true });
  assert.equal(policy.requiresStripeEntry({ entryFeeAmount: 0 }), false);
});

test("regular contests follow the same fee rule", () => {
  const policy = policyFor({ isPhotographyOfYear: false });
  assert.equal(policy.requiresStripeEntry({ entryFeeAmount: 5 }), true);
  assert.equal(policy.requiresStripeEntry({ entryFeeAmount: 0 }), false);
});

test("only Photographer of the Year stays editable after it starts", () => {
  assert.equal(policyFor({ isPhotographyOfYear: true }).editableWhileRunning, true);
  assert.equal(policyFor({ isPhotographyOfYear: false }).editableWhileRunning, false);
});

test("deleting Photographer of the Year purges it; regular contests are soft-deleted", () => {
  assert.equal(policyFor({ isPhotographyOfYear: true }).purgeOnDelete, true);
  assert.equal(policyFor({ isPhotographyOfYear: false }).purgeOnDelete, false);
});
