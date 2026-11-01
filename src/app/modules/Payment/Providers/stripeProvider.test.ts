import test from "node:test";
import assert from "node:assert/strict";

// A placeholder key, so this test can never reach a real Stripe account. The
// network calls are replaced below.
process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";

import { StripeProvider } from "./stripeProvider";

const createSessionWithFee = async (fee: number) => {
  const provider = new StripeProvider() as any;
  let idempotencyKey = "";
  provider.createCustomer = async () => ({ id: "cus_test" });
  provider.stripe = {
    checkout: {
      sessions: {
        create: async (_params: unknown, options: { idempotencyKey: string }) => {
          idempotencyKey = options.idempotencyKey;
          return { id: "cs_test" };
        },
      },
    },
  };

  await provider.initializePaymentSession(
    "user1", fee, "USD", "https://x.test/ok", "https://x.test/no", { payment_id: "payment1" }, "Entry fee",
  );
  return idempotencyKey;
};

test("the same payment and fee reuse one idempotency key", async () => {
  assert.equal(await createSessionWithFee(0.6), await createSessionWithFee(0.6));
});

test("changing the fee gives a new key, so Stripe does not reject the retry", async () => {
  assert.notEqual(await createSessionWithFee(0.5), await createSessionWithFee(0.6));
});
