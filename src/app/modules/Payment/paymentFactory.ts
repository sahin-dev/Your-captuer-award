// PaymentFactory.ts
import { PaymentProvider } from "./payment.interface";
import { StripeProvider } from "./Providers/stripeProvider";

export class PaymentFactory {
  static getProvider(provider: "STRIPE"): PaymentProvider {
    switch (provider) {
      case "STRIPE":
        return new StripeProvider();
      default:
        throw new Error("Unsupported payment provider");
    }
  }
}
