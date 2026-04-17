import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { analyzeAndCombineData } from "../utils/getFreeReport"
import { generateFreePdfReport , generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import Report from '../models/Report';
import User from '../models/User';

dotenv.config();

  const twitterHeaders = {
    'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
  };

  const twitterSearchApiUrl = process.env.TWITTER_SEARCH_API_URL;
  const twitterTweetIdsApiUrl = process.env.TWITTER_TWEET_IDS_API_URL;
  const twitterTweetRepliesApiUrl = process.env.TWITTER_TWEET_REPLIES_API_URL;
  const twitterData = process.env.TWITTER_DATA_API_URL;

  
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

    } catch (error) {
        console.error('Error fetching data from external APIs:', error);
        res.status(500).json({ message: 'Failed to fetch data from external APIs' });
    }
};

export const fetchTweetsById = async (query: string) => {
  try {
    const twitterParams = {
      screenname: query,
    };

    if (!twitterTweetIdsApiUrl) {
      return;
    }

    const twitterResponse = await axios.get(twitterTweetIdsApiUrl, {
      headers: twitterHeaders,
      params: twitterParams,
    });

    const tweetIds = twitterResponse.data.timeline.map((tweet: any) => tweet.tweet_id);

    return tweetIds; 

  } catch (error) {
    console.error('Error fetching tweets by ID:', error);
    throw new Error('Failed to fetch tweets by ID');
  }
};

export const fetchTweetsReplies = async (tweetIds: string[]) => {
  try {
    let allReplies: string[] = [];

    for (let tweetId of tweetIds) {
      const twitterParams = {
        id: tweetId,
      };

      
    if (!twitterTweetRepliesApiUrl) {
      return;
    }
      const twitterResponse = await axios.get(twitterTweetRepliesApiUrl, {
        headers: twitterHeaders,
        params: twitterParams,
      });

      const replies = twitterResponse.data.timeline;
      const replyTexts = replies.map((tweet: any) => tweet.text);

      allReplies = [...allReplies, ...replyTexts];
    }

    const combinedTweetText = allReplies.join(' ');

    return combinedTweetText;
  } catch (error) {
    console.error('Error fetching tweet replies:', error);
    throw new Error('Failed to fetch tweet replies');
  }
};

export const fetchAndAnalyzeTweets = async (req: Request, res: Response): Promise<void> => {
    try {
      const { query } = req.query;
  
      if (!query) {
        res.status(400).json({ message: 'Missing required query parameter: query' });
        return;
      }
      const isPaidReport = req.headers['x-report-type'] === 'paid';
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
  
      const mentions = twitterResponse.data.timeline;
      const combinedMentions = mentions
      .map((mention: any) => mention.text)
      .join(' ');

      const tweetIds = await fetchTweetsById(formatedQuery);


      // if (!tweetIds || tweetIds.length === 0) {
      //   const result = await analyzeAndCombineData(combinedMentions, query.toString());
      //   res.json(result);
      //   return;
      // }
  
      const tweetReplies = await fetchTweetsReplies(tweetIds);



      const combinedText = combinedMentions + ' ' + tweetReplies;

      let Result = {}
      if (!isPaidReport){
        Result = await analyzeAndCombineData(combinedText, query.toString(), 'X' );
      }
      else if (isPaidReport){
        Result = await analyzeAndCombinePaidData(combinedText, query.toString(), platform);
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

      const apiUrl = twitterData;
      if (!apiUrl) {
        res.status(500).json({ message: 'API URL for Twitter is not defined in .env' });
        return;
      }
      const response = await axios.get(`${apiUrl}?query=${query}&search_type=Latest`);
  
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
        platform: 'X',
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
  
      const apiUrl = twitterData;
      if (!apiUrl) {
        res.status(500).json({ message: 'API URL for Twitter is not defined in .env' });
        return;
      }
      const headers = {
        ...twitterHeaders,
        'x-report-type': 'paid',
        'x-report-platform': 'X',
      };

      const response = await axios.get(`${apiUrl}?query=${query}&search_type=Latest`, { headers });
  
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
        platform: 'X',
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

  