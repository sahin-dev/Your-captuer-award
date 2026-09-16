// PaymentService.ts
import ApiError from "../../../errors/ApiError";
import config from "../../../config";
import { ContestStatus, PaymentStatus, PlanRecurringType, PaymentType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { contestRuleEngine } from "../Contest/ContestRules/contestRule.engine";
import { storeService } from "../Store/store.service";
import { subscriptionService } from "../Subscription/subscription.service";
import { PaymentFactory } from "./paymentFactory";
import { PaymentRegistry } from "./paymentRegistry";
import { loadProviders } from "./providerLoader";
import httpStatus from 'http-status';

const isUniqueConstraintError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

const buildContestRedirectUrl = (
  requestedUrl: string | undefined,
  fallbackUrl: string,
  frontendUrl: string,
) => {
  try {
    const fallback = new URL(fallbackUrl);
    if (!requestedUrl) return fallback.toString();

    const requested = new URL(requestedUrl);
    const allowedOrigins = new Set([fallback.origin]);
    try {
      allowedOrigins.add(new URL(frontendUrl).origin);
    } catch {
      // The validated fallback origin remains available.
    }

    if (process.env.NODE_ENV !== "production") {
      allowedOrigins.add("http://localhost:3000");
      allowedOrigins.add("http://127.0.0.1:3000");
    }

    return allowedOrigins.has(requested.origin) ? requested.toString() : fallback.toString();
  } catch {
    return fallbackUrl;
  }
};

 export class PaymentService {

  private providersLoaded:boolean = false

  private async loadProviders (){
    if(!this.providersLoaded){
      await loadProviders()
      this.providersLoaded = true
    }
  }
  

  /**
     * Initiate payment for product or subscription
     */
  async pay(
    userId: string,
    productId: string | null,
    planId: string | null,
    mode: 'subscription' | 'payment',
    success_url: string,
    cancel_url: string
  ) {

    if (mode === 'payment') {
      if (!productId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Product ID is required for purchase");
      }
      return await this.purchaseProduct(userId, productId, success_url, cancel_url);
    }

    if (mode === 'subscription') {
      if (!planId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Plan ID is required for subscription");
      }
      return await this.purchaseSubscription(userId, planId, success_url, cancel_url);
    }

    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid payment mode");
  }

  /**
     * Create subscription payment session with Stripe
     */
  async purchaseSubscription(
    userId: string,
    planId: string,
    success_url: string,
    cancel_url: string
  ) {

    console.log(success_url)
    // Validate user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // Get subscription plan
    const plan = await subscriptionService.getPlan(planId);
    if (!plan) {
      throw new ApiError(httpStatus.NOT_FOUND, "Subscription plan not found");
    }

    // Verify Stripe price ID is set
    if (!plan.stripe_price_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "This subscription plan is not available for purchase at this time");
    }

    const session = await prisma.$transaction(async txc => {
          // Create payment record
      const payment = await prisma.payment.create({
        data: {
          amount: plan.amount,
          currency: plan.currency,
          method: "stripe",
          type: PaymentType.SUBSCRIPTION,
          userId,
          planName: plan.planName,
          recurring: plan.recurring,
          planId: plan.id,
          description: `${plan.planName} Subscription - ${plan.recurring}`
        }
      });

      // Calculate subscription dates
      const startDate = new Date();
      let endDate: Date;
      if (plan.recurring === PlanRecurringType.MONTHLY) {
        endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      } else if (plan.recurring === PlanRecurringType.YEARLY) {
        endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      } else {
        endDate = startDate; // ONETIME
      }

      // Create subscription record
      const subscription = await subscriptionService.createSubscription(
        userId,
        plan.id,
        startDate,
        endDate,
        ""
      );

      // Create Stripe session
      const provider = PaymentFactory.getProvider("STRIPE");
      const session = await provider.createSession(
        userId,
        plan.stripe_price_id!,
        'subscription',
        success_url,
        cancel_url,
        {
          userId,
          subscription_id: subscription.id,
          plan_id: plan.id,
          payment_id: payment.id
        }
      );

      // Update subscription and payment with Stripe session ID
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { stripe_session_id: session.id }
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          stripe_session_id: session.id,
          status: PaymentStatus.PENDING
        }
      });
      return session
    })

    return session;
  }

  /**
     * Create product purchase payment session with Stripe
     */
  async purchaseProduct(
    userId: string,
    productId: string,
    success_url: string,
    cancel_url: string
  ) {
    // Validate user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // Get product details
    const product = await storeService.getProductDetails(productId);
    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    // Check product availability
    const isAvailable = await storeService.isProductAvailable(productId);
    if (!isAvailable) {
      throw new ApiError(httpStatus.CONFLICT, "Product is not available for purchase");
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        amount: product.amount,
        type: PaymentType.STORE,
        currency: product.currency || "USD",
        productId: product.id,
        method: "stripe",
        userId,
        recurring: PlanRecurringType.ONETIME,
        description: product.title
      }
    });

    // Create Stripe payment session
    const provider = PaymentFactory.getProvider("STRIPE");
    const session = await provider.initializePaymentSession(
      userId,
      product.amount,
      product.currency || "USD",
      success_url,
      cancel_url,
      {
        userId,
        payment_id: payment.id,
        product_id: product.id
      },
      product.title
    );

    // Update payment with Stripe session ID
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripe_session_id: session.id,
        status: PaymentStatus.PENDING
      }
    });

    return session;
  }

  async purchaseContestEntry(
    userId: string,
    contestId: string,
    success_url?: string,
    cancel_url?: string,
    acceptedRuleKeys?: unknown
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest || contest.status !== ContestStatus.ACTIVE) {
      throw new ApiError(httpStatus.NOT_FOUND, "Contest is not available to participate");
    }

    const existingParticipant = await prisma.contestParticipant.findUnique({
      where: { contestId_userId: { contestId, userId } }
    });
    if (existingParticipant) {
      return {
        contest_id: contestId,
        participant_id: existingParticipant.id,
        message: "You have already joined this contest"
      };
    }

    if (contest.entryFeeAmount <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "This contest does not require Stripe entry payment");
    }

    await contestRuleEngine.validateJoinRules(contestId, userId, acceptedRuleKeys);

    if (contest.entryFeeCoins > 0) {
      const store = await prisma.userStore.findUnique({
        where: { userId },
        select: { coins: true }
      });
      if (!store || store.coins < contest.entryFeeCoins) {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, "Insufficient coins to enter this contest");
      }
    }

    const currency = (contest.currency || "USD").toUpperCase();
    const frontendUrl = config.forontend_url || config.web_redirect_success || "http://localhost:3000";
    const fallbackSuccessUrl = `${frontendUrl}/contest/${contest.id}?payment=success`;
    const fallbackCancelUrl = `${frontendUrl}/contest/${contest.id}?payment=cancelled`;
    const successUrl = buildContestRedirectUrl(success_url, fallbackSuccessUrl, frontendUrl);
    const cancelUrl = buildContestRedirectUrl(cancel_url, fallbackCancelUrl, frontendUrl);

    let ownsSessionCreation = false;
    let payment;
    const existingCheckout = await prisma.contestEntryCheckout.findUnique({
      where: { contestId_userId: { contestId, userId } },
    });

    if (existingCheckout) {
      payment = await prisma.payment.findUnique({ where: { id: existingCheckout.paymentId } });
    } else {
      try {
        payment = await prisma.$transaction(async (tx) => {
          const createdPayment = await tx.payment.create({
            data: {
              amount: contest.entryFeeAmount,
              type: PaymentType.CONTEST,
              currency,
              contestId: contest.id,
              method: "stripe",
              userId,
              recurring: PlanRecurringType.ONETIME,
              description: `Contest entry - ${contest.title}`,
            },
          });
          await tx.contestEntryCheckout.create({
            data: { contestId, userId, paymentId: createdPayment.id },
          });
          return createdPayment;
        });
        ownsSessionCreation = true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const checkout = await prisma.contestEntryCheckout.findUnique({
          where: { contestId_userId: { contestId, userId } },
        });
        payment = checkout
          ? await prisma.payment.findUnique({ where: { id: checkout.paymentId } })
          : null;
      }
    }

    if (!payment) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Unable to prepare contest entry payment");
    }
    if (payment.status === PaymentStatus.SUCCEEDED) {
      throw new ApiError(httpStatus.CONFLICT, "This contest entry payment was already completed");
    }

    const provider = PaymentFactory.getProvider("STRIPE");
    if (payment.stripe_session_id) {
      try {
        const existingSession = await provider.retrieveCheckoutSession(payment.stripe_session_id);
        if (existingSession.status === "open" && existingSession.url) {
          return existingSession;
        }
        if (existingSession.status === "complete" && existingSession.payment_status === "paid") {
          return { message: "Payment received. Your contest entry is being confirmed." };
        }
        if (existingSession.status === "expired") {
          await prisma.payment.updateMany({
            where: { id: payment.id, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.EXPIRED },
          });
          payment = { ...payment, status: PaymentStatus.EXPIRED };
        }
      } catch (error) {
        if ((error as { code?: string })?.code !== "resource_missing") throw error;
        await prisma.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.EXPIRED },
        });
        payment = { ...payment, status: PaymentStatus.EXPIRED };
      }
    }

    if (!ownsSessionCreation) {
      if (payment.status === PaymentStatus.PENDING && !payment.stripe_session_id) {
        const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
        const recovered = await prisma.payment.updateMany({
          where: {
            id: payment.id,
            status: PaymentStatus.PENDING,
            stripe_session_id: null,
            updatedAt: { lt: staleBefore },
          },
          data: { status: PaymentStatus.FAILED },
        });
        if (recovered.count === 0) {
          throw new ApiError(httpStatus.CONFLICT, "Contest checkout is already being prepared");
        }
        payment = { ...payment, status: PaymentStatus.FAILED };
      }

      const claimed = await prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: { in: [PaymentStatus.FAILED, PaymentStatus.EXPIRED] },
        },
        data: {
          status: PaymentStatus.PENDING,
          stripe_session_id: null,
          stripe_payment_id: null,
          amount: contest.entryFeeAmount,
          currency,
        },
      });
      if (claimed.count === 0) {
        throw new ApiError(httpStatus.CONFLICT, "Contest checkout is already being prepared");
      }
    }

    try {
      const session = await provider.initializePaymentSession(
        userId,
        contest.entryFeeAmount,
        currency,
        successUrl,
        cancelUrl,
        {
          userId,
          payment_id: payment.id,
          contest_id: contest.id,
          purpose: "CONTEST_ENTRY",
        },
        `Entry fee - ${contest.title}`,
      );

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          stripe_session_id: session.id,
          status: PaymentStatus.PENDING,
        },
      });
      return session;
    } catch (error) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      throw error;
    }
  }

  /**
     * Handle successful payment webhook from Stripe
     */
  async handlePaymentSuccess(sessionId: string) {
    // Get payment by session ID
    const payment = await prisma.payment.findFirst({
      where: { stripe_session_id: sessionId }
    });

    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");
    }

    // Update payment status
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCEEDED }
    });

    // Handle subscription activation
    if (payment.type === PaymentType.SUBSCRIPTION && payment.subscriptionId) {
      await subscriptionService.activateSubscription(payment.subscriptionId);
    }

    // Handle product purchase - reduce quantity
    if (payment.type === PaymentType.STORE && payment.productId) {
      await storeService.reduceProductQuantity(payment.productId, 1);
    }

    return updatedPayment;
  }

  /**
     * Handle payment failure
     */
  async handlePaymentFailure(sessionId: string, reason?: string) {
    const payment = await prisma.payment.findFirst({
      where: { stripe_session_id: sessionId }
    });

    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");
    }

    // Update payment status to failed
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        description: reason || "Payment failed"
      }
    });

    return updatedPayment;
  }

  /**
     * Capture payment (for preauthorized transactions)
     */
  async capture(providerName: "STRIPE", paymentId: string) {
    if (!this.providersLoaded)
      await this.loadProviders();

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId }
    });

    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");
    }

    const provider = PaymentRegistry.getProvider(providerName);
    const captureResult = await provider.capturePayment(paymentId);

    // Update payment status
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.SUCCEEDED }
    });

    return captureResult;
  }

  /**
     * Refund payment
     */
  async refund(providerName: "STRIPE", paymentId: string, amount: number) {
    if (!this.providersLoaded)
      await this.loadProviders();

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId }
    });

    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");
    }

    if (amount > payment.amount) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Refund amount cannot exceed payment amount");
    }

    const provider = PaymentRegistry.getProvider(providerName);
    const refundResult = await provider.refundPayment(paymentId, amount);

    // Update payment status
    const newStatus = amount === payment.amount ? PaymentStatus.FAILED : PaymentStatus.SUCCEEDED;
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        amount: payment.amount - amount
      }
    });

    // If it's a product purchase, restore quantity
    if (payment.type === PaymentType.STORE && payment.productId && amount === payment.amount) {
      await storeService.increaseProductQuantity(payment.productId, 1);
    }

    return refundResult;
  }

  /**
     * Get payment history for user
     */
  async getUserPayments(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const payments = await prisma.payment.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } }
    });

    const total = await prisma.payment.count({ where: { userId } });
    const totalPages = Math.ceil(total / limit);

    return {
      meta: {
        page,
        limit,
        total,
        totalPage: totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      data: payments
    };
  }

  /**
     * Get payment details
     */
  async getPaymentDetails(paymentId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { user: true }
    });

    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");
    }

    return payment;
  }

  /**
     * Get payment by Stripe session ID
     */
  async getPaymentBySessionId(sessionId: string) {
    const payment = await prisma.payment.findFirst({
      where: { stripe_session_id: sessionId }
    });

    return payment || null;
  }

  /**
     * Cancel pending payment
     */
  async cancelPayment(paymentId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId }
    });

    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new ApiError(httpStatus.CONFLICT, "Only pending payments can be canceled");
    }

    const canceledPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.FAILED }
    });

    return canceledPayment;
  }

}








export const paymentService = new PaymentService();
