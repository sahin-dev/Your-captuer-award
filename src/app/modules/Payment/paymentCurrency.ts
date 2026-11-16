// Currencies an admin can price contests, Photographer of the Year and store
// products in. Stripe Checkout charges in the chosen currency; Adaptive
// Pricing may still offer a visitor their local currency on top of it.
export const SUPPORTED_CURRENCIES = ["USD", "EUR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: SupportedCurrency = "USD";

// Smallest paid amount per currency. The Stripe account settles in EUR and
// Stripe refuses charges under 0.50 EUR; USD keeps a margin for exchange rate
// changes. 0 is always allowed and means "free".
export const MIN_PAID_AMOUNT: Record<SupportedCurrency, number> = {
  USD: 0.6,
  EUR: 0.5,
};

export const isSupportedCurrency = (value: unknown): value is SupportedCurrency =>
  typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value.trim().toUpperCase());

// The currency to charge for a stored price. Records written before currency
// became selectable may hold null or another prize currency; those were always
// charged in USD, so they keep being charged in USD.
export const resolveChargeCurrency = (value?: string | null): SupportedCurrency =>
  isSupportedCurrency(value) ? (value.trim().toUpperCase() as SupportedCurrency) : DEFAULT_CURRENCY;

export const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;

// Null when the fee is acceptable, otherwise a message for the admin.
export const getPaidAmountError = (amount: number, currency: SupportedCurrency): string | null => {
  if (amount === 0) return null;
  const min = MIN_PAID_AMOUNT[currency];
  if (amount < min) {
    return `${currency} entry fee must be 0 (free) or at least ${min.toFixed(2)}`;
  }
  return null;
};
