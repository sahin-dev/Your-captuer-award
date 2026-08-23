import { Request, Response } from 'express';
import config from '../config';
import Stripe from 'stripe';
import prisma from '../shared/prisma';
import { NotificationType, PaymentStatus } from '../prismaClient';
import { notificationService } from '../app/modules/Notification/notification.service';
const stripe = require('stripe')(config.stripe_key as string, {apiVersion: "2025-08-27.basil"});

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

const getPaymentPurpose = (payment: {
  description?: string | null;
  planName?: string | null;
  type?: string | null;
}) => {
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

const stripeWebhook =  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
  
    if (!sig) {
      console.error('Missing Stripe signature header');
        res.status(400).send('Missing signature');
    }
  
    try {

      const event = stripe.webhooks.constructEvent(req.body, sig, config.webhook_secret as string);
  
      console.log(`✅ Stripe event received: ${event.type}`);
  
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object;
       
          console.log('💰 PaymentIntent was successful:');
          break;
  
        case 'checkout.session.completed':
            const session = event.data.object as Stripe.Checkout.Session;
             const subscriptionId = session.subscription as string;
            const customerId = session.customer as string;
            const userId = session.metadata?.userId;
            const productId = session.metadata?.product_id;
            
            const payment = await prisma.payment.findFirst({
              where:{stripe_session_id:session.id},
              include: {
                user: {
                  select: {
                    fullName: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            })
            
            if(!payment){
              console.log("Payment not found")
              break
            }
            
            await prisma.payment.update({where:{id:payment.id}, data:{status:PaymentStatus.SUCCEEDED}})
            if(session.mode === 'subscription'){
              const subscription = await prisma.subscription.findFirst({where:{stripe_session_id:session.id}})
              if(!subscription){
                console.log("Subscription not found")
                break
              }
              await prisma.subscription.update({where:{id:subscription.id}, data:{status:'VALID'}})
              await prisma.user.update({where:{id:payment.userId}, data:{purchased_plan:payment.planName}})
            }

            if(session.mode === 'payment'){
              const store = await prisma.userStore.findUnique({where:{userId:payment.userId}})
              const product = await prisma.product.findUnique({where:{id:productId}})
              if(!product || product.category !== 'COINS'){
                console.log("Product not found")
                break
              }
              if(store && product.quantity){
                await prisma.userStore.update({where:{userId:payment.userId}, data:{coins: {increment: product.quantity}}})
              }
            }

            const payerName = getPayerName(payment.user);
            const amount = formatPaymentAmount(payment.amount, payment.currency);
            const purpose = getPaymentPurpose(payment);
            await notificationService.postNotification(
              "Payment Received",
              `${payerName} paid ${amount} for ${purpose}.`,
              "admin",
              NotificationType.PAYMENT
            )
            console.log(`✅ Subscribed: ${subscriptionId}, Customer: ${customerId}, User: ${userId}`);
          break;
        case 'invoice.payment_succeeded':
          const stripe_payment = event.data.object
          console.log(stripe_payment)
  
        default:
          console.log(`⚠️ Unhandled event type: ${event.type}`);
      }
  
      res.status(200).send('Webhook received');
    } catch (err: any) {
      console.error('❌ Error verifying webhook signature:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  };

export default stripeWebhook;
