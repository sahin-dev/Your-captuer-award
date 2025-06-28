import { Request, Response } from 'express';
import config from '../config';
import Stripe from 'stripe';
const stripe = require('stripe')(config.stripe_key as string);

const stripeWebhook =  async (req: Request, res: Response) => {
    console.log('Webhook received!');
    const sig = req.headers['stripe-signature'] as string;
  
    if (!sig) {
      console.error('Missing Stripe signature header');
        res.status(400).send('Missing signature');
    }
  
    try {
      // The raw body is required here
      const event = stripe.webhooks.constructEvent(req.body, sig, config.webhook_secret as string);
  
      console.log(`✅ Stripe event received: ${event.type}`);
  
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object;
          console.log('💰 PaymentIntent was successful:', paymentIntent);
          break;
  
        case 'checkout.session.completed':
            const session = event.data.object as Stripe.Checkout.Session;

            const subscriptionId = session.subscription as string;
            const customerId = session.customer as string;
            const userId = session.metadata?.userId;
        
            console.log(`✅ Subscribed: ${subscriptionId}, Customer: ${customerId}, User: ${userId}`);
          break;
  
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