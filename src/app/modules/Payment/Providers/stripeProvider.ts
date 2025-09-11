// StripeProvider.ts
import {Stripe} from 'stripe'
import { PaymentProvider, PaymentMethod } from "../payment.interface";
import config from '../../../../config';
import { PaymentRegistry } from '../paymentRegistry';

export class StripeProvider implements PaymentProvider {
    private stripe:Stripe
    constructor (){

        let stripe_key = config.stripe_key
        if(!stripe_key){
            throw new Error("Error creating provider: Stripe key is not found")
        }
        this.stripe = new Stripe(stripe_key)
    }
  async initializePayment(amount: number, currency: string, method: PaymentMethod): Promise<string> {
    
    const intent = await this.stripe.checkout.sessions.create({amount: amount * 1000, currency, payment_method:method.toLowerCase()})
    return intent.client_secret as string;
  }

  async capturePayment(paymentId: string): Promise<boolean> {
    
    const intent = await this.stripe.paymentIntents.capture(paymentId)
    return intent.status === "succeeded";
  }

  async refundPayment(paymentId: string, amount: number): Promise<boolean> {
    console.log(`Stripe: Refunding ${amount} for ${paymentId}`);
    return true;
  }
}


PaymentRegistry.registerProvider("STRIPE", new StripeProvider())