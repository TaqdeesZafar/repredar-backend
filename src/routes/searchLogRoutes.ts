import express from 'express';
import {
  logSearch,
  getSearchLogs,
  getSearchStats
} from '../controllers/searchLogController';

const router = express.Router();

// Log a search (can be public)
router.post('/log', logSearch);

// Get search logs (protected)
router.get('/logs', getSearchLogs);

// Get search statistics (protected)
router.get('/stats', getSearchStats);

export default router; 