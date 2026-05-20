import { Request, Response } from 'express';
import stripe from '../services/stripe.service';
import Stripe from 'stripe';
import User from '../models/User';


export const createCheckoutSession = async (req: Request, res: Response): Promise<void> => {
  const { priceId } = req.body;
  const userId = (req as any).user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized: Missing user ID in token.' });
    return;
  }

  const user = await User.findById(userId);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  try {
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
      });

      stripeCustomerId = customer.id;
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    if (user.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      user.subscriptionStatus = 'cancelled';
      user.tokens = 0;
      user.stripeSubscriptionId = undefined;
      user.productId = "";
      await user.save();
    }


    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'https://reputationseeker.netlify.app/profile-info',
      cancel_url: 'https://reputationseeker.netlify.app/profile-info',
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Stripe checkout failed' });
  }
};

export const cancelSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Missing user ID.' });
      return;
    }

    const user = await User.findById(userId);

    if (!user || !user.stripeSubscriptionId) {
      res.status(400).json({ error: 'No active subscription to cancel.' });
      return;
    }

    await stripe.subscriptions.cancel(user.stripeSubscriptionId);

    user.subscriptionStatus = 'cancelled';
    user.tokens = 0;
    user.stripeSubscriptionId = undefined;
    await user.save();

    res.status(200).json({ message: 'Subscription cancelled successfully' });
  } catch (err) {
    console.error('[Stripe] Cancel error:', err);
    res.status(500).json({ error: 'Cancellation failed' });
  }
};

export const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature']!;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    if (err instanceof Error) {
      console.error('[Webhook] Signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    } else {
      console.error('[Webhook] Unknown error');
      res.status(400).send(`Webhook Error: Unknown error`);
    }
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
    
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
      const priceId = subscription.items.data[0].price.id;
    
      const price = await stripe.prices.retrieve(priceId);
      const productId = price.product as string;
    
      const product = await stripe.products.retrieve(productId);
      const tokenCount = parseInt(product.metadata.token_count || '0', 10);
    
      const user = await User.findOne({ stripeCustomerId: customerId });
    
      if (user) {
        user.stripeSubscriptionId = subscriptionId;
        user.subscriptionStatus = 'active';
        user.tokens = tokenCount;
        user.productId = productId; 
        await user.save();
        console.log(`[Webhook] Subscribed: ${user.email}, tokens granted: ${tokenCount}`);
      } else {
        console.warn(`[Webhook] No user found for customer: ${customerId}`);
      }
    
      break;
    }
    
    

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
    
      const customerId = invoice.customer as string;
      const subscriptionId = (invoice as any).subscription as string;

      if (!subscriptionId) {
        console.warn('[Webhook] No subscription ID on invoice');
        break;
      }
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0].price.id;
    
      const price = await stripe.prices.retrieve(priceId);
      const productId = price.product as string;
      const product = await stripe.products.retrieve(productId);
    
      const tokenCount = parseInt(product.metadata.token_count || '0', 10);
    
      const user = await User.findOne({ stripeCustomerId: customerId });
    
      if (user) {
        user.tokens = 0; 
        user.tokens = tokenCount;
        await user.save();
        console.log(`[Webhook] Refilled tokens for ${user.email}: ${tokenCount}`);
      } else {
        console.warn(`[Webhook] No user found for customer: ${customerId}`);
      }
    
      break;
    }
    

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const user = await User.findOne({ stripeSubscriptionId: subscription.id });
    
      if (user) {
        user.subscriptionStatus = 'cancelled';
        user.tokens = 0;
        user.productId = ""; 
        await user.save();
        console.log('[Webhook] User subscription marked as cancelled:', user.email);
      }
    
      break;
    }
    

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }

  res.send();
};

