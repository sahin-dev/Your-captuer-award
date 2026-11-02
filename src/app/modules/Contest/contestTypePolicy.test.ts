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
