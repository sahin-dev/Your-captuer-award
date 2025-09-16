// StripeProvider.ts
import {Stripe} from 'stripe'
import { PaymentProvider, PaymentMethod } from "../payment.interface";
import config from '../../../../config';
import { PaymentRegistry } from '../paymentRegistry';
import prisma from '../../../../shared/prisma';

export class StripeProvider implements PaymentProvider {
    private stripe:Stripe
    constructor (){

        let stripe_key = config.stripe_key
        if(!stripe_key){
            throw new Error("Error creating provider: Stripe key is not found")
        }
        this.stripe = new Stripe(stripe_key)
    }

    async initializePaymentSession(amount: number, currency: string, method: PaymentMethod, success_url:string, cancel_url:string){
        const session = await this.stripe.checkout.sessions.create({
          payment_method_types:["card"],
          mode:"payment",
            line_items:[{
              price_data:{currency:currency,product_data:{name:"Simple Product"},
              unit_amount:amount * 100
            },
          quantity:1,
        }],
        success_url:success_url,
        cancel_url:cancel_url,
      })
  
      return session.url as string

    }

  async initializePayment(amount: number, currency: string, method: PaymentMethod, paymentId:string): Promise<string> {
    
      const intent = await this.stripe.paymentIntents.create({amount, currency,metadata:{}})

      await prisma.payment.update({where:{id:paymentId}, data:{stripe_intent_id:intent.id}})

      return intent.client_secret as string;
  }

  async addProduct(title:string, ){
    const stripeProduct = await this.stripe.products.create({name:title})
    return stripeProduct
  }
  async addPrice(currency:string){
    const stripePrice = await this.stripe.prices.create({currency})
    return stripePrice
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