import express from 'express';
import { getSubscriptionProducts, getProductById } from '../controllers/productController';

const router = express.Router();
router.get('/subscription-products', getSubscriptionProducts);
router.get('/subscription-products/:id', getProductById);

export default router;
