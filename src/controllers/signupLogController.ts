import { Request, Response } from 'express';
import SignupLog, { ISignupLog } from '../models/SignupLog';

export const logSignupPageVisit = async (req: Request, res: Response) => {
  try {
    const log = new SignupLog({
      eventType: 'PAGE_VISIT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'Unknown'
    });

    await log.save();
    res.status(200).json({ message: 'Page visit logged successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error logging page visit', error });
  }
};

export const logSignupAttempt = async (req: Request, res: Response) => {
  try {
    const { success, errorMessage } = req.body;
    
    const log = new SignupLog({
      eventType: 'SIGNUP_ATTEMPT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'Unknown',
      success,
      errorMessage
    });

    await log.save();
    res.status(200).json({ message: 'Signup attempt logged successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error logging signup attempt', error });
  }
};

export const getSignupLogs = async (req: Request, res: Response) => {
  try {
    const logs = await SignupLog.find()
      .sort({ timestamp: -1 })
      .limit(100);
    
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving signup logs', error });
  }
}; 