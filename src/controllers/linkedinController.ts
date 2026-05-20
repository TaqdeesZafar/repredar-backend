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

    const keyword = query.toString().trim();
    const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
    const slugNoSpace  = words.join('');                  // "taqdeeszafar"
    const slugHyphen   = words.join('-');                 // "taqdees-zafar"
    const slugDot      = words.join('.');                 // "taqdees.zafar"
    const domain       = keyword.includes('.') ? keyword : `${slugNoSpace}.com`;

    // Build candidate URLs to try in parallel
    const personUrls = [
      `https://www.linkedin.com/in/${slugHyphen}/`,
      `https://www.linkedin.com/in/${slugNoSpace}/`,
      `https://www.linkedin.com/in/${slugDot}/`,
    ];
    const companyUrls = [
      `https://www.linkedin.com/company/${slugHyphen}/`,
      `https://www.linkedin.com/company/${slugNoSpace}/`,
    ];

    const enrichCall = (url: string) =>
      axios.get(`${BASE}/enrich-lead`, {
        headers: linkedinHeaders,
        params: { linkedin_url: url, include_skills: false, include_certifications: false, include_profile_status: false, include_company_public_url: false },
        timeout: 6000,
      });

    const companyCall = (url: string) =>
      axios.get(`${BASE}/get-company-by-linkedinurl`, { headers: linkedinHeaders, params: { linkedin_url: url } });

    const [domainRes, ...rest] = await Promise.allSettled([
      axios.get(`${BASE}/get-company-by-domain`, { headers: linkedinHeaders, params: { domain } }),
      ...personUrls.map(enrichCall),
      ...companyUrls.map(companyCall),
    ]);

    const personResults = rest.slice(0, personUrls.length);
    const companyResults = rest.slice(personUrls.length);

    let linkedinUsers: any[] = [];
    const seenUrls = new Set<string>();

    const addCompany = (c: any, fallbackUrl: string) => {
      if (!c || !(c.company_name || c.name)) return;
      const url = c.linkedin_url || fallbackUrl;
      if (seenUrls.has(url)) return;
      seenUrls.add(url);
      linkedinUsers.push({
        full_name: c.company_name || c.name,
        url,
        profile_picture: c.logo_url ? [{ url: c.logo_url }] : [],
        headline: c.tagline || (c.description || '').slice(0, 120) || (c.industries || [])[0] || '',
        type: 'Company',
      });
    };

    const addPerson = (p: any, url: string) => {
      if (!p?.full_name) return;
      if (seenUrls.has(url)) return;
      seenUrls.add(url);
      linkedinUsers.push({
        full_name: p.full_name,
        url,
        profile_picture: p.profile_image_url ? [{ url: p.profile_image_url }] : [],
        headline: p.headline || p.title || '',
        type: 'Person',
      });
    };

    // Domain company lookup
    if (domainRes.status === 'fulfilled') addCompany(domainRes.value.data?.data || domainRes.value.data, companyUrls[0]);

    // Person enrichment results
    personResults.forEach((r, i) => {
      if (r.status === 'fulfilled') addPerson(r.value.data?.data, personUrls[i]);
    });

    // Direct company URL results
    companyResults.forEach((r, i) => {
      if (r.status === 'fulfilled') addCompany(r.value.data?.data || r.value.data, companyUrls[i]);
    });

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


