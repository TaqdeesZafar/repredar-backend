import express from 'express';
import { getUserReports, downloadReportPdf, downloadReportByToken } from '../controllers/reportController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/my-reports', authMiddleware, getUserReports);
router.get('/download/:id', authMiddleware, downloadReportPdf);
router.get('/public/:token', downloadReportByToken); // No auth — for GHL email links

export default router;
