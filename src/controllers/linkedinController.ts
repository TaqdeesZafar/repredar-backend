import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import Report from '../models/Report';


dotenv.config();

  const linkedinHeaders = {
    'x-rapidapi-host': 'best-linkedin-scraper-api3.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
  };

  const linkedinSearchApiUrl = process.env.LINKEDIN_SEARCH_API_URL;
  const linkedinCompanyPostsApiUrl = process.env.LINKEDIN_COMPANY_POSTS_API_URL;
  const linkedinPostRepliesApiUrl = process.env.LINKEDIN_POST_REPLIES_API_URL;
  const linkedinData = process.env.LINKEDIN_DATA_API_URL;


export const fetchUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { query } = req.query;

        if (!query) {
            res.status(400).json({ message: 'Missing required query parameters: query' });
            return;
        }

        if (!linkedinSearchApiUrl) {
            res.status(500).json({ message: 'API URLs for Linkedin are not defined in .env' });
            return;
        }

        const linkedinParams = {
            keywords: query.toString(),
          };
      

          const [linkedinResponse ] = await Promise.all([
            axios.get(linkedinSearchApiUrl, { headers: linkedinHeaders, params: linkedinParams }),
          ]);

          const combinedData = {
            linkedinUsers: [
              ...linkedinResponse.data.data,
            ],
          };

        res.json(combinedData);

    } catch (error) {
        console.error('Error fetching data from external APIs:', error);
        res.status(500).json({ message: 'Failed to fetch data from external APIs' });
    }
};

export const fetchPostsById = async (url: string) => {
  try {
    const linkedinParams = {
        url: url,
    };

    if (!linkedinCompanyPostsApiUrl) {
        return { postIds: [], reactions: [] };
    }

    const linkedinResponse = await axios.get(linkedinCompanyPostsApiUrl, {
      headers: linkedinHeaders,
      params: linkedinParams,
    });
    const postIds = linkedinResponse.data.data.map((posts: any) => posts.url);
    const reactions = linkedinResponse.data.data.map((posts: any) => posts.reaction_types);

    return { postIds, reactions }; 

  } catch (error) {
    console.error('Error fetching Posts by ID:', error);
    throw new Error('Failed to fetch Linkedin Posts by ID');
  }
};

export const fetchPostsReplies = async (postIds: string[], reactions: string[][]) => {
    try {
      let allReplies: string[] = [];
      let allReactions: string[] = [];
  
      for (let i = 0; i < postIds.length; i++) {
        const postId = postIds[i];
        const linkedinParams = {
          url: postId,
          page: 1,
          sort_order: "REVERSE_CHRONOLOGICAL",
        };
  
        if (!linkedinPostRepliesApiUrl) {
          return;
        }
  
        const linkedinResponse = await axios.get(linkedinPostRepliesApiUrl, {
          headers: linkedinHeaders,
          params: linkedinParams,
        });
  
        const replies = linkedinResponse?.data?.data || [];
        const replyTexts = replies.map((comment: any) => comment.text.content);
  
        allReplies = [...allReplies, ...replyTexts];
  
        if (reactions[i]) {
          allReactions = [...allReactions, ...reactions[i]];
        }
      }
  
      const combinedText = [...allReplies, ...allReactions].join(' ');
  
      return combinedText;
    } catch (error) {
      console.error('Error fetching Linkedin post replies:', error);
      throw new Error('Failed to fetch Linkedin post replies');
    }
  };

export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { url , query } = req.query;
  
      if (!url || !query ) {
        res.status(400).json({ message: 'Missing required query parameter: url / query' });
        return;
      }
      const platform = req.headers['x-report-platform'] as string;

      const { postIds, reactions } = await fetchPostsById(url.toString());
      const postReplies = await fetchPostsReplies(postIds, reactions);

      const Result = await analyzeAndCombinePaidData(postReplies, query.toString(), platform || 'LinkedIn');

      res.json(Result);  
    } catch (error) {
      console.error('Error fetching data from external APIs:', error);
      res.status(500).json({ message: 'Failed to fetch data from external APIs' });
    }
  };

export const generateReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, query } = req.query;

    if (!url || !query) {
      res.status(400).json({ message: 'Missing required query parameter: url or query' });
      return;
    }

    const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    const apiUrl = linkedinData;
    if (!apiUrl) {
      res.status(500).json({ message: 'API URL for Linkedin is not defined in .env' });
      return;
    }

    const headers = {
      ...linkedinHeaders,
      'x-report-type': 'paid',
      'x-report-platform': 'Linkedin',
    };

    const response = await axios.get(`${apiUrl}?url=${url}&query=${query}`, { headers });
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
      platform: 'Linkedin',
      type: 'report',
    });
    await report.save();

    res.setHeader('Content-Disposition', 'attachment; filename="reputation_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);

  } catch (error) {
    console.error('Error fetching data or generating PDF:', error);
    res.status(500).json({ message: 'Failed to fetch data or generate PDF' });
  }
};

  