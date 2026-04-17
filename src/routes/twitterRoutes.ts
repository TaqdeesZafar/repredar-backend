import express from 'express';
import { fetchUsers, fetchAndAnalyzeTweets, generateFreeReport, generatePaidReport } from '../controllers/twitterController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/fetch-users', fetchUsers);
router.get('/fetch-analyze-tweets', fetchAndAnalyzeTweets);
router.get('/generate-pdf-report', authMiddleware, generateFreeReport);
router.get('/generate-paid-pdf-report', authMiddleware, generatePaidReport);

export default router;
