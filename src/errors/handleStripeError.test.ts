import test from "node:test";
import assert from "node:assert/strict";
import handleStripeError from "./handleStripeError";

test("an amount Stripe rejects becomes a 400 with a safe message", () => {
  const result = handleStripeError({
    type: "StripeInvalidRequestError",
    code: "amount_too_small",
    message: "$0.50 converts to approximately 0.45 EUR",
    raw: { request_log_url: "https://dashboard.stripe.com/acct_secret/logs" },
  });

  assert.equal(result?.statusCode, 400);
  assert.equal(result?.errorSources[0].code, "amount_too_small");
  assert.equal(JSON.stringify(result).includes("acct_secret"), false);
  assert.equal(result?.message.includes("0.45"), false);
});

test("other Stripe errors are left for the normal server error path", () => {
  assert.equal(handleStripeError({ type: "StripeInvalidRequestError", code: "resource_missing" }), null);
  assert.equal(handleStripeError({ type: "StripeAPIError", code: "amount_too_small" }), null);
});

test("errors that are not from Stripe are ignored", () => {
  assert.equal(handleStripeError(new Error("boom")), null);
  assert.equal(handleStripeError(undefined), null);
});
