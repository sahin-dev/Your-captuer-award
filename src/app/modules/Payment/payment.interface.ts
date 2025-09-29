import {Stripe} from 'stripe'

export interface PaymentProvider {
  initializePayment(amount: number, currency: string, method: PaymentMethod, paymentId:string): Promise<string>;
  capturePayment(paymentId: string): Promise<boolean>;
  refundPayment(paymentId: string, amount: number): Promise<boolean>;
  addProduct?(name: string): Promise<Stripe.Product>;
  createSession(userId:string, priceId:string, mode:'subscription' | 'payment',success_url:string, cancel_url:string, data?:any): Promise<Stripe.Response<Stripe.Checkout.Session>>
  initializePaymentSession(userId:string,amount: number, currency: string, success_url:string, cancel_url:string, data?:any):Promise<Stripe.Response<Stripe.Checkout.Session>>
}

export type PaymentMethod = "CARD";