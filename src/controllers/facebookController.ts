import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { analyzeAndCombineData } from "../utils/getFreeReport"
import { generateFreePdfReport , generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import Report from '../models/Report';
import User from '../models/User';

dotenv.config();

  const facebookHeaders = {
    'x-rapidapi-host': 'facebook-scraper3.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
  };

  const facebookProfileHeaders = {
    'x-rapidapi-host': 'facebook-scraper-api4.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
  };

  const facebookSearchApiUrl = process.env.FACEBOOK_SEARCH_API_URL;
  const facebookSearchProfileApiUrl = process.env.FACEBOOK_SEARCH_PROFILE_URL;
  const facebookPostsIdsApiUrl = process.env.FACEBOOK_POSTS_IDS_API_URL;
  const facebookProfilePostsIdsApiUrl = process.env.FACEBOOK_PROFILE_POSTS_IDS_API_URL;
  const facebookPostRepliesApiUrl = process.env.FACEBOOK_POST_REPLIES_API_URL;
  const facebookData = process.env.FACEBOOK_DATA_API_URL;


  export const fetchUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { query } = req.query;

        if (!query) {
            res.status(400).json({ message: 'Missing required query parameters: keyword or cursor' });
            return;
        }

        if (!facebookSearchApiUrl) {
            res.status(500).json({ message: 'API URLs for Facebook are not defined in .env' });
            return;
        }

        const facebookParamsCursor0 = {
            query: query.toString(),
        };

        const facebookResponseCursor0 = await axios.get(facebookSearchApiUrl, {
            headers: facebookHeaders,
            params: facebookParamsCursor0
        });

        const nextCursor = facebookResponseCursor0.data.cursor;
        
        const facebookParamsCursorNext = {
            query: query.toString(),
            cursor: nextCursor,
            };

        const facebookResponseCursor1 = await axios.get(facebookSearchApiUrl, {
            headers: facebookHeaders,
            params: facebookParamsCursorNext
        });
        
        const nextCursor2 = facebookResponseCursor1.data.cursor;

        const facebookParamsCursor2 = {
            query: query.toString(),
            cursor: nextCursor2,
            };

        const facebookResponseCursor2 = await axios.get(facebookSearchApiUrl, {
            headers: facebookHeaders,
            params: facebookParamsCursor2
        });

        const combinedData = {
            facebookUsers: [
                ...facebookResponseCursor0.data.results,
                ...facebookResponseCursor1.data.results,
                ...facebookResponseCursor2.data.results,
            ],
        };

        res.json(combinedData);
    } catch (error) {
        console.error('Error fetching data from external APIs:', error);
        res.status(500).json({ message: 'Failed to fetch data from external APIs' });
    }
};

export const fetchProfileUsers = async (req: Request, res: Response): Promise<void> => {
  try {
      const { query } = req.query;

      if (!query) {
          res.status(400).json({ message: 'Missing required query parameters: keyword or cursor' });
          return;
      }

      if (!facebookSearchProfileApiUrl) {
          res.status(500).json({ message: 'API URLs for Facebook are not defined in .env' });
          return;
      }

      const facebookParamsCursor0 = {
          query: query.toString(),
      };

      const facebookResponseCursor0 = await axios.get(facebookSearchProfileApiUrl, {
          headers: facebookProfileHeaders,
          params: facebookParamsCursor0
      });
      const nextCursor = facebookResponseCursor0.data.data.page_info.cursor;
      
      const facebookParamsCursorNext = {
          query: query.toString(),
          cursor: nextCursor,
          };

      const facebookResponseCursor1 = await axios.get(facebookSearchProfileApiUrl, {
          headers: facebookProfileHeaders,
          params: facebookParamsCursorNext
      });
      
      const nextCursor2 = facebookResponseCursor1.data.data.page_info.cursor;

      const facebookParamsCursor2 = {
          query: query.toString(),
          cursor: nextCursor2,
          };

      const facebookResponseCursor2 = await axios.get(facebookSearchProfileApiUrl, {
          headers: facebookProfileHeaders,
          params: facebookParamsCursor2
      });

      const combinedData = {
          facebookUsers: [
              ...facebookResponseCursor0.data.data.items,
              ...facebookResponseCursor1.data.data.items,
              ...facebookResponseCursor2.data.data.items,
          ],
      };

      res.json(combinedData);
  } catch (error) {
      console.error('Error fetching data from external APIs:', error);
      res.status(500).json({ message: 'Failed to fetch data from external APIs' });
  }
};

