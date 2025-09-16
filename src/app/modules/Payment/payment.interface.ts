import {Stripe} from 'stripe'
export interface PaymentProvider {
  initializePayment(amount: number, currency: string, method: PaymentMethod, paymentId:string): Promise<string>;
  capturePayment(paymentId: string): Promise<boolean>;
  refundPayment(paymentId: string, amount: number): Promise<boolean>;
  addProduct?(name: string): Promise<Stripe.Product>;
}

export type PaymentMethod = "CARD";