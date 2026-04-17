import express from 'express';
import { handleStripeWebhook, createCheckoutSession, cancelSubscription } from '../controllers/paymentController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

router.post('/checkout-session', express.json(),  authMiddleware, createCheckoutSession);
router.post('/cancel-subscription', express.json(), authMiddleware, cancelSubscription);

export default router;
