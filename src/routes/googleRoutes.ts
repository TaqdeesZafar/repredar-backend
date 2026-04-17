import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { fetchAndAnalyzeBusinesses, fetchBusinesses, generateFreeReport, generatePaidReport } from '../controllers/googleController';
const router = express.Router();

router.get('/fetch-businesses', fetchBusinesses);
router.get('/fetch-analyze-businesses', fetchAndAnalyzeBusinesses);
router.get('/generate-pdf-report', authMiddleware, generateFreeReport);
router.get('/generate-paid-pdf-report', authMiddleware, generatePaidReport);

export default router;
