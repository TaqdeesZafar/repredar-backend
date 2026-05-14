import express from 'express';
import { fetchUsers, fetchAndAnalyzePosts, generateReport } from '../controllers/tiktokController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/fetch-users', fetchUsers);
router.get('/fetch-analyze-posts', fetchAndAnalyzePosts);
router.get('/generate-pdf-report', authMiddleware, generateReport);

export default router;
