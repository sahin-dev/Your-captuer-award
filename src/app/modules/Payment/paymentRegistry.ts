// src/payment/PaymentRegistry.ts
import { PaymentProvider } from "./payment.interface";

export class PaymentRegistry {
  private static providers: Map<string, PaymentProvider> = new Map();

  static registerProvider(name: string, provider: PaymentProvider) {
    this.providers.set(name, provider);
  }

  static getProvider(name: string): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Payment provider "${name}" not found`);
    return provider;
  }

  static listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
