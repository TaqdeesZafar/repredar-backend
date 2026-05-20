import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { fetchAndAnalyzeBusinesses, fetchBusinesses, generateReport } from '../controllers/googleController';

const router = express.Router();

router.get('/fetch-businesses', fetchBusinesses);
router.get('/fetch-analyze-businesses', fetchAndAnalyzeBusinesses);
router.get('/generate-pdf-report', generateReport);

export default router;
