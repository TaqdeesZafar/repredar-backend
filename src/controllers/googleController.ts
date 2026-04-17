import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { analyzeAndCombineData } from "../utils/getFreeReport"
import { generateFreePdfReport , generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import Report from '../models/Report';
import User from '../models/User';

dotenv.config();

  const googleHeaders = {
    'x-rapidapi-host': 'local-business-data.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
  };

  const googleSearchApiUrl = process.env.GOOGLE_SEARCH_API_URL;
  const googleReviewsApiUrl = process.env.GOOGLE_REVIEWS_API_URL;
  const googleData = process.env.GOOGLE_DATA_API_URL;

  
export const fetchBusinesses = async (req: Request, res: Response): Promise<void> => {
    try {
        const { query } = req.query;

        if (!query) {
            res.status(400).json({ message: 'Missing required query parameters: query' });
            return;
        }

        if (!googleSearchApiUrl) {
            res.status(500).json({ message: 'API URLs for Google are not defined in .env' });
            return;
        }

        const googleParams = {
            query: query.toString(),
        };


        const [googleResponse] = await Promise.all([
            axios.get(googleSearchApiUrl, { headers: googleHeaders, params: googleParams }),
        ]);

        const combinedData = {
            googleUsers: googleResponse.data,
        };

        res.json(combinedData);

    } catch (error) {
        console.error('Error fetching data from external APIs:', error);
        res.status(500).json({ message: 'Failed to fetch data from external APIs' });
    }
};

export const fetchBusinessReviews = async (business_id: string): Promise<{ review_texts: string[]; ratings: number[] }> => {
  try {
    if (!googleReviewsApiUrl) {
      throw new Error('API URL for Google Reviews is not defined in .env');
    }

    const params = {
      business_id: business_id,
      sort_by: 'newest',
      fields: 'review_text,rating',
    };

    const response = await axios.get(googleReviewsApiUrl, {
      headers: googleHeaders,
      params,
    });

    const reviews = response.data?.data?.reviews || [];
    const review_texts: string[] = [];
    const ratings: number[] = [];

    for (const review of reviews) {
      // Only push if review_text is not null/undefined
      if (typeof review.review_text === 'string') {
        review_texts.push(review.review_text);
      }
      // Only push if rating is a number
      if (typeof review.rating === 'number') {
        ratings.push(review.rating);
      }
    }

    return { review_texts, ratings };
  } catch (error) {
    console.error('Error fetching business reviews:', error);
    throw new Error('Failed to fetch business reviews');
  }
};

export const fetchAndAnalyzeBusinesses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { business_id, query } = req.query;

    if (!business_id || !query) {
      res.status(400).json({ message: 'Missing required query parameter: business_id' });
      return;
    }

    const isPaidReport = req.headers['x-report-type'] === 'paid';
    const platform = req.headers['x-report-platform'] as string;

    // Fetch reviews and ratings for the business
    const { review_texts, ratings } = await fetchBusinessReviews(business_id.toString());

    // Combine all review texts into a single string for analysis
    const combinedReviews = review_texts.join(' ');

    let Result = {};
    if (!isPaidReport) {
      Result = await analyzeAndCombineData(combinedReviews, query.toString(), 'Google');
    } else {
      Result = await analyzeAndCombinePaidData(combinedReviews, query.toString(), platform);
    }

    res.json(Result);
  } catch (error) {
    console.error('Error fetching or analyzing business reviews:', error);
    res.status(500).json({ message: 'Failed to fetch or analyze business reviews' });
  }
};

  export const generateFreeReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const { query, business_id } = req.query;
  
      if (!query || !business_id) {
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

      const apiUrl = googleData;
      if (!apiUrl) {
        res.status(500).json({ message: 'API URL for Google is not defined in .env' });
        return;
      }
      const response = await axios.get(`${apiUrl}?query=${query}&business_id=${business_id}`);
  
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
        platform: 'Google Business',
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
      const { query, business_id } = req.query;
  
      if (!query || !business_id) {
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
  
      const apiUrl = googleData;
      if (!apiUrl) {
        res.status(500).json({ message: 'API URL for Twitter is not defined in .env' });
        return;
      }
      const headers = {
        ...googleHeaders,
        'x-report-type': 'paid',
        'x-report-platform': 'Google Business',
      };

      const response = await axios.get(`${apiUrl}?query=${query}&business_id=${business_id}`, { headers });
  
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
        platform: 'Google Business',
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

  