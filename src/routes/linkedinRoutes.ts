import express from 'express';
import { fetchUsers, fetchAndAnalyzePosts, generateFreeReport, generatePaidReport } from '../controllers/linkedinController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/fetch-users', fetchUsers);
router.get('/fetch-analyze-posts', fetchAndAnalyzePosts);
router.get('/generate-pdf-report', authMiddleware, generateFreeReport);
router.get('/generate-paid-pdf-report', authMiddleware, generatePaidReport);

export default router;
