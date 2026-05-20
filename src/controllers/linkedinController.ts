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
    // Try both the raw keyword as domain and keyword+.com
    const domain = keyword.includes('.') ? keyword : `${keyword}.com`;

    // Run company domain lookup and post search in parallel
    const [companyRes, postsRes] = await Promise.allSettled([
      axios.get(`${BASE}/get-company-by-domain`, {
        headers: linkedinHeaders,
        params: { domain },
      }),
      axios.post(`${BASE}/search-posts`, {
        search_keywords: keyword,
        sort_by: 'Latest',
        page: 1,
      }, { headers: linkedinHeaders }),
    ]);

    let linkedinUsers: any[] = [];

    // Company result — put it first
    if (companyRes.status === 'fulfilled') {
      const c = companyRes.value.data?.data || companyRes.value.data;
      if (c && (c.company_name || c.name)) {
        linkedinUsers.push({
          full_name: c.company_name || c.name || keyword,
          url: c.linkedin_url || '',
          profile_picture: c.logo_url ? [{ url: c.logo_url }] : [],
          headline: c.tagline || (c.description || '').slice(0, 120) || c.industries?.[0] || '',
          type: 'Company',
        });
      }
    }

    // People from post authors — dedupe by linkedin URL, no enrichment (fast)
    if (postsRes.status === 'fulfilled') {
      const posts = postsRes.value.data?.data || [];
      const seen = new Set<string>();
      for (const post of posts) {
        const url = post.poster_linkedin_url || '';
        if (!url || seen.has(url)) continue;
        seen.add(url);
        linkedinUsers.push({
          full_name: post.poster_name || '',
          url,
          profile_picture: [],
          headline: post.poster_title || '',
          type: 'Person',
        });
        if (linkedinUsers.length >= 10) break;
      }
    }

    res.json({ linkedinUsers });
  } catch (error: any) {
    console.error('Error fetching LinkedIn users:', error);
    res.status(500).json({ message: 'Failed to fetch LinkedIn data' });
  }
};

// Accepts array of linkedin URLs, returns profile_image_url for each
export const enrichUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { urls } = req.body as { urls: string[] };
    if (!Array.isArray(urls) || urls.length === 0) {
      res.json({ enriched: [] });
      return;
    }

    const results = await Promise.allSettled(
      urls.map(url =>
        axios.get(`${BASE}/enrich-lead`, {
          headers: linkedinHeaders,
          params: {
            linkedin_url: url,
            include_skills: false,
            include_certifications: false,
            include_profile_status: false,
            include_company_public_url: false,
          },
          timeout: 5000,
        })
      )
    );

    const enriched = results.map((result, i) => ({
      url: urls[i],
      profile_image_url: result.status === 'fulfilled'
        ? result.value.data?.data?.profile_image_url || ''
        : '',
    }));

    res.json({ enriched });
  } catch (error: any) {
    console.error('Error enriching LinkedIn users:', error);
    res.json({ enriched: [] });
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