export const fetchPostsById = async (page_id?: string, profile_id?: string) => {
  try {    // If profile_id is provided, use facebookProfilePostsIdsApiUrl
    if (profile_id) {
      if (!facebookProfilePostsIdsApiUrl) {
        console.error("facebookProfilePostsIdsApiUrl is not defined");
        return { postIds: [], reactions: [], isPrivate: false };
      }
      const facebookParams = { profile_id };
      const facebookResponse = await axios.get(facebookProfilePostsIdsApiUrl, {
        headers: facebookHeaders,
        params: facebookParams,
      });
      const results = facebookResponse.data.results || [];
      
      // Check if results are empty and log appropriate error
      if (results.length === 0) {
        console.error(`The profile with ID ${profile_id} is set to private or has no accessible posts`);
        return { postIds: [], reactions: [], isPrivate: true };
      }
      
      const postIds = results.map((post: any) => post.post_id);
      const reactions = results.map((post: any) => {
        if (post.reactions) {
          return Object.entries(post.reactions)
            .map(([reaction, count]) => `${reaction} (${count})`)
            .join(', ');
        }
        return "";
      });
      return { postIds, reactions, isPrivate: false };
    }
    // If page_id is provided, use the original logic
    if (page_id) {
      if (!facebookPostsIdsApiUrl) {
        console.error("facebookPostsIdsApiUrl is not defined");
        return { postIds: [], reactions: [], isPrivate: false };
      }
      const facebookParams = { page_id };
      const facebookResponse = await axios.get(facebookPostsIdsApiUrl, {
        headers: facebookHeaders,
        params: facebookParams,
      });
      const results = facebookResponse.data.results || [];
      
      // Check if results are empty and log appropriate error
      if (results.length === 0) {
        console.error(`The page with ID ${page_id} is set to private or has no accessible posts`);
        return { postIds: [], reactions: [], isPrivate: true };
      }
      
      const postIds = results.map((post: any) => post.post_id);
      const reactions = results.map((post: any) => {
        if (post.reactions) {
          return Object.entries(post.reactions)
            .map(([reaction, count]) => `${reaction} (${count})`)
            .join(', ');
        }
        return "";
      });
      return { postIds, reactions, isPrivate: false };
    }
    // If neither is provided
    return { postIds: [], reactions: [], isPrivate: false };
  } catch (error) {
    console.error("Error fetching Posts by ID:", error);
    return { postIds: [], reactions: [], isPrivate: false };
  }
};

export const fetchPostsReplies = async (postIds: string[], reactions: string[]) => {
    try {
      // Check if there are any post IDs to process
      if (!postIds || postIds.length === 0) {
        console.log("No posts found to fetch replies for");
        return "";
      }
      
      let allReplies: string[] = [];
      let allReactions: string[] = [];

      for (let i = 0; i < postIds.length; i++) {
        const postId = postIds[i];
        const facebookParams = { post_id: postId };

        if (!facebookPostRepliesApiUrl) {
          return;
        }

        const facebookResponse = await axios.get(facebookPostRepliesApiUrl, {
          headers: facebookHeaders,
          params: facebookParams,
        });

        const replies = facebookResponse?.data?.results || [];
        const replyTexts = replies.map((comment: any) => comment.message);

        allReplies = [...allReplies, ...replyTexts];

        if (reactions[i]) {
          allReactions.push(reactions[i]);
        }
      }

      const combinedText = [...allReplies, ...allReactions].join(' ');

      return combinedText;
    } catch (error) {
      console.error("Error fetching facebook post replies:", error);
      throw new Error("Failed to fetch facebook post replies");
    }
};

