import express from 'express';
import { searchProfile, fetchAndAnalyzePosts, generateFreeReport, generatePaidReport  } from '../controllers/instagramController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/search-profile', searchProfile);
router.get('/fetch-analyze-posts', fetchAndAnalyzePosts);
router.get('/generate-pdf-report', authMiddleware, generateFreeReport);
router.get('/generate-paid-pdf-report', authMiddleware, generatePaidReport);

export default router; 