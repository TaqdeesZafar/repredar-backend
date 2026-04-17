import { Request, Response } from 'express';
import stripe from '../services/stripe.service';
import Stripe from 'stripe';


// -----------NOTE------------
// in order to get product through api :
// 1- product should have default_price attached to it via postman
//     default_price : id of the price object attached to product
// 2- metadata[token_count] should be attached to product via postman
//     metadata[token_count]: token amount you want to attach

export const getSubscriptionProducts = async (req: Request, res: Response) => {
  try {
    const products = await stripe.products.list({
      active: true,
      expand: ['data.default_price'],
    });

    const formatted = products.data
      .filter(product => {
        return (
          product.metadata.site === 'Reputation_Return' &&
          typeof product.default_price !== 'string' &&
          product.default_price
        );
      })
      .map(product => {
        const defaultPrice = product.default_price as Stripe.Price;

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          priceId: defaultPrice.id,
          amount: defaultPrice.unit_amount ? defaultPrice.unit_amount / 100 : null,
          currency: defaultPrice.currency,
          interval: defaultPrice.recurring?.interval,
          tokens: parseInt(product.metadata.token_count || '0', 10),
        };
      });

    res.json({ products: formatted });
  } catch (error) {
    console.error('[Stripe] Failed to load products:', error);
    res.status(500).json({ error: 'Failed to load subscription products' });
  }
};


export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const product = await stripe.products.retrieve(id, {
      expand: ['default_price'],
    });

    if (typeof product.default_price === 'string' || !product.default_price) {
      res.status(400).json({ error: 'Product has no default price set' });
      return;
    }

    const price = product.default_price as Stripe.Price;

    res.json({
      id: product.id,
      name: product.name,
      description: product.description,
      priceId: price.id,
      amount: price.unit_amount ? price.unit_amount / 100 : null,
      currency: price.currency,
      interval: price.recurring?.interval,
      tokens: parseInt(product.metadata.token_count || '0', 10),
    });
  } catch (error) {
    console.error('[Stripe] Failed to fetch product:', error);
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
};
