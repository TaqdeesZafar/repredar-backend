import express from 'express';
import { fetchUsers, fetchProfileUsers, fetchAndAnalyzePosts, generateFreeReport, generatePaidReport } from '../controllers/facebookController';
import { authMiddleware } from '../middleware/authMiddleware';
const router = express.Router();

router.get('/fetch-users', fetchUsers);
router.get('/fetch-profile-users', fetchProfileUsers);
router.get('/fetch-analyze-posts', fetchAndAnalyzePosts);
router.get('/generate-pdf-report', authMiddleware, generateFreeReport);
router.get('/generate-paid-pdf-report', authMiddleware, generatePaidReport);

export default router;