export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page_id, profile_id, query } = req.query;
      if ((!page_id && !profile_id) || !query) {
        res.status(400).json({ message: 'Missing required query parameter: page_id or profile_id / query' });
        return;
      }
      const isPaidReport = req.headers['x-report-type'] === 'paid';
      const platform = req.headers['x-report-platform'] as string;

      let postIds: string[] = [];
      let reactions: string[] = [];
      let isPrivate = false;
      
      if (page_id) {
        const result = await fetchPostsById(page_id.toString());
        postIds = result.postIds;
        reactions = result.reactions;
        isPrivate = result.isPrivate;
      } else if (profile_id) {
        const result = await fetchPostsById(undefined, profile_id.toString());
        postIds = result.postIds;
        reactions = result.reactions;
        isPrivate = result.isPrivate;
      }
      
      // Check if profile/page is private
      if (isPrivate) {
          res.status(404).json({ 
            message: 'The profile/page you are trying to fetch is set to private or has no accessible posts',
            error: 'PRIVATE_PROFILE'
          });
        return;
      }
      
      console.log("postids",postIds)
      console.log("reactions",reactions)
      const postReplies = await fetchPostsReplies(postIds, reactions);

      let Result = {}
      if (!isPaidReport){
        Result = await analyzeAndCombineData(postReplies, query.toString(), 'Facebook' );
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
      const { page_id, profile_id, query } = req.query;
  
      if ((!page_id && !profile_id) || !query) {
        res.status(400).json({ message: 'Missing required query parameter: page_id or profile_id or query' });
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
      const isSpecialUser = user.email === "repradarhelp@gmail.com" || user.email === "directoresarpk@gmail.com" || user.email === "davidwom369@gmail.com" || user.email === "thoffexpert@gmail.com";

      if (!isSpecialUser && user.freeReports >= FREE_REPORT_LIMIT) {
        res.status(403).json({ message: 'You have reached the free report limit' });
        return 
      }
      const apiUrl = facebookData;
      if (!apiUrl) {
        res.status(500).json({ message: 'API URL for facebook is not defined in .env' });
        return;
      }
      let response;
      if (page_id) {
        response = await axios.get(`${apiUrl}?page_id=${page_id}&query=${query}`);
      } else if (profile_id) {
        response = await axios.get(`${apiUrl}?profile_id=${profile_id}&query=${query}`);
      }
      const data = response?.data;

      if (!data) {
        res.status(404).json({ message: 'No data found for the given query' });
        return;
      }
  
      const pdfBuffer = await generateFreePdfReport(data);

      const report = new Report({
        name: `${query} - ${new Date().toISOString()}`,
        pdf: pdfBuffer,
        user: userId,
        platform: 'Facebook',
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
  
    } catch (error: any) {
      // Forward PRIVATE_PROFILE error from internal API to frontend
      if (error.response && error.response.status === 404 && error.response.data?.error === 'PRIVATE_PROFILE') {
        res.status(404).json({
          message: error.response.data.message,
          error: error.response.data.error
        });
        return;
      }
      console.error('Error fetching data or generating PDF:', error);
      res.status(500).json({ message: 'Failed to fetch data or generate PDF' });
    }
  };

  export const generatePaidReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page_id, profile_id, query } = req.query;
      if ((!page_id && !profile_id) || !query) {
        res.status(400).json({ message: 'Missing required query parameter: page_id or profile_id or query' });
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
      const isSpecialUser = user.email === "repradarhelp@gmail.com" || user.email === "directoresarpk@gmail.com" || user.email === "davidwom369@gmail.com" || user.email === "thoffexpert@gmail.com";

      if (!isSpecialUser && user.tokens < requiredTokens) {
        res.status(403).json({ message: 'Not enough tokens to generate paid report' });
        return;
      }

      const apiUrl = facebookData;
      if (!apiUrl) {
        res.status(500).json({ message: 'API URL for facebook is not defined in .env' });
        return;
      }
      const headers = {
        ...facebookHeaders,
        'x-report-type': 'paid',
        'x-report-platform': 'Facebook',
      };

      let response;
      if (page_id) {
        response = await axios.get(`${apiUrl}?page_id=${page_id}&query=${query}`, { headers });
      } else if (profile_id) {
        response = await axios.get(`${apiUrl}?profile_id=${profile_id}&query=${query}`, { headers });
      }
      const data = response?.data;

      if (!data) {
        res.status(404).json({ message: 'No data found for the given query' });
        return;
      }
      const pdfBuffer = await generatePaidPdfReport(data);

      const report = new Report({
        name: `${query} - ${new Date().toISOString()}`,
        pdf: pdfBuffer,
        user: userId,
        platform: 'Facebook',
        type: 'paid'
      });
      await report.save();

      if (!isSpecialUser) {
        user.tokens -= requiredTokens;
        await user.save();
      }

      res.setHeader('Content-Disposition', 'attachment; filename="paid_sentiment_report.pdf"');
      res.setHeader('Content-Type', 'application/pdf');
      res.end(pdfBuffer);
    } catch (error: any) {
      // Forward PRIVATE_PROFILE error from internal API to frontend
      if (error.response && error.response.status === 404 && error.response.data?.error === 'PRIVATE_PROFILE') {
        res.status(404).json({
          message: error.response.data.message,
          error: error.response.data.error
        });
        return;
      }
      console.error('Error fetching data or generating PDF:', error);
      res.status(500).json({ message: 'Failed to fetch data or generate PDF' });
    }
  };

  