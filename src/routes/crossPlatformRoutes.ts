import express from 'express';
import { fetchAndAnalyzePosts, generateFreeReport, generatePaidReport } from '../controllers/crossPlatformController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/fetch-analyze-posts', fetchAndAnalyzePosts);
router.get('/generate-pdf-report', authMiddleware, generateFreeReport);
router.get('/generate-paid-pdf-report', authMiddleware, generatePaidReport);

export default router;
