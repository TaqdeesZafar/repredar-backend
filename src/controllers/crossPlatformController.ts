import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidCrossPlatformData } from '../utils/getPaidReport';
import { triggerGHLWorkflowSilent } from '../utils/emailUtils';
import { saveReportAndGetUrl } from '../utils/saveReport';



dotenv.config();

const facebookHeaders = {
  'x-rapidapi-host': 'facebook-scraper3.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const linkedinHeaders = {
  'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const LINKEDIN_BASE = 'https://fresh-linkedin-profile-data.p.rapidapi.com';

const tiktokHeaders = {
  'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const twitterHeaders = {
  'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const twitterTweetIdsApiUrl = process.env.TWITTER_TWEET_IDS_API_URL;
const tiktokPostsIdsApiUrl = process.env.TIKTOK_POSTS_IDS_API_URL;
const facebookSearchApiUrl = process.env.FACEBOOK_SEARCH_API_URL;
const facebookSearchProfileUrl = process.env.FACEBOOK_SEARCH_PROFILE_URL;
const facebookPostsIdsApiUrl = process.env.FACEBOOK_POSTS_IDS_API_URL;
const facebookProfilePostsIdsApiUrl = process.env.FACEBOOK_PROFILE_POSTS_IDS_API_URL;

const facebookPostRepliesApiUrl = process.env.FACEBOOK_POST_REPLIES_API_URL;
const tiktokPostRepliesApiUrl = process.env.TIKTOK_POST_REPLIES_API_URL;
const twitterTweetRepliesApiUrl = process.env.TWITTER_TWEET_REPLIES_API_URL;


const extractTwitterScreenName = (url: string): string | null => {
  const regex = /https:\/\/(x\.com|twitter\.com)\/([^\/?]+)/;
  const match = url.match(regex);
  return match ? match[2] : null;
};

const isLinkedInCompanyURL = (url: string): boolean => {
  const regex = /^https:\/\/www\.linkedin\.com\/company\//;
  return regex.test(url);
};

const extractTikTokScreenName = (url: string): string | null => {
  const regex = /https:\/\/www\.tiktok\.com\/@([^\/?]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

// Instagram helpers (copied/adapted from instagramController)
const instagramHeaders = {
  'x-rapidapi-host': 'instagram-social-api.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};
const InstagramPostsIdsApiUrl = process.env.INSTAGRAM_POSTS_IDS_API_URL;
const instagramPostRepliesApiUrl = process.env.INSTAGRAM_POST_REPLIES_API_URL;

const fetchInstagramPostsById = async (query: string): Promise<{ postIds: string[], isPrivate: boolean }> => {
  try {
    const InstagramParams = {
      username_or_id_or_url: query,
    };
    if (!InstagramPostsIdsApiUrl) {
      return { postIds: [], isPrivate: false };
    }
    const instagramResponse = await axios.get(InstagramPostsIdsApiUrl, {
      headers: instagramHeaders,
      params: InstagramParams,
    });
    const postIds = instagramResponse.data.data.items.map((post: any) => post.code);
    return { postIds, isPrivate: false };
  } catch (error: any) {
    if (
      error.response &&
      error.response.status === 404 &&
      error.response.data &&
      error.response.data.detail === 'Not found'
    ) {
      return { postIds: [], isPrivate: true };
    }
    console.error('Error fetching Instagram posts by ID:', error);
    throw new Error('Failed to fetch Instagram posts by ID');
  }
};

const fetchInstagramPostsReplies = async (postIds: string[]) => {
  if (!instagramPostRepliesApiUrl || !postIds?.length) return '';
  let allReplies: string[] = [];
  for (const postid of postIds) {
    try {
      const instagramResponse = await axios.get(instagramPostRepliesApiUrl, {
        headers: instagramHeaders,
        params: { code_or_id_or_url: postid },
      });
      const replies = instagramResponse.data?.data?.items || [];
      allReplies = [...allReplies, ...replies.map((p: any) => p.text).filter(Boolean)];
    } catch {
      // skip posts with no accessible comments
    }
  }
  return allReplies.join(' ');
};


export const fetchPostsById = async (url: string, context?: { facebookType?: 'page' | 'profile' }): Promise<any> => {
  try {
    if (!url) {
      throw new Error("Missing platform URL");
    }

    const dictionary: { [key: string]: any } = {};

    if (url.includes('x.com') || url.includes('twitter.com')) {
      const twitterScreenName = extractTwitterScreenName(url);
      if (twitterScreenName && twitterTweetIdsApiUrl) {
        const twitterParams = { screenname: twitterScreenName };
        const twitterResponse = await axios.get(twitterTweetIdsApiUrl, {
          headers: twitterHeaders,
          params: twitterParams,
        });
        const tweetIds = twitterResponse.data.timeline.map((tweet: any) => tweet.tweet_id);
        dictionary.twitter = tweetIds;
      }
    }

    else if (url.includes('linkedin.com')) {
      const profileType = isLinkedInCompanyURL(url) ? 'company' : 'person';
      try {
        const postsEndpoint = profileType === 'company'
          ? `${LINKEDIN_BASE}/get-company-posts`
          : `${LINKEDIN_BASE}/get-profile-posts`;
        const params = profileType === 'company'
          ? { linkedin_url: url, start: 0, sort_by: 'top' }
          : { linkedin_url: url, type: 'posts' };
        const response = await axios.get(postsEndpoint, { headers: linkedinHeaders, params });
        const posts = response.data?.data || [];
        const urns = posts.map((p: any) => p.urn).filter(Boolean).slice(0, 5);
        dictionary.linkedin = { urns, profileType };
      } catch {
        // LinkedIn API unavailable — skip silently
      }
    }

    else if (url.includes('tiktok.com')) {
      const tiktokScreenName = extractTikTokScreenName(url);
      if (tiktokScreenName && tiktokPostsIdsApiUrl) {
        // Step 1: get secUid from username via /api/user/info
        const userInfoResponse = await axios.get('https://tiktok-api23.p.rapidapi.com/api/user/info', {
          headers: tiktokHeaders,
          params: { uniqueId: tiktokScreenName },
        });
        const secUid = userInfoResponse.data?.userInfo?.user?.secUid;
        if (secUid) {
          // Step 2: get post IDs using secUid
          const tiktokPostsResponse = await axios.get(tiktokPostsIdsApiUrl, {
            headers: tiktokHeaders,
            params: { secUid, count: 5, cursor: 0 },
          });
          const postIds = (tiktokPostsResponse.data?.data?.itemList || []).map((post: any) => post.id).filter(Boolean);
          dictionary.tiktok = { postIds };
        }
      }
    }

    else if (url.includes('facebook.com')) {
      const isProfile = context?.facebookType === 'profile';
      // Extract slug from URL (e.g. facebook.com/microsoft â†’ "microsoft")
      const urlSlug = url.replace(/\/$/, '').split('/').filter(Boolean).pop() || '';

      if (isProfile) {
        if (!facebookSearchProfileUrl || !facebookProfilePostsIdsApiUrl) {
          throw new Error('Facebook profile API URLs not configured');
        }
        const profileHeaders = { 'x-rapidapi-host': 'facebook-scraper-api4.p.rapidapi.com', 'x-rapidapi-key': process.env.RAPID_API_KEY };
        const searchResp = await axios.get(facebookSearchProfileUrl, {
          headers: profileHeaders,
          params: { query: urlSlug },
        });
        const profileId = searchResp.data?.data?.items?.[0]?.facebook_id || searchResp.data?.data?.items?.[0]?.id;
        if (!profileId) throw new Error('PRIVATE_PROFILE');

        const postsResp = await axios.get(facebookProfilePostsIdsApiUrl, {
          headers: profileHeaders,
          params: { profile_id: profileId },
        });
        const results = postsResp.data?.results || [];
        if (results.length === 0) throw new Error('PRIVATE_PROFILE');

        const postIds = results.map((post: any) => post.post_id);
        const reactions = results.map((post: any) =>
          post.reactions ? Object.entries(post.reactions).map(([r, c]) => `${r} (${c})`).join(', ') : ''
        );
        dictionary.facebook = { postIds, reactions };
      } else {
        if (!facebookSearchApiUrl || !facebookPostsIdsApiUrl) {
          throw new Error('Facebook page API URLs not configured');
        }
        const searchResp = await axios.get(facebookSearchApiUrl, {
          headers: facebookHeaders,
          params: { query: urlSlug },
        });
        const pageId = searchResp.data?.results?.[0]?.facebook_id;
        if (!pageId) throw new Error('Could not resolve Facebook page ID from URL');

        const postsResp = await axios.get(facebookPostsIdsApiUrl, {
          headers: facebookHeaders,
          params: { page_id: pageId },
        });
        const results = postsResp.data?.results || [];
        const postIds = results.map((post: any) => post.post_id);
        const reactions = results.map((post: any) =>
          post.reactions ? Object.entries(post.reactions).map(([r, c]) => `${r} (${c})`).join(', ') : ''
        );
        dictionary.facebook = { postIds, reactions };
      }
    }

    return dictionary; 
  } catch (error: any) {
    console.error('Error fetching data for platform:', error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error?.constructor?.name);
    
    // Check if it's a PRIVATE_PROFILE error
    if (error instanceof Error && error.message === 'PRIVATE_PROFILE') {
      console.log('PRIVATE_PROFILE error detected, re-throwing');
      throw error; // Re-throw to be caught by the main error handler
    }
    
    throw new Error(`Failed to fetch posts for URL: ${url}`);
  }
};

export const fetchReplies = async (data: any): Promise<any> => {
  try {
    const dictionary: { [key: string]: any } = {};

    if (data.twitter && data.twitter.twitter && data.twitter.twitter.length > 0 && twitterTweetRepliesApiUrl) {
      let allReplies: string[] = [];
      for (const tweetId of data.twitter.twitter) {
        try {
          const twitterResponse = await axios.get(twitterTweetRepliesApiUrl, {
            headers: twitterHeaders,
            params: { id: tweetId },
          });
          const replies = (twitterResponse.data?.timeline || []).map((tweet: any) => tweet.text || '').filter(Boolean);
          allReplies = [...allReplies, ...replies];
        } catch {
          // skip tweets with no accessible replies
        }
      }
      dictionary.twitter = allReplies.join(' ');
    }

    if (data.linkedin && data.linkedin.linkedin && data.linkedin.linkedin.urns) {
      const { urns } = data.linkedin.linkedin;
      let allComments: string[] = [];
      for (const urn of urns) {
        try {
          const response = await axios.get(`${LINKEDIN_BASE}/get-post-comments`, {
            headers: linkedinHeaders,
            params: { urn, sort_by: 'Most relevant', page: 1 },
          });
          const comments = response.data?.data || [];
          const texts = comments.map((c: any) => c.comment || c.text || '').filter(Boolean);
          allComments = [...allComments, ...texts];
        } catch {
          // skip posts with no accessible comments
        }
      }
      dictionary.linkedin = allComments.join(' ');
    }

    if (data.tiktok && data.tiktok.tiktok && data.tiktok.tiktok.postIds && data.tiktok.tiktok.postIds.length > 0) {
      let allReplies: string[] = [];
      for (let postId of data.tiktok.tiktok.postIds) { 
        const tiktokParams = { videoId: postId, count: 50, cursor: 0 };

        const tiktokResponse = await axios.get(tiktokPostRepliesApiUrl as string, {
          headers: tiktokHeaders,
          params: tiktokParams,
        });

        const replies = tiktokResponse?.data?.comments || [];
        const replyTexts = replies.map((comment: any) => comment.text);
        allReplies = [...allReplies, ...replyTexts];
      }

      dictionary.tiktok = allReplies.join(' ');
    }

    if (data.facebook && data.facebook.facebook && data.facebook.facebook.postIds && data.facebook.facebook.reactions) {
      let allReplies: string[] = [];
      const facebookData = data.facebook.facebook;
      const postIds = facebookData.postIds;
      const reactions = facebookData.reactions;

      for (let postId of postIds) {
        const facebookParams = { post_id: postId };

        const facebookResponse = await axios.get(facebookPostRepliesApiUrl as string, {
          headers: facebookHeaders,
          params: facebookParams,
        });

        const replies = facebookResponse?.data?.results || [];
        const replyTexts = replies.map((comment: any) => comment.message);
        allReplies = [...allReplies, ...replyTexts];
      }

      const combinedText = [...allReplies, ...reactions].join(' ');
      dictionary.facebook = combinedText;
    }

    if (data.instagram && data.instagram.instagram && data.instagram.instagram.postReplies) {
      // Just use the combined post replies string
      dictionary.instagram = data.instagram.instagram.postReplies;
    }

    return dictionary; 

  } catch (error: any) {
    console.error("Error fetching replies:", error);
    throw new Error("Failed to fetch replies");
  }
};


export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { twitter, linkedin, tiktok, facebook, instagram, query } = req.query; 
    const platform = req.headers['x-report-platform'] as string;

    if (!twitter && !linkedin && !tiktok && !facebook && !instagram) {
      res.status(400).json({ message: 'Missing required query parameters: twitter, linkedin, tiktok, facebook, or instagram' });
      return;
    }

    const platformData: { [key: string]: any } = {};

    if (twitter) {
      const twitterData = await fetchPostsById(twitter as string); 
      platformData.twitter = twitterData; 
    }

    if (linkedin) {
      const linkedinData = await fetchPostsById(linkedin as string);
      platformData.linkedin = linkedinData; 
    }

    if (tiktok) {
      const tiktokData = await fetchPostsById(tiktok as string); 
      platformData.tiktok = tiktokData;
    }

    if (facebook) {
      const facebookType = req.query.facebookType as 'page' | 'profile' | undefined;
      const facebookData = await fetchPostsById(facebook as string, { facebookType }); 
      platformData.facebook = facebookData; 
    }

    // Instagram logic
    if (instagram) {
      const formatedQuery = (instagram as string).replace(/^@/, '');
      const { postIds, isPrivate } = await fetchInstagramPostsById(formatedQuery);
      if (isPrivate) {
        res.status(404).json({ 
          message: 'The profile/page you are trying to fetch is set to private or has no accessible posts',
          error: 'PRIVATE_PROFILE'
        });
        return; 
      }
      const postReplies = await fetchInstagramPostsReplies(postIds);
      // For consistency with fetchReplies, wrap in the same structure
      platformData.instagram = { instagram: { postIds, postReplies } };
    }

    const dictionary = await fetchReplies(platformData);
    console.log('platformData', platformData)
    console.log('dictionary', dictionary)
    console.log('dictionary.facebook:', dictionary.facebook);
    console.log('dictionary.facebook length:', dictionary.facebook ? dictionary.facebook.length : 'undefined');

    const result = await analyzeAndCombinePaidCrossPlatformData(dictionary, query as string, platform || 'Cross Platform');
    res.json(result);

  } catch (error: any) {
    console.error('Error fetching and analyzing data:', error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error?.constructor?.name);
    
    // Handle private profile error specifically
    if (error instanceof Error && error.message === 'PRIVATE_PROFILE') {
      console.log('PRIVATE_PROFILE error caught in main handler, sending 404 response');
      res.status(404).json({ 
        message: 'The profile you are trying to fetch is set to private or has no accessible posts',
        error: 'PRIVATE_PROFILE'
      });
      return;
    }
    
    res.status(500).json({ 
      message: 'Failed to fetch and analyze data', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};





export const generateReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { twitter, linkedin, tiktok, facebook, instagram, query } = req.query;

    if (!twitter && !linkedin && !tiktok && !facebook && !instagram) {
      res.status(400).json({ message: 'Missing required query parameters: twitter, linkedin, tiktok, facebook, or instagram' });
      return;
    }

    const platformData: { [key: string]: any } = {};
    if (twitter) { platformData.twitter = await fetchPostsById(twitter as string); }
    if (linkedin) { platformData.linkedin = await fetchPostsById(linkedin as string); }
    if (tiktok) { platformData.tiktok = await fetchPostsById(tiktok as string); }
    if (facebook) {
      const facebookType = req.query.facebookType as 'page' | 'profile' | undefined;
      platformData.facebook = await fetchPostsById(facebook as string, { facebookType });
    }
    if (instagram) {
      const formattedQuery = (instagram as string).replace(/^@/, '');
      const { postIds, isPrivate } = await fetchInstagramPostsById(formattedQuery);
      if (isPrivate) {
        res.status(404).json({ message: 'The profile is private or has no accessible posts', error: 'PRIVATE_PROFILE' });
        return;
      }
      const postReplies = await fetchInstagramPostsReplies(postIds);
      platformData.instagram = { instagram: { postIds, postReplies } };
    }

    const dictionary = await fetchReplies(platformData);

    const selectedPlatforms: string[] = [];
    if (twitter) selectedPlatforms.push('Twitter');
    if (linkedin) selectedPlatforms.push('Linkedin');
    if (tiktok) selectedPlatforms.push('Tiktok');
    if (facebook) selectedPlatforms.push('Facebook');
    if (instagram) selectedPlatforms.push('Instagram');

    const data = await analyzeAndCombinePaidCrossPlatformData(dictionary, query as string, selectedPlatforms.join(', '));

    if (!data) {
      res.status(404).json({ message: 'No data found for the given query' });
      return;
    }

    const pdfBuffer = await generatePaidPdfReport(data);
    const reportUrl = await saveReportAndGetUrl(pdfBuffer, `${query} - ${new Date().toISOString()}`, 'Cross Platform');

    const userEmail = (req.query.email as string) || "";
    triggerGHLWorkflowSilent(userEmail, (query as string) || '', 'Cross Platform', reportUrl || undefined);

    res.setHeader('Content-Disposition', 'attachment; filename="reputation_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);

  } catch (error: any) {
    if (error.message === 'PRIVATE_PROFILE') {
      res.status(404).json({ message: 'The profile is private or has no accessible posts', error: 'PRIVATE_PROFILE' });
      return;
    }
    console.error('Error fetching data or generating PDF:', error);
    res.status(500).json({ message: error?.message || 'Failed to generate PDF' });
  }
}; 
