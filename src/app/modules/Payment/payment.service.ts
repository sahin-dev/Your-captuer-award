// PaymentService.ts
import { PaymentStatus } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { PaymentMethod } from "./payment.interface";
import { PaymentRegistry } from "./paymentRegistry";
import { loadProviders } from "./providerLoader";

export class PaymentService {

  private providersLoaded:boolean = false

  private async loadProviders (){
    if(!this.providersLoaded){
      await loadProviders()
      this.providersLoaded = true
    }
  }
  

  async pay(userId:string,providerName: "STRIPE", amount: number, currency: string, method: PaymentMethod, productId:string) {
    if (!this.providersLoaded)
      await this.loadProviders()  

    const payment = await prisma.payment.create({data:{status:PaymentStatus.PENDING,amount,currency,method,productId,userId}})
    
    const provider = PaymentRegistry.getProvider(providerName);
   return await provider.initializePayment(amount, currency, method, payment.id);

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
