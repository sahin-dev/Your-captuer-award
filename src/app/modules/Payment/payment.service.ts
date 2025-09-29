// PaymentService.ts
import ApiError from "../../../errors/ApiError";
import { PaymentStatus, PlanRecurringType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { storeService } from "../Store/store.service";
import { subscriptionService } from "../Subscription/subscription.service";
import { PaymentMethod } from "./payment.interface";
import { PaymentRegistry } from "./paymentRegistry";
import { loadProviders } from "./providerLoader";
import httpStatus from 'http-status'

export class PaymentService {

  private providersLoaded:boolean = false

  private async loadProviders (){
    if(!this.providersLoaded){
      await loadProviders()
      this.providersLoaded = true
    }
  }
  

  async pay(userId:string, productId:string,planId:string, mode:'subscription' | "payment",success_url:string, cancel_url:string) {
    if (!this.providersLoaded)
      await this.loadProviders()

    if(mode === 'payment'){
      if(!productId){
        throw new ApiError(httpStatus.BAD_REQUEST, "product id is required for purchase")
      }
     
      return await this.purchaseProduct(userId,productId,success_url,cancel_url)
    }

    if(!planId){
      throw new ApiError(httpStatus.BAD_REQUEST, "plan id is required for subscription")
    }
    
    return await this.purchaseSubscription(userId,planId,success_url,cancel_url)
    
  }

  async purchaseSubscription (userId:string, planId:string, success_url:string,cancel_url:string) {
    const plan = await subscriptionService.getPlan(planId)
    if(!plan) {
      throw new ApiError(httpStatus.NOT_FOUND, "plan not found")
    }
    const payment = await prisma.payment.create({data:{amount:plan.amount, currency:plan.currency,method:"card", userId,planName:plan.planName,recurring:plan.recurring,planId:plan.id}})

    let startDate = new Date(Date.now())
    let endDate = plan.recurring === PlanRecurringType.MONTHLY? new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000):new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000)

    const subscription = await prisma.subscription.create({data:{plan:plan.planName,userId, plan_id:plan.id, startDate, endDate}})

    const provider = PaymentRegistry.getProvider("STRIPE")
    const session = await provider.createSession(userId,plan.stripe_price_id,'subscription',success_url, cancel_url,{userId,subscription_id:subscription.id, plan_id:plan.id, paymentId:payment.id})

    await prisma.subscription.update({where:{id:subscription.id}, data:{stripe_session_id:session.id}})
    await prisma.payment.update({where:{id:payment.id}, data:{subscriptionId:subscription.id, stripe_sessino_id:session.id}})
    
    return session
  }

  async purchaseProduct (userId:string, productId:string, success_url:string, cancel_url:string) {
    const product = await storeService.getProductDetails(productId)

    if(!product){
      throw new ApiError(httpStatus.NOT_FOUND, "product not found")
    }
    const payment = await prisma.payment.create({data:{amount:product.amount,currency:product.currency,productId:product.id,method:"cards",userId, recurring:PlanRecurringType.ONETIME}})

    const provider = PaymentRegistry.getProvider("STRIPE")
    const session = await provider.initializePaymentSession(userId,product.amount,product.currency,success_url, cancel_url,{userId,payment_id:payment.id, product_id:product.id})

    await prisma.payment.update({where:{id:payment.id}, data:{stripe_sessino_id:session.id}})

    return session
  }

  async capture(providerName: "STRIPE", paymentId: string) {
    
    if (!this.providersLoaded)
      await this.loadProviders()

    const provider = PaymentRegistry.getProvider(providerName);
    return await provider.capturePayment(paymentId);
  }

  async refund(providerName: "STRIPE", paymentId: string, amount: number) {
    if(!this.providersLoaded)
      await this.loadProviders()
    
    const provider = PaymentRegistry.getProvider(providerName);
    return await provider.refundPayment(paymentId, amount);
  }

}








export const paymentSrevice =  new PaymentService()
