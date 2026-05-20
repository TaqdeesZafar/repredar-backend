import express from 'express';
import { fetchUsers, fetchAndAnalyzePosts, generateReport, enrichUsers } from '../controllers/linkedinController';

const router = express.Router();

router.get('/fetch-users', fetchUsers);
router.post('/enrich-users', enrichUsers);
router.get('/fetch-analyze-posts', fetchAndAnalyzePosts);
router.get('/generate-pdf-report', generateReport);

export default router;
