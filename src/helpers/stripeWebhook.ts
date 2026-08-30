import { Request, Response } from "express";
import Stripe from "stripe";
import { notificationService } from "../app/modules/Notification/notification.service";
import config from "../config";
import { NotificationType, PaymentStatus } from "../prismaClient";
import prisma from "../shared/prisma";

const stripe = new Stripe(config.stripe_key as string);

const paymentUserSelection = {
  fullName: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

type NotificationPayment = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  description?: string | null;
  planName?: string | null;
  type?: string | null;
};

const formatPaymentAmount = (amount: number, currency?: string | null) => {
  const normalizedCurrency = (currency || "USD").toUpperCase();

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
};

const getPayerName = (user?: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) => {
  const fullName = user?.fullName?.trim();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

  return fullName || name || user?.email || "A user";
};

const getPaymentPurpose = (payment: NotificationPayment) => {
  if (payment.description?.trim()) {
    return payment.description.trim();
  }

  if (payment.planName) {
    return `${payment.planName} subscription`;
  }

  if (payment.type === "STORE") {
    return "a store purchase";
  }

  if (payment.type === "CONTEST") {
    return "a contest payment";
  }

  return "a payment";
};

const notifyUserOfSuccess = async (
  payment: NotificationPayment,
  coinQuantity?: number,
) => {
  const amount = formatPaymentAmount(payment.amount, payment.currency);
  const purpose = getPaymentPurpose(payment);
  const message = coinQuantity
    ? `${coinQuantity} coins were successfully added to your account.`
    : `Your payment of ${amount} for ${purpose} was successful.`;

  await notificationService.postNotificationWithPayload(
    coinQuantity ? "Coins Added" : "Payment Successful",
    message,
    payment.userId,
    {
      event: "PAYMENT_SUCCEEDED",
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      ...(coinQuantity ? { coinQuantity } : {}),
    },
    NotificationType.PAYMENT,
  );
};

const notifyUserOfFailure = async (payment: NotificationPayment) => {
  const amount = formatPaymentAmount(payment.amount, payment.currency);
  const purpose = getPaymentPurpose(payment);

  await notificationService.postNotificationWithPayload(
    "Payment Failed",
    `Your payment of ${amount} for ${purpose} failed. Please try again or use a different payment method.`,
    payment.userId,
    {
      event: "PAYMENT_FAILED",
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
    },
    NotificationType.PAYMENT,
  );
};

const findPaymentForFailedIntent = async (intent: Stripe.PaymentIntent) => {
  const metadataPaymentId =
    intent.metadata.paymentId || intent.metadata.payment_id;

  if (metadataPaymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: metadataPaymentId },
    });
    if (payment) {
      return payment;
    }
  }

  const paymentByIntent = await prisma.payment.findFirst({
    where: { stripe_payment_id: intent.id },
  });
  if (paymentByIntent) {
    return paymentByIntent;
  }

  const sessions = await stripe.checkout.sessions.list({
    payment_intent: intent.id,
    limit: 1,
  });
  const session = sessions.data[0];

  if (!session) {
    return null;
  }

  return prisma.payment.findFirst({
    where: { stripe_session_id: session.id },
  });
};

const markPaymentFailedAndNotify = async (
  payment: Awaited<ReturnType<typeof findPaymentForFailedIntent>>,
  stripePaymentId?: string,
) => {
  if (!payment || payment.status === PaymentStatus.SUCCEEDED) {
    return;
  }

  const updated = await prisma.payment.updateMany({
    where: {
      id: payment.id,
      status: payment.status,
    },
    data: {
      status: PaymentStatus.FAILED,
      ...(stripePaymentId ? { stripe_payment_id: stripePaymentId } : {}),
    },
  });

  if (updated.count === 0 || payment.status === PaymentStatus.FAILED) {
    return;
  }

  await notifyUserOfFailure(payment);
};

const handleCheckoutSuccess = async (session: Stripe.Checkout.Session) => {
  const payment = await prisma.payment.findFirst({
    where: { stripe_session_id: session.id },
    include: { user: { select: paymentUserSelection } },
  });

  if (!payment) {
    throw new Error(`Payment for Stripe Checkout Session ${session.id} was not found`);
  }

  if (payment.status === PaymentStatus.SUCCEEDED) {
    return;
  }

  const productId = session.metadata?.product_id;
  const product =
    session.mode === "payment" && productId
      ? await prisma.product.findUnique({ where: { id: productId } })
      : null;
  const subscription =
    session.mode === "subscription"
      ? await prisma.subscription.findFirst({
          where: { stripe_session_id: session.id },
        })
      : null;

  if (session.mode === "payment" && !product) {
    throw new Error(`Product for Stripe Checkout Session ${session.id} was not found`);
  }
  if (session.mode === "subscription" && !subscription) {
    throw new Error(
      `Subscription for Stripe Checkout Session ${session.id} was not found`,
    );
  }
  if (
    product?.category === "COINS" &&
    (!product.quantity || product.quantity <= 0)
  ) {
    throw new Error(`Coin quantity for product ${product.id} is invalid`);
  }

  const stripePaymentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  const transitioned = await prisma.payment.updateMany({
    where: { id: payment.id, status: payment.status },
    data: {
      status: PaymentStatus.SUCCEEDED,
      ...(stripePaymentId ? { stripe_payment_id: stripePaymentId } : {}),
    },
  });

  if (transitioned.count === 0) {
    return;
  }

  if (subscription) {
    const stripeSubscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "VALID",
        ...(stripeSubscriptionId
          ? { subscription_id: stripeSubscriptionId }
          : {}),
      },
    });
    await prisma.user.update({
      where: { id: payment.userId },
      data: { purchased_plan: payment.planName },
    });
  }

  let coinQuantity: number | undefined;
  if (product?.category === "COINS" && product.quantity) {
    coinQuantity = product.quantity;
    await prisma.userStore.upsert({
      where: { userId: payment.userId },
      create: { userId: payment.userId, coins: product.quantity },
      update: { coins: { increment: product.quantity } },
    });
  }

  await notifyUserOfSuccess(payment, coinQuantity);

  const payerName = getPayerName(payment.user);
  const amount = formatPaymentAmount(payment.amount, payment.currency);
  const purpose = getPaymentPurpose(payment);
  await notificationService.postNotification(
    "Payment Received",
    `${payerName} paid ${amount} for ${purpose}.`,
    "admin",
    NotificationType.PAYMENT,
  );
};

const stripeWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];

  if (typeof signature !== "string") {
    res.status(400).send("Missing Stripe signature");
    return;
  }
  if (!config.webhook_secret) {
    res.status(500).send("Stripe webhook is not configured");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      config.webhook_secret,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error verifying Stripe webhook signature:", message);
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutSuccess(event.data.object as Stripe.Checkout.Session);
        break;

      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const payment = await findPaymentForFailedIntent(intent);
        await markPaymentFailedAndNotify(payment, intent.id);
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const payment = await prisma.payment.findFirst({
          where: { stripe_session_id: session.id },
        });
        const stripePaymentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        await markPaymentFailedAndNotify(payment, stripePaymentId);
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    res.status(200).send("Webhook received");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error handling Stripe event ${event.id}:`, message);
    res.status(500).send("Webhook processing failed");
  }
};

export default stripeWebhook;
