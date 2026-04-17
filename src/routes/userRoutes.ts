import express from 'express';
import { getLoggedInUser } from '../controllers/userController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/profile', authMiddleware, getLoggedInUser); 
export default router;
