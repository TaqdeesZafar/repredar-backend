import { Request, Response } from 'express';
import SearchLog, { ISearchLog } from '../models/SearchLog';

export const logSearch = async (req: Request, res: Response) => {
  try {
    const { platform, searchQuery, resultCount, filters } = req.body;
    
    const log = new SearchLog({
      platform,
      searchQuery,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'Unknown',
      userId: req.user?._id, // Assuming you have user info in request
      resultCount,
      filters
    });

    await log.save();
    res.status(200).json({ message: 'Search logged successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error logging search', error });
  }
};

export const getSearchLogs = async (req: Request, res: Response) => {
  try {
    const { platform, startDate, endDate, limit = 100 } = req.query;
    
    const query: any = {};
    
    if (platform) {
      query.platform = platform;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate as string);
      if (endDate) query.timestamp.$lte = new Date(endDate as string);
    }

    const logs = await SearchLog.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .populate('userId', 'email username'); // Populate user info if needed
    
    res.status(200).json(logs);
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving search logs', error });
  }
};

export const getSearchStats = async (req: Request, res: Response) => {
  try {
    const { platform, startDate, endDate } = req.query;
    
    const matchStage: any = {};
    if (platform) matchStage.platform = platform;
    if (startDate || endDate) {
      matchStage.timestamp = {};
      if (startDate) matchStage.timestamp.$gte = new Date(startDate as string);
      if (endDate) matchStage.timestamp.$lte = new Date(endDate as string);
    }

    const stats = await SearchLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$platform',
          totalSearches: { $sum: 1 },
          uniqueQueries: { $addToSet: '$searchQuery' },
          avgResultCount: { $avg: '$resultCount' }
        }
      },
      {
        $project: {
          platform: '$_id',
          totalSearches: 1,
          uniqueQueries: { $size: '$uniqueQueries' },
          avgResultCount: { $round: ['$avgResultCount', 2] }
        }
      }
    ]);

    res.status(200).json(stats);
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving search stats', error });
  }
}; 
