import express from 'express';
import {
  logSignupPageVisit,
  logSignupAttempt,
  getSignupLogs
} from '../controllers/signupLogController';

const router = express.Router();

// Log when user visits signup page
router.post('/visit', logSignupPageVisit);

// Log signup attempt
router.post('/attempt', logSignupAttempt);

// Get signup logs (protected route - you might want to add authentication middleware)
router.get('/logs', getSignupLogs);

export default router; 