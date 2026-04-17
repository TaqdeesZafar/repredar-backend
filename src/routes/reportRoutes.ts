import express from 'express';
import { getUserReports, downloadReportPdf } from '../controllers/reportController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/my-reports', authMiddleware, getUserReports);
router.get('/download/:id', authMiddleware, downloadReportPdf);

export default router;