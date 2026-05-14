import express from 'express';
import { fetchAndAnalyzePosts, generateReport } from '../controllers/crossPlatformController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/fetch-analyze-posts', fetchAndAnalyzePosts);
router.get('/generate-pdf-report', authMiddleware, generateReport);

export default router;
