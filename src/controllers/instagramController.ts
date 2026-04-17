import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { analyzeAndCombineData } from "../utils/getFreeReport"
import { generateFreePdfReport , generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import Report from '../models/Report';
import User from '../models/User';

dotenv.config();

const instagramHeaders = {
    'x-rapidapi-host': 'instagram-social-api.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const instagramSearchApiUrl = process.env.INSTAGRAM_SEARCH_API_URL;
const InstagramPostsIdsApiUrl = process.env.INSTAGRAM_POSTS_IDS_API_URL;
const instagramPostRepliesApiUrl = process.env.INSTAGRAM_POST_REPLIES_API_URL;
const instagramData = process.env.INSTAGRAM_DATA_API_URL;

export const searchProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { search_query } = req.query;

        if (!search_query) {
            res.status(400).json({ message: 'Missing required query parameter: search_query' });
            return;
        }

        if (!process.env.RAPID_API_KEY) {
            res.status(500).json({ message: 'Instagram API key is not defined in .env' });
            return;
        }

        const instagramParams = {
            search_query: search_query.toString(),
            url_embed_safe: 'true',
        };

        if (!instagramSearchApiUrl) {
            res.status(500).json({ message: 'Instagram search API URL is not defined in .env' });
            return;
        }

        const instagramResponse = await axios.get(instagramSearchApiUrl as string, {
            headers: instagramHeaders,
            params: instagramParams
        });

        const responseData = {
            instagramUsers: instagramResponse.data.data.items || [],
            count: instagramResponse.data.data.count || 0
        };

        res.json(responseData);
    } catch (error) {
        console.error('Error fetching data from Instagram API:', error);
        res.status(500).json({ message: 'Failed to fetch data from Instagram API' });
    }
};

export const fetchPostsById = async (query: string): Promise<{ postIds: string[], isPrivate: boolean }> => {
    try {
      const InstagramParams = {
        username_or_id_or_url: query,
      };
  
      if (!InstagramPostsIdsApiUrl) {
        return { postIds: [], isPrivate: false };
      }
  
      const instagramResponse = await axios.get(InstagramPostsIdsApiUrl, {
        headers: instagramHeaders,
        params: InstagramParams,
      });
  
      const postIds = instagramResponse.data.data.items.map((post: any) => post.code);
  
      // If no posts found, treat as not private (could be empty account)
      return { postIds, isPrivate: false };
  
    } catch (error: any) {
      // Check for 400 error with detail 'Not found'
      if (
        error.response &&
        error.response.status === 404 &&
        error.response.data &&
        error.response.data.detail === 'Not found'
      ) {
        return { postIds: [], isPrivate: true };
      }
      console.error('Error fetching posts by ID:', error);
      throw new Error('Failed to fetch posts by ID');
    }
  };

export const fetchPostsReplies = async (postIds: string[]) => {
    try {
        let allReplies: string[] = [];
    
        for (let postid of postIds) {
          const InstagramParams = {
            code_or_id_or_url: postid,
          };
    
          
        if (!instagramPostRepliesApiUrl) {
          return;
        }
          const instagramResponse = await axios.get(instagramPostRepliesApiUrl, {
            headers: instagramHeaders,
            params: InstagramParams,
          });
    
          const replies = instagramResponse.data.data.items;
          const replyTexts = replies.map((post: any) => post.text);
    
          allReplies = [...allReplies, ...replyTexts];
        }
    
        const combinedPostText = allReplies.join(' ');
    
        return combinedPostText;
      } catch (error) {
        console.error('Error fetching Posts replies:', error);
        throw new Error('Failed to fetch posts replies');
      }
    };

    export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
        try {
          const { query } = req.query;
      
          if (!query) {
            res.status(400).json({ message: 'Missing required query parameter: query' });
            return;
          }
          const isPaidReport = req.headers['x-report-type'] === 'paid';
          const platform = req.headers['x-report-platform'] as string;
    
    
          const formatedQuery = query.toString().replace(/^@/, '');
    
          const { postIds, isPrivate } = await fetchPostsById(formatedQuery);
          if (isPrivate) {
            res.status(404).json({ 
              message: 'The profile/page you are trying to fetch is set to private or has no accessible posts',
              error: 'PRIVATE_PROFILE'
            });
            return; 
          }
    
          const PostReplies = await fetchPostsReplies(postIds);
        
          let Result = {}
          if (!isPaidReport){
            Result = await analyzeAndCombineData(PostReplies, query.toString(), 'Instagram' );
          }
          else if (isPaidReport){
            Result = await analyzeAndCombinePaidData(PostReplies, query.toString(), platform);
          }
    
          res.json(Result);  
        } catch (error) {
          console.error('Error fetching data from external APIs:', error);
          res.status(500).json({ message: 'Failed to fetch data from external APIs' });
        }
      };
    

      export const generateFreeReport = async (req: Request, res: Response): Promise<void> => {
        try {
          const { query } = req.query;
      
          if (!query) {
            res.status(400).json({ message: 'Missing required query parameter: query' });
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
    
          const apiUrl = instagramData;
          if (!apiUrl) {
            res.status(500).json({ message: 'API URL for Instagram is not defined in .env' });
            return;
          }
          const response = await axios.get(`${apiUrl}?query=${query}`);
      
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
            platform: 'Instagram',
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
          const { query } = req.query;
      
          if (!query) {
            res.status(400).json({ message: 'Missing required query parameter: query' });
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
      
          const apiUrl = instagramData;
          if (!apiUrl) {
            res.status(500).json({ message: 'API URL for Instagram is not defined in .env' });
            return;
          }
          const headers = {
            ...instagramHeaders,
            'x-report-type': 'paid',
            'x-report-platform': 'Instagram',
          };
    
          const response = await axios.get(`${apiUrl}?query=${query}`, { headers });
      
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
            platform: 'Instagram',
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
      
        } catch (error: any) {
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
    
      