import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import { triggerGHLWorkflowSilent } from '../utils/emailUtils';
import { saveReportAndGetUrl } from '../utils/saveReport';

dotenv.config();

  const googleHeaders = {
    'x-rapidapi-host': 'local-business-data.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
  };

  const googleSearchApiUrl = process.env.GOOGLE_SEARCH_API_URL;
  const googleReviewsApiUrl = process.env.GOOGLE_REVIEWS_API_URL;

  
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

    } catch (error: any) {
        const errDetail = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown error';
      console.error('Error fetching data from external APIs:', errDetail);
      res.status(500).json({ message: 'Failed to fetch data from external APIs: ' + errDetail });
    }
};

export const fetchBusinessReviews = async (business_id: string): Promise<{ review_texts: string[]; ratings: number[] }> => {
  try {
    if (!googleReviewsApiUrl) {
      throw new Error('API URL for Google Reviews is not defined in .env');
    }

    const params = {
      business_id: business_id,
      limit: 20,
      sort_by: 'most_relevant',
      language: 'en',
      region: 'us',
    };

    const response = await axios.get(googleReviewsApiUrl, {
      headers: googleHeaders,
      params,
    });

    const rawData = response.data?.data;
    const reviews = Array.isArray(rawData) ? rawData : (rawData?.reviews || rawData?.items || []);
    const review_texts: string[] = [];
    const ratings: number[] = [];

    for (const review of reviews) {
      if (typeof review.review_text === 'string') {
        review_texts.push(review.review_text);
      }
      if (typeof review.rating === 'number') {
        ratings.push(review.rating);
      }
    }

    return { review_texts, ratings };
  } catch (error: any) {
    console.error('Error fetching business reviews:', error?.response?.data || error?.message);
    throw new Error(error?.response?.data?.message || error?.message || 'Failed to fetch business reviews');
  }
};

export const fetchAndAnalyzeBusinesses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { business_id, query } = req.query;

    if (!business_id || !query) {
      res.status(400).json({ message: 'Missing required query parameter: business_id' });
      return;
    }

    const platform = req.headers['x-report-platform'] as string;

    const { review_texts } = await fetchBusinessReviews(business_id.toString());
    const combinedReviews = review_texts.join(' ');

    const Result = await analyzeAndCombinePaidData(combinedReviews, query.toString(), platform || 'Google');

    res.json(Result);
  } catch (error: any) {
    console.error('Error fetching or analyzing business reviews:', error);
    res.status(500).json({ message: 'Failed to fetch or analyze business reviews' });
  }
};

export const generateReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, business_id } = req.query;

    if (!query || !business_id) {
      res.status(400).json({ message: 'Missing required query parameter: query or business_id' });
      return;
    }

    const { review_texts } = await fetchBusinessReviews(business_id.toString());
    const combinedReviews = review_texts.join(' ');
    const data = await analyzeAndCombinePaidData(combinedReviews, query.toString(), 'Google Business');

    if (!data) {
      res.status(404).json({ message: 'No data found for the given query' });
      return;
    }

    const pdfBuffer = await generatePaidPdfReport(data);
    const reportUrl = await saveReportAndGetUrl(pdfBuffer, `${query} - ${new Date().toISOString()}`, 'Google Business');

    const userEmail = (req.query.email as string) || "";
    triggerGHLWorkflowSilent(userEmail, query.toString(), 'Google Business', reportUrl || undefined);

    res.setHeader('Content-Disposition', 'attachment; filename="reputation_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);

  } catch (error: any) {
    console.error('Error fetching data or generating PDF:', error);
    res.status(500).json({ message: error?.message || 'Failed to generate PDF' });
  }
};

  
