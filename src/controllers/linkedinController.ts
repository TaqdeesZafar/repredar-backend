import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import { triggerGHLWorkflowSilent } from '../utils/emailUtils';
import { saveReportAndGetUrl } from '../utils/saveReport';

dotenv.config();

const linkedinHeaders = {
  'x-rapidapi-host': 'linkedin-data-api.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const linkedinSearchApiUrl = process.env.LINKEDIN_SEARCH_API_URL;
const linkedinCompanyPostsApiUrl = process.env.LINKEDIN_COMPANY_POSTS_API_URL;
const linkedinProfilePostsApiUrl = process.env.LINKEDIN_PROFILE_POSTS_API_URL;
const linkedinCompanyPostCommentsApiUrl = process.env.LINKEDIN_COMPANY_POST_COMMENTS_API_URL;
const linkedinProfilePostCommentsApiUrl = process.env.LINKEDIN_PROFILE_POST_COMMENTS_API_URL;

// Parse a LinkedIn URL or plain username into { type, username }
function parseLinkedIn(input: string): { type: 'company' | 'person'; username: string } {
  const companyMatch = input.match(/\/company\/([^/?#]+)/);
  if (companyMatch) return { type: 'company', username: companyMatch[1] };
  const personMatch = input.match(/\/in\/([^/?#]+)/);
  if (personMatch) return { type: 'person', username: personMatch[1] };
  // Plain username or keyword — default to company
  return { type: 'company', username: input.replace(/\/$/, '') };
}

export const fetchUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.query;

    if (!query) {
      res.status(400).json({ message: 'Missing required query parameter: query' });
      return;
    }

    if (!linkedinSearchApiUrl) {
      res.status(500).json({ message: 'LinkedIn search API URL not defined in .env' });
      return;
    }

    const linkedinResponse = await axios.get(linkedinSearchApiUrl, {
      headers: linkedinHeaders,
      params: { keywords: query.toString() },
    });

    const rawUsers = linkedinResponse.data?.data || linkedinResponse.data?.items || linkedinResponse.data?.results || [];

    // Normalise field names — API may return profileUrl or url
    const linkedinUsers = rawUsers.map((u: any) => ({
      ...u,
      url: u.url || u.profileUrl || u.profile_url || u.linkedin_url || '',
      profile_picture: u.profile_picture || (u.profilePicture ? [{ url: u.profilePicture }] : []),
      full_name: u.full_name || u.fullName || u.name || '',
    }));

    res.json({ linkedinUsers });
  } catch (error) {
    console.error('Error fetching LinkedIn users:', error);
    res.status(500).json({ message: 'Failed to fetch LinkedIn data' });
  }
};

// Returns { urns, profileType } for a given LinkedIn URL or username
export const fetchPostsById = async (urlOrUsername: string): Promise<{ urns: string[]; profileType: 'company' | 'person' }> => {
  const { type, username } = parseLinkedIn(urlOrUsername);

  const postsUrl = type === 'company' ? linkedinCompanyPostsApiUrl : linkedinProfilePostsApiUrl;
  if (!postsUrl) return { urns: [], profileType: type };

  try {
    const response = await axios.get(postsUrl, {
      headers: linkedinHeaders,
      params: type === 'company' ? { username, start: 0 } : { username },
    });
    const posts = response.data?.data || [];
    const urns = posts.map((p: any) => p.urn).filter(Boolean);
    return { urns, profileType: type };
  } catch (error) {
    console.error('Error fetching LinkedIn posts:', error);
    return { urns: [], profileType: type };
  }
};

export const fetchPostsReplies = async (urns: string[], profileType: 'company' | 'person'): Promise<string> => {
  const commentsUrl = profileType === 'company'
    ? linkedinCompanyPostCommentsApiUrl
    : linkedinProfilePostCommentsApiUrl;

  if (!commentsUrl || !urns.length) return '';

  let allComments: string[] = [];

  for (const urn of urns) {
    try {
      const response = await axios.get(commentsUrl, {
        headers: linkedinHeaders,
        params: { urn, sort: 'mostRelevant', page: 1 },
      });
      const comments = response.data?.data || [];
      const texts = comments
        .map((c: any) => c.comment || c.text?.content || c.text || '')
        .filter(Boolean);
      allComments = [...allComments, ...texts];
    } catch {
      // skip posts with no accessible comments
    }
  }

  return allComments.join(' ');
};

export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, query } = req.query;

    if (!url || !query) {
      res.status(400).json({ message: 'Missing required query parameter: url / query' });
      return;
    }
    const platform = req.headers['x-report-platform'] as string;

    const { urns, profileType } = await fetchPostsById(url.toString());
    const postReplies = await fetchPostsReplies(urns, profileType);

    const Result = await analyzeAndCombinePaidData(postReplies, query.toString(), platform || 'LinkedIn');

    res.json(Result);
  } catch (error) {
    console.error('Error fetching LinkedIn data:', error);
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

    const { urns, profileType } = await fetchPostsById(url.toString());
    const postReplies = await fetchPostsReplies(urns, profileType);
    const data = await analyzeAndCombinePaidData(postReplies, query.toString(), 'LinkedIn');

    if (!data) {
      res.status(404).json({ message: 'No data found for the given query' });
      return;
    }

    const pdfBuffer = await generatePaidPdfReport(data);
    const reportUrl = await saveReportAndGetUrl(pdfBuffer, `${query} - ${new Date().toISOString()}`, 'LinkedIn');

    const userEmail = (req.query.email as string) || "";
    triggerGHLWorkflowSilent(userEmail, query.toString(), 'LinkedIn', reportUrl || undefined);

    res.setHeader('Content-Disposition', 'attachment; filename="reputation_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating LinkedIn report:', error);
    res.status(500).json({ message: error?.message || 'Failed to generate PDF' });
  }
};
