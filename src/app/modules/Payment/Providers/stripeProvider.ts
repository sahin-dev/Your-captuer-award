import Stripe from "stripe";
import config from "../../../../config";
import prisma from "../../../../shared/prisma";
import { userService } from "../../User/user.service";
import { PaymentMethod, PaymentProvider } from "../payment.interface";
import { PaymentRegistry } from "../paymentRegistry";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export class StripeProvider implements PaymentProvider {
  private readonly stripe: Stripe;

  constructor() {
    const stripeKey = config.stripe_key;
    if (!stripeKey) {
      throw new Error(
        "Error creating Stripe provider: STRIPE_SECRET_KEY is not configured",
      );
    }

    this.stripe = new Stripe(stripeKey, {
      maxNetworkRetries: 2,
      typescript: true,
    });
  }

  async initializePaymentSession(
    userId: string,
    amount: number,
    currency: string,
    successUrl: string,
    cancelUrl: string,
    data?: Stripe.MetadataParam,
    title?: string,
  ): Promise<Stripe.Checkout.Session> {
    const customer = await this.createCustomer(userId);

    return this.stripe.checkout.sessions.create({
      customer: customer.id,
      managed_payments: {
        enabled: false,
      },
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: this.normalizeCurrency(currency),
            product_data: { name: title || "Coin Product" },
            unit_amount: this.toMinorUnits(amount, currency),
          },
          quantity: 1,
        },
      ],
      metadata: data,
      payment_intent_data: data ? { metadata: data } : undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async initializePayment(
    amount: number,
    currency: string,
    _method: PaymentMethod,
    paymentId: string,
  ): Promise<string> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: this.toMinorUnits(amount, currency),
        currency: this.normalizeCurrency(currency),
        capture_method: "manual",
        metadata: { paymentId },
      },
      { idempotencyKey: `payment-intent-${paymentId}` },
    );

    await prisma.payment.update({
      where: { id: paymentId },
      data: { stripe_payment_id: intent.id },
    });

    if (!intent.client_secret) {
      throw new Error(`Stripe did not return a client secret for ${intent.id}`);
    }

    return intent.client_secret;
  }

  async createSession(
    userId: string,
    priceId: string,
    mode: "subscription" | "payment",
    successUrl: string,
    cancelUrl: string,
    data?: Stripe.MetadataParam,
  ): Promise<Stripe.Checkout.Session> {
    const customer = await this.createCustomer(userId);

    return this.stripe.checkout.sessions.create({
      customer: customer.id,
      mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: data,
      ...(data && mode === "payment"
        ? { payment_intent_data: { metadata: data } }
        : {}),
      ...(data && mode === "subscription"
        ? { subscription_data: { metadata: data } }
        : {}),
    });
  }

  async createCustomer(userId: string): Promise<Stripe.Customer> {
    const user = await userService.getUserDetails(userId);

    if (user.customerId) {
      try {
        const customer = await this.stripe.customers.retrieve(user.customerId);
        if (!customer.deleted) {
          return customer;
        }
      } catch (error) {
        if (!this.isMissingStripeResource(error)) {
          throw error;
        }
      }
    }

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: name || undefined,
      metadata: { userId: user.id },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { customerId: customer.id },
    });

    return customer;
  }

  async addProduct(title: string): Promise<Stripe.Product> {
    return this.stripe.products.create({ name: title });
  }

  async addPrice(
    productId: string,
    amount: number,
    currency: string,
    recurring?: Stripe.PriceCreateParams.Recurring,
  ): Promise<Stripe.Price> {
    return this.stripe.prices.create({
      product: productId,
      currency: this.normalizeCurrency(currency),
      unit_amount: this.toMinorUnits(amount, currency),
      recurring,
    });
  }

  async capturePayment(paymentId: string): Promise<boolean> {
    const stripePaymentId = await this.getStripePaymentIntentId(paymentId);
    const currentIntent = await this.stripe.paymentIntents.retrieve(stripePaymentId);

    if (currentIntent.status === "succeeded") {
      return true;
    }

    if (currentIntent.status !== "requires_capture") {
      throw new Error(
        `Stripe PaymentIntent ${stripePaymentId} cannot be captured from status ${currentIntent.status}`,
      );
    }

    const capturedIntent =
      await this.stripe.paymentIntents.capture(stripePaymentId);
    return capturedIntent.status === "succeeded";
  }

  async refundPayment(paymentId: string, amount: number): Promise<boolean> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { amount: true, currency: true },
    });
    if (!payment) {
      throw new Error(`Payment ${paymentId} was not found`);
    }

    const stripePaymentId = await this.getStripePaymentIntentId(paymentId);
    const refundAmount = this.toMinorUnits(amount, payment.currency);
    const remainingAmount = this.toMinorUnits(payment.amount, payment.currency);
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: stripePaymentId,
        amount: refundAmount,
        metadata: { paymentId },
      },
      {
        idempotencyKey: `refund-${paymentId}-${remainingAmount}-${refundAmount}`,
      },
    );

    return refund.status !== "failed" && refund.status !== "canceled";
  }

  private async getStripePaymentIntentId(paymentId: string): Promise<string> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { stripe_payment_id: true, stripe_session_id: true },
    });

    if (!payment) {
      throw new Error(`Payment ${paymentId} was not found`);
    }

    if (payment.stripe_payment_id) {
      return payment.stripe_payment_id;
    }

    if (!payment.stripe_session_id) {
      throw new Error(`Payment ${paymentId} has no Stripe payment reference`);
    }

    const session = await this.stripe.checkout.sessions.retrieve(
      payment.stripe_session_id,
    );
    const stripePaymentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;

    if (!stripePaymentId) {
      throw new Error(
        `Stripe Checkout Session ${session.id} has no PaymentIntent to process`,
      );
    }

    await prisma.payment.update({
      where: { id: paymentId },
      data: { stripe_payment_id: stripePaymentId },
    });

    return stripePaymentId;
  }

  private normalizeCurrency(currency: string): string {
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new Error(`Invalid Stripe currency: ${currency}`);
    }
    return normalizedCurrency.toLowerCase();
  }

  private toMinorUnits(amount: number, currency: string): number {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Stripe amount must be a positive number");
    }

    const normalizedCurrency = currency.trim().toUpperCase();
    if (
      (normalizedCurrency === "ISK" || normalizedCurrency === "UGX") &&
      !Number.isInteger(amount)
    ) {
      throw new Error(`${normalizedCurrency} amounts cannot include fractions`);
    }
    const multiplier = ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) ? 1 : 100;
    const minorAmount = Math.round((amount + Number.EPSILON) * multiplier);

    if (!Number.isSafeInteger(minorAmount) || minorAmount <= 0) {
      throw new Error("Stripe amount is outside the supported range");
    }

    return minorAmount;
  }

  private isMissingStripeResource(error: unknown): boolean {
    return (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.code === "resource_missing"
    );
  }
}

PaymentRegistry.registerProvider("STRIPE", new StripeProvider());
