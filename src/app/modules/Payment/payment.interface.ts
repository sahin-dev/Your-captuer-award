import Stripe from "stripe";

export interface PaymentProvider {
  initializePayment(amount: number, currency: string, method: PaymentMethod): Promise<string>;
  capturePayment(paymentId: string): Promise<boolean>;
  refundPayment(paymentId: string, amount: number): Promise<boolean>;
}

export type PaymentMethod = "CARD";