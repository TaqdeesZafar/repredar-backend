import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import { triggerGHLWorkflowSilent } from '../utils/emailUtils';
import { saveReportAndGetUrl } from '../utils/saveReport';

dotenv.config();

const linkedinHeaders = {
  'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const BASE = 'https://fresh-linkedin-profile-data.p.rapidapi.com';

// Parse a LinkedIn URL or plain keyword into { type, linkedinUrl }
function parseLinkedIn(input: string): { type: 'company' | 'person'; linkedinUrl: string } {
  if (input.includes('/company/')) return { type: 'company', linkedinUrl: input };
  if (input.includes('/in/')) return { type: 'person', linkedinUrl: input };
  // plain keyword — treat as company search keyword, not a URL
  return { type: 'company', linkedinUrl: '' };
}

export const fetchUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.query;
    if (!query) {
      res.status(400).json({ message: 'Missing required query parameter: query' });
      return;
    }

    const keyword = query.toString();

    // Try company search by domain/keyword and person enrichment in parallel
    const [companyRes, personRes] = await Promise.allSettled([
      axios.get(`${BASE}/get-company-by-domain`, {
        headers: linkedinHeaders,
        params: { domain: keyword },
      }),
      axios.post(`${BASE}/search-employees`, {
        keywords: keyword,
        limit: 10,
      }, { headers: linkedinHeaders }),
    ]);

    let linkedinUsers: any[] = [];

    if (companyRes.status === 'fulfilled') {
      const c = companyRes.value.data?.data || companyRes.value.data;
      if (c && c.linkedin_url) {
        linkedinUsers.push({
          full_name: c.name || keyword,
          url: c.linkedin_url || '',
          profile_picture: c.logo ? [{ url: c.logo }] : [],
          headline: c.description || c.industry || '',
          type: 'Company',
        });
      }
    }

    if (personRes.status === 'fulfilled') {
      const people = personRes.value.data?.data || personRes.value.data?.items || [];
      const mapped = people.slice(0, 8).map((u: any) => ({
        full_name: u.full_name || u.name || '',
        url: u.linkedin_url || u.url || '',
        profile_picture: u.profile_picture ? [{ url: u.profile_picture }] : [],
        headline: u.headline || u.title || '',
        type: 'Person',
      }));
      linkedinUsers = [...linkedinUsers, ...mapped];
    }

    res.json({ linkedinUsers });
  } catch (error: any) {
    console.error('Error fetching LinkedIn users:', error);
    res.status(500).json({ message: 'Failed to fetch LinkedIn data' });
  }
};

// Fetch post URNs for a LinkedIn URL
export const fetchPostsById = async (linkedinUrl: string): Promise<{ urns: string[]; profileType: 'company' | 'person' }> => {
  const { type } = parseLinkedIn(linkedinUrl);

  try {
    let posts: any[] = [];
    if (type === 'company') {
      const res = await axios.get(`${BASE}/get-company-posts`, {
        headers: linkedinHeaders,
        params: { linkedin_url: linkedinUrl, start: 0, sort_by: 'top' },
      });
      posts = res.data?.data || [];
    } else {
      const res = await axios.get(`${BASE}/get-profile-posts`, {
        headers: linkedinHeaders,
        params: { linkedin_url: linkedinUrl, type: 'posts' },
      });
      posts = res.data?.data || [];
    }
    const urns = posts.map((p: any) => p.urn).filter(Boolean).slice(0, 5);
    return { urns, profileType: type };
  } catch (error: any) {
    console.error('Error fetching LinkedIn posts:', error);
    return { urns: [], profileType: type };
  }
};

export const fetchPostsReplies = async (urns: string[], _profileType: 'company' | 'person'): Promise<string> => {
  if (!urns.length) return '';
  let allComments: string[] = [];

  for (const urn of urns) {
    try {
      const res = await axios.get(`${BASE}/get-post-comments`, {
        headers: linkedinHeaders,
        params: { urn, sort_by: 'Most relevant', page: 1 },
      });
      const comments = res.data?.data || [];
      const texts = comments.map((c: any) => c.comment || c.text || '').filter(Boolean);
      allComments = [...allComments, ...texts];
    } catch {
      // skip inaccessible posts
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
  } catch (error: any) {
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


