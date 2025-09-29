// StripeProvider.ts
import {Stripe} from 'stripe'
import { PaymentProvider, PaymentMethod } from "../payment.interface";
import config from '../../../../config';
import { PaymentRegistry } from '../paymentRegistry';
import prisma from '../../../../shared/prisma';
import { userService } from '../../User/user.service';

export class StripeProvider implements PaymentProvider {
    private stripe:Stripe
    constructor (){

        let stripe_key = config.stripe_key
        if(!stripe_key){
            throw new Error("Error creating provider: Stripe key is not found")
        }
        this.stripe = new Stripe(stripe_key)
    }

    async initializePaymentSession(userId:string,amount: number, currency: string, success_url:string, cancel_url:string, data?:any){
      const customer = await this.createCustomer(userId)
      console.log(data)

        const session = await this.stripe.checkout.sessions.create({
          customer:customer.id,
          payment_method_types:["card"],
          mode:"payment",
            line_items:[{
              price_data:{currency:currency,product_data:{name:"Simple Product"},
              unit_amount:amount * 100
            },
          quantity:1,
        }],
        metadata:data,
        success_url:success_url,
        cancel_url:cancel_url,
      })
  
      return session

    }

  async initializePayment(amount: number, currency: string, method: PaymentMethod, paymentId:string): Promise<string> {
    
      const intent = await this.stripe.paymentIntents.create({amount, currency,metadata:{}})

      await prisma.payment.update({where:{id:paymentId}, data:{stripe_sessino_id:intent.id}})

      return intent.client_secret as string;
  }


  async createSession (userId:string, priceId:string, mode:'subscription' | 'payment',success_url:string, cancel_url:string, data?:any){
    const customer = await this.createCustomer(userId)

    return await this.stripe.checkout.sessions.create({
      customer:customer.id,
      mode,
      line_items:[{price:priceId, quantity:1}],
      metadata:data
    
    })
  }

  async createCustomer (userId:string){

    const user = await userService.getUserDetails(userId)
    if(user.customerId){
      return await this.stripe.customers.retrieve(user.customerId)
    }

    let email = user.email
    let name = user.firstName+' '+user.lastName

    const customer = await this.stripe.customers.create({email,name,metadata:{userId:user.id}})

    await prisma.user.update({where:{id:userId}, data:{customerId: customer.id}})
    return customer
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