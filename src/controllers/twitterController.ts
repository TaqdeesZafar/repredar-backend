import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import { triggerGHLWorkflowSilent } from '../utils/emailUtils';
import { saveReportAndGetUrl } from '../utils/saveReport';

dotenv.config();

  const twitterHeaders = {
    'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
  };

  const twitterSearchApiUrl = process.env.TWITTER_SEARCH_API_URL;
  const twitterTweetIdsApiUrl = process.env.TWITTER_TWEET_IDS_API_URL;
  const twitterTweetRepliesApiUrl = process.env.TWITTER_TWEET_REPLIES_API_URL;

  
export const fetchUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { search_type, query } = req.query;

        if (!search_type || !query) {
            res.status(400).json({ message: 'Missing required query parameters: search_type or query' });
            return;
        }

        if (!twitterSearchApiUrl) {
            res.status(500).json({ message: 'API URLs for Twitter are not defined in .env' });
            return;
        }

        const twitterParams = {
            query: query.toString(),
            search_type: 'People',  
        };


        const [twitterResponse] = await Promise.all([
            axios.get(twitterSearchApiUrl, { headers: twitterHeaders, params: twitterParams }),
        ]);

        const combinedData = {
            twitterUsers: twitterResponse.data,
        };

        res.json(combinedData);

    } catch (error: any) {
        const errDetail = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown error';
      console.error('Error fetching data from external APIs:', errDetail);
      res.status(500).json({ message: 'Failed to fetch data from external APIs: ' + errDetail });
    }
};

export const fetchTweetsById = async (query: string): Promise<string[]> => {
  if (!twitterTweetIdsApiUrl) return [];
  try {
    const twitterResponse = await axios.get(twitterTweetIdsApiUrl, {
      headers: twitterHeaders,
      params: { screenname: query },
    });
    return (twitterResponse.data?.timeline || []).map((tweet: any) => tweet.tweet_id).filter(Boolean);
  } catch (error) {
    console.error('Error fetching tweets by ID:', error);
    return [];
  }
};

export const fetchTweetsReplies = async (tweetIds: string[]) => {
  if (!twitterTweetRepliesApiUrl || !tweetIds?.length) return '';
  let allReplies: string[] = [];

  for (const tweetId of tweetIds) {
    try {
      const twitterResponse = await axios.get(twitterTweetRepliesApiUrl, {
        headers: twitterHeaders,
        params: { id: tweetId },
      });
      const replies = twitterResponse.data?.timeline || [];
      const texts = replies.map((tweet: any) => tweet.text || '').filter(Boolean);
      allReplies = [...allReplies, ...texts];
    } catch {
      // skip tweets with no accessible replies
    }
  }

  return allReplies.join(' ');
};

export const fetchAndAnalyzeTweets = async (req: Request, res: Response): Promise<void> => {
    try {
      const { query } = req.query;
  
      if (!query) {
        res.status(400).json({ message: 'Missing required query parameter: query' });
        return;
      }
      const platform = req.headers['x-report-platform'] as string;


      const formatedQuery = query.toString().replace(/^@/, '');
      
      const twitterParams = {
        query: query.toString(),
        search_type: 'Latest',
      };

      if (!twitterSearchApiUrl) {
        res.status(500).json({ message: 'API URL for Twitter is not defined in .env' });
        return;
      }
  
      const twitterResponse = await axios.get(twitterSearchApiUrl, {
        headers: twitterHeaders,
        params: twitterParams,
      });
  
      const mentions = twitterResponse.data.timeline || [];
      const combinedMentions = mentions.map((mention: any) => mention.text || '').join(' ');

      const tweetIds = await fetchTweetsById(formatedQuery);
      const tweetReplies = await fetchTweetsReplies(tweetIds);



      const combinedText = combinedMentions + ' ' + tweetReplies;

      const Result = await analyzeAndCombinePaidData(combinedText, query.toString(), platform || 'X');

      res.json(Result);
    } catch (error: any) {
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
    const twitterParams = { query: query.toString(), search_type: 'Latest' };
    const twitterResponse = await axios.get(twitterSearchApiUrl!, { headers: twitterHeaders, params: twitterParams });
    const mentions = twitterResponse.data.timeline || [];
    const combinedMentions = mentions.map((m: any) => m.text).join(' ');
    const tweetIds = await fetchTweetsById(formattedQuery);
    const tweetReplies = await fetchTweetsReplies(tweetIds);
    const combinedText = combinedMentions + ' ' + tweetReplies;
    const data = await analyzeAndCombinePaidData(combinedText, query.toString(), 'X');

    if (!data) {
      res.status(404).json({ message: 'No data found for the given query' });
      return;
    }

    const pdfBuffer = await generatePaidPdfReport(data);
    const reportUrl = await saveReportAndGetUrl(pdfBuffer, `${query} - ${new Date().toISOString()}`, 'X');

    const userEmail = (req.query.email as string) || "";
    triggerGHLWorkflowSilent(userEmail, query.toString(), 'X', reportUrl || undefined);

    res.setHeader('Content-Disposition', 'attachment; filename="reputation_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);

  } catch (error: any) {
    const detail = error?.response?.data?.message || error?.message || 'Unknown';
    console.error('Error in Twitter generateReport:', error);
    res.status(500).json({ message: `Failed to generate PDF: ${detail}` });
  }
};

  