import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import { triggerGHLWorkflowSilent } from '../utils/emailUtils';
import { saveReportAndGetUrl } from '../utils/saveReport';

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

        const combinedData = {
            facebookUsers: facebookResponseCursor0.data.results || [],
        };

        res.json(combinedData);
    } catch (error) {
        const errDetail = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown error';
      console.error('Error fetching data from external APIs:', errDetail);
      res.status(500).json({ message: 'Failed to fetch data from external APIs: ' + errDetail });
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

      const facebookResponseCursor0 = await axios.get(facebookSearchProfileApiUrl, {
          headers: facebookProfileHeaders,
          params: { query: query.toString() },
      });

      const combinedData = {
          facebookUsers: facebookResponseCursor0.data?.data?.items || [],
      };

      res.json(combinedData);
  } catch (error) {
      const errDetail = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown error';
      console.error('Error fetching data from external APIs:', errDetail);
      res.status(500).json({ message: 'Failed to fetch data from external APIs: ' + errDetail });
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
  if (!postIds || postIds.length === 0 || !facebookPostRepliesApiUrl) return "";

  let allReplies: string[] = [];

  for (let i = 0; i < postIds.length; i++) {
    try {
      const facebookResponse = await axios.get(facebookPostRepliesApiUrl, {
        headers: facebookHeaders,
        params: { post_id: postIds[i] },
      });
      const replies = facebookResponse?.data?.results || [];
      const replyTexts = replies.map((comment: any) => comment.message).filter(Boolean);
      allReplies = [...allReplies, ...replyTexts];
      if (reactions[i]) allReplies.push(reactions[i]);
    } catch {
      // rate-limited or post unavailable — skip and continue
    }
  }

  return allReplies.join(' ');
};

export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page_id, profile_id, query } = req.query;
      if ((!page_id && !profile_id) || !query) {
        res.status(400).json({ message: 'Missing required query parameter: page_id or profile_id / query' });
        return;
      }
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

      if (isPrivate) {
        res.status(404).json({
          message: 'The profile/page you are trying to fetch is set to private or has no accessible posts',
          error: 'PRIVATE_PROFILE'
        });
        return;
      }

      const postReplies = await fetchPostsReplies(postIds, reactions);

      const Result = await analyzeAndCombinePaidData(postReplies, query.toString(), platform || 'Facebook');

      res.json(Result);  
    } catch (error) {
      const errDetail = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown error';
      console.error('Error fetching data from external APIs:', errDetail);
      res.status(500).json({ message: 'Failed to fetch data from external APIs: ' + errDetail });
    }
  };

export const generateReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page_id, profile_id, query } = req.query;

    if ((!page_id && !profile_id) || !query) {
      res.status(400).json({ message: 'Missing required query parameter: page_id or profile_id or query' });
      return;
    }

    let postIds: string[] = [], reactions: string[] = [], isPrivate = false;
    if (page_id) {
      const result = await fetchPostsById(page_id.toString());
      postIds = result.postIds; reactions = result.reactions; isPrivate = result.isPrivate;
    } else if (profile_id) {
      const result = await fetchPostsById(undefined, profile_id.toString());
      postIds = result.postIds; reactions = result.reactions; isPrivate = result.isPrivate;
    }

    if (isPrivate) {
      res.status(404).json({ message: 'The profile/page is set to private or has no accessible posts', error: 'PRIVATE_PROFILE' });
      return;
    }

    const postReplies = (await fetchPostsReplies(postIds, reactions) as string) || '';
    const data = await analyzeAndCombinePaidData(postReplies, query.toString(), 'Facebook');

    if (!data) {
      res.status(404).json({ message: 'No data found for the given query' });
      return;
    }

    const pdfBuffer = await generatePaidPdfReport(data);
    const reportUrl = await saveReportAndGetUrl(pdfBuffer, `${query} - ${new Date().toISOString()}`, 'Facebook');

    const userEmail = (req.query.email as string) || "";
    triggerGHLWorkflowSilent(userEmail, query.toString(), 'Facebook', reportUrl || undefined);

    res.setHeader('Content-Disposition', 'attachment; filename="reputation_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);

  } catch (error: any) {
    console.error('Error fetching data or generating PDF:', error);
    res.status(500).json({ message: error?.message || 'Failed to generate PDF' });
  }
};

  