import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { analyzeAndCombineData } from "../utils/getFreeReport"
import { generateFreePdfReport , generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import Report from '../models/Report';
import User from '../models/User';


dotenv.config();

  const tiktokHeaders = {
    'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
  };

  const tiktokSearchApiUrl = process.env.TIKTOK_SEARCH_API_URL;
  const tiktokPostsIdsApiUrl = process.env.TIKTOK_POSTS_IDS_API_URL;
  const tiktokPostRepliesApiUrl = process.env.TIKTOK_POST_REPLIES_API_URL;
  const tiktokData = process.env.TIKTOK_DATA_API_URL;


export const fetchUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { query } = req.query;

        if (!query) {
            res.status(400).json({ message: 'Missing required query parameters: keyword or cursor' });
            return;
        }

        if (!tiktokSearchApiUrl) {
            res.status(500).json({ message: 'API URLs for Tiktok are not defined in .env' });
            return;
        }

        const tiktokParamsCursor0 = {
            keyword: query.toString(),
            cursor: 10,
            search_id: 0
          };
      
          const tiktokParamsCursor10 = {
            keyword: query.toString(),
            cursor: 10,
            search_id: 0
          };

          const [tiktokResponseCursor0, tiktokResponseCursor10] = await Promise.all([
            axios.get(tiktokSearchApiUrl, { headers: tiktokHeaders, params: tiktokParamsCursor0 }),
            axios.get(tiktokSearchApiUrl, { headers: tiktokHeaders, params: tiktokParamsCursor10 }),
          ]);

          const combinedData = {
            tiktokUsers: [
              ...tiktokResponseCursor0.data.user_list,
              ...tiktokResponseCursor10.data.user_list,
            ],
          };

        res.json(combinedData);

    } catch (error) {
        console.error('Error fetching data from external APIs:', error);
        res.status(500).json({ message: 'Failed to fetch data from external APIs' });
    }
};

export const fetchPostsById = async (secUid: string) => {
  try {
    const tiktokParams = {
        secUid: secUid,
        count: 5,
        cursor : 0
    };

    if (!tiktokPostsIdsApiUrl) {
      return;
    }

    const tiktokResponse = await axios.get(tiktokPostsIdsApiUrl, {
      headers: tiktokHeaders,
      params: tiktokParams,
    });

    if (!tiktokResponse.data || !tiktokResponse.data.data || !Array.isArray(tiktokResponse.data.data.itemList)) {
      console.error('Unexpected API response format:', tiktokResponse.data);
      return [];
    }

    const postIds = tiktokResponse.data.data.itemList.map((posts: any) => posts.id);

    return postIds; 

  } catch (error) {
    console.error('Error fetching Posts by ID:', error);
    throw new Error('Failed to fetch Tiktok Posts by ID');
  }
};

export const fetchPostsReplies = async (postIds: string[]) => {
  try {
    let allReplies: string[] = [];

    for (let postId of postIds) {
        const tiktokParams = {
        videoId: postId,
        count: 50,
        cursor: 0
        };

        
        if (!tiktokPostRepliesApiUrl) {
            return;
        }
        const tiktokResponse = await axios.get(tiktokPostRepliesApiUrl, {
        headers: tiktokHeaders,
        params: tiktokParams,
        });

        const replies = tiktokResponse?.data?.comments || [];
        const replyTexts = replies.map((comment: any) => comment.text);

        allReplies = [...allReplies, ...replyTexts];
    }

    const combinedPostText = allReplies.join(' ');

    return combinedPostText;
  } catch (error) {
    console.error('Error fetching tiktok post replies:', error);
    throw new Error('Failed to fetch tiktok post replies');
  }
};

export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { secUid, query } = req.query;
  
      if (!secUid || !query) {
        res.status(400).json({ message: 'Missing required query parameter: secUid / query' });
        return;
      }
      const isPaidReport = req.headers['x-report-type'] === 'paid';
      const platform = req.headers['x-report-platform'] as string;


      const postIds = await fetchPostsById(secUid.toString());  
      const postReplies = await fetchPostsReplies(postIds);


      let Result = {}
      if (!isPaidReport){
        Result = await analyzeAndCombineData(postReplies, query.toString(), 'TikTok' );
      }
      else if (isPaidReport){
        Result = await analyzeAndCombinePaidData(postReplies, query.toString(), platform);
      }

      res.json(Result);  
    } catch (error) {
      console.error('Error fetching data from external APIs:', error);
      res.status(500).json({ message: 'Failed to fetch data from external APIs' });
    }
  };

  export const generateFreeReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const { secUid, query } = req.query;
  
      if (!secUid || !query) {
        res.status(400).json({ message: 'Missing required query parameter: secUid or query' });
        return;
      }

      const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }
  
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
  
      const FREE_REPORT_LIMIT = 2;
      const isSpecialUser = user.email === "repradarhelp@gmail.com" || user.email === "directoresarpk@gmail.com" || user.email === "davidwom369@gmail.com" || user.email === "thoffexpert@gmail.com" || user.email === "noor@gmail.com";
  
      if (!isSpecialUser && user.freeReports >= FREE_REPORT_LIMIT) {
        res.status(403).json({ message: 'You have reached the free report limit' });
        return 
      }
  
      const apiUrl = tiktokData;
      if (!apiUrl) {
        res.status(500).json({ message: 'API URL for Tiktok is not defined in .env' });
        return;
      }
      const response = await axios.get(`${apiUrl}?secUid=${secUid}&query=${query}`);
  
      const data = response.data;
  
      if (!data) {
        res.status(404).json({ message: 'No data found for the given query' });
        return;
      }
  
      const pdfBuffer = await generateFreePdfReport(data);

      const report = new Report({
        name: `${query} - ${new Date().toISOString()}`,
        pdf: pdfBuffer,
        user: userId,
        platform: 'TikTok',
        type: 'free',
      });
      await report.save();

      if (!isSpecialUser) {
        user.freeReports += 1;
        await user.save();
      }
  
      res.setHeader('Content-Disposition', 'attachment; filename="sentiment_report.pdf"');
      res.setHeader('Content-Type', 'application/pdf');
      res.end(pdfBuffer);
  
    } catch (error) {
      console.error('Error fetching data or generating PDF:', error);
      res.status(500).json({ message: 'Failed to fetch data or generate PDF' });
    }
  };

  export const generatePaidReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const { secUid, query } = req.query;

      if (!secUid || !query) {
        res.status(400).json({ message: 'Missing required query parameter: secUid or query' });
        return;
      }

      const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id ;
      if (!userId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
      }
  
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
  
      const requiredTokens = 5;
      const isSpecialUser = user.email === "repradarhelp@gmail.com" || user.email === "directoresarpk@gmail.com" || user.email === "davidwom369@gmail.com" || user.email === "thoffexpert@gmail.com" || user.email === "noor@gmail.com";

      if (!isSpecialUser && user.tokens < requiredTokens) {
        res.status(403).json({ message: 'Not enough tokens to generate paid report' });
        return;
      }
  
  
      const apiUrl = tiktokData;
      if (!apiUrl) {
        res.status(500).json({ message: 'API URL for Tiktok is not defined in .env' });
        return;
      }
      const headers = {
        ...tiktokHeaders,
        'x-report-type': 'paid',
        'x-report-platform': 'TikTok',
      };

      const response = await axios.get(`${apiUrl}?secUid=${secUid}&query=${query}`, { headers });
  
      const data = response.data;
  
      if (!data) {
        res.status(404).json({ message: 'No data found for the given query' });
        return;
      }
      const pdfBuffer = await generatePaidPdfReport(data);

      const report = new Report({
        name: `${query} - ${new Date().toISOString()}`,
        pdf: pdfBuffer,
        user: userId,
        platform: 'TikTok',
        type: 'paid',
      });
      await report.save();

      if (!isSpecialUser) {
        user.tokens -= requiredTokens;
        await user.save();
      }

      res.setHeader('Content-Disposition', 'attachment; filename="paid_sentiment_report.pdf"');
      res.setHeader('Content-Type', 'application/pdf');
      res.end(pdfBuffer);
  
    } catch (error) {
      console.error('Error fetching data or generating PDF:', error);
      res.status(500).json({ message: 'Failed to fetch data or generate PDF' });
    }
  };

  