import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import { triggerGHLWorkflowSilent } from '../utils/emailUtils';
import { saveReportAndGetUrl } from '../utils/saveReport';

dotenv.config();

const instagramHeaders = {
    'x-rapidapi-host': 'instagram-social-api.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const instagramSearchApiUrl = process.env.INSTAGRAM_SEARCH_API_URL;
const InstagramPostsIdsApiUrl = process.env.INSTAGRAM_POSTS_IDS_API_URL;
const instagramPostRepliesApiUrl = process.env.INSTAGRAM_POST_REPLIES_API_URL;

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
    if (!instagramPostRepliesApiUrl) return '';
    let allReplies: string[] = [];

    for (const postid of postIds) {
      try {
        const instagramResponse = await axios.get(instagramPostRepliesApiUrl, {
          headers: instagramHeaders,
          params: { code_or_id_or_url: postid },
        });
        const replies = instagramResponse.data?.data?.items || [];
        allReplies = [...allReplies, ...replies.map((p: any) => p.text).filter(Boolean)];
      } catch {
        // post may have no comments — skip and continue
      }
    }

    return allReplies.join(' ');
  };

    export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
        try {
          const { query } = req.query;
      
          if (!query) {
            res.status(400).json({ message: 'Missing required query parameter: query' });
            return;
          }
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

          const Result = await analyzeAndCombinePaidData(PostReplies, query.toString(), platform || 'Instagram');

          res.json(Result);  
        } catch (error) {
          const errDetail = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown error';
      console.error('Error fetching data from external APIs:', errDetail);
      res.status(500).json({ message: 'Failed to fetch data from external APIs: ' + errDetail });
        }
      };
    

export const generateReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.query;

    if (!query) {
      res.status(400).json({ message: 'Missing required query parameter: query' });
      return;
    }

    const formattedQuery = query.toString().replace(/^@/, '');
    const { postIds, isPrivate } = await fetchPostsById(formattedQuery);
    if (isPrivate) {
      res.status(404).json({ message: 'The profile is set to private or has no accessible posts', error: 'PRIVATE_PROFILE' });
      return;
    }
    const postReplies = (await fetchPostsReplies(postIds)) || '';
    const data = await analyzeAndCombinePaidData(postReplies, query.toString(), 'Instagram');

    if (!data) {
      res.status(404).json({ message: 'No data found for the given query' });
      return;
    }

    const pdfBuffer = await generatePaidPdfReport(data);
    const reportUrl = await saveReportAndGetUrl(pdfBuffer, `${query} - ${new Date().toISOString()}`, 'Instagram');

    const userEmail = (req.query.email as string) || "";
    triggerGHLWorkflowSilent(userEmail, query.toString(), 'Instagram', reportUrl || undefined);

    res.setHeader('Content-Disposition', 'attachment; filename="reputation_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);

  } catch (error: any) {
    const msg = error?.message || 'Unknown error';
    console.error('Instagram generateReport error:', msg);
    res.status(500).json({ message: msg });
  }
};
    
      