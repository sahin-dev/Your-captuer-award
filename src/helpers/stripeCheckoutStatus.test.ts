import test from "node:test";
import assert from "node:assert/strict";
import { isCheckoutSessionPaid } from "./stripeCheckoutStatus";

test("a checkout session is fulfilled only once Stripe reports it paid", () => {
  assert.equal(isCheckoutSessionPaid({ payment_status: "paid" }), true);
  assert.equal(isCheckoutSessionPaid({ payment_status: "no_payment_required" }), true);
  // Bank debits, transfers and vouchers complete checkout before the money arrives.
  assert.equal(isCheckoutSessionPaid({ payment_status: "unpaid" }), false);
});
