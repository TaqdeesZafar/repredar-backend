import { Request, Response } from 'express';
import User from '../models/User';

export const getLoggedInUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (err) {
    console.error('[User] Fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
