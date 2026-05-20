import express from 'express';
import { fetchUsers, fetchAndAnalyzeTweets, generateReport } from '../controllers/twitterController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/fetch-users', fetchUsers);
router.get('/fetch-analyze-tweets', fetchAndAnalyzeTweets);
router.get('/generate-pdf-report', generateReport);

export default router;
