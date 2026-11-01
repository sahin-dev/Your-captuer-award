import httpStatus from "http-status";

const REJECTED_AMOUNT_CODES = ["amount_too_small", "amount_too_large"];

// Stripe refuses amounts outside the limits for the account's settlement
// currency. That is a problem with the price, not a server failure, so it is a
// 400 with a message a user can act on. Returns null for any other error, which
// the error middleware then handles as usual.
const handleStripeError = (err: any) => {
  if (err?.type !== "StripeInvalidRequestError" || !REJECTED_AMOUNT_CODES.includes(err.code)) {
    return null;
  }

  const message = "This payment amount is not accepted by the payment provider. Please contact support";

  return {
    statusCode: httpStatus.BAD_REQUEST,
    message,
    errorSources: [{ type: "PaymentError", code: err.code, details: message }],
  };
};

export default handleStripeError;
