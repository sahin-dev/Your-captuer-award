import type Stripe from "stripe";

// Whether a completed Checkout Session may be fulfilled. With dynamic payment
// methods, bank debits, bank transfers and vouchers (SEPA/Bacs/ACH debit,
// Boleto, OXXO, Konbini...) complete checkout before the money arrives; the
// session is then "unpaid" and Stripe sends
// checkout.session.async_payment_succeeded (or _failed) later.
// "no_payment_required" covers a fully discounted session or a free trial.
export const isCheckoutSessionPaid = (session: Pick<Stripe.Checkout.Session, "payment_status">) =>
  session.payment_status === "paid" || session.payment_status === "no_payment_required";
