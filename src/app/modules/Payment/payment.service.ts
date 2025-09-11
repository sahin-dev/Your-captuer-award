// PaymentService.ts
import { PaymentMethod } from "./payment.interface";
import { PaymentRegistry } from "./paymentRegistry";

export class PaymentService {
  

  async pay(providerName: "STRIPE", amount: number, currency: string, method: PaymentMethod) {
    const provider = PaymentRegistry.getProvider(providerName);
    return await provider.initializePayment(amount, currency, method);
  }

  async capture(providerName: "STRIPE", paymentId: string) {
    const provider = PaymentRegistry.getProvider(providerName);
    return await provider.capturePayment(paymentId);
  }

  async refund(providerName: "STRIPE", paymentId: string, amount: number) {
    const provider = PaymentRegistry.getProvider(providerName);
    return await provider.refundPayment(paymentId, amount);
  }
}








export const paymentSrevice =  new PaymentService()
