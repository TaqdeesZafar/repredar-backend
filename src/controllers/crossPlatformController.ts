import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { analyzeAndCombineCrossPlatformData } from "../utils/getFreeReport"
import { generateFreePdfReport, generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidCrossPlatformData } from '../utils/getPaidReport';
import Report from '../models/Report';
import User from '../models/User';



dotenv.config();

const facebookHeaders = {
  'x-rapidapi-host': 'facebook-scraper3.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const linkedinHeaders = {
  'x-rapidapi-host': 'best-linkedin-scraper-api3.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const tiktokHeaders = {
  'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const twitterHeaders = {
  'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPID_API_KEY,
};

const twitterTweetIdsApiUrl = process.env.TWITTER_TWEET_IDS_API_URL;
const linkedinCompanyPostsApiUrl = process.env.LINKEDIN_COMPANY_POSTS_API_URL;
const tiktokUserApi = process.env.TIKTOK_USER_POSTS_API_URL;
const tiktokPostsIdsApiUrl = process.env.TIKTOK_POSTS_IDS_API_URL;
const facebookUserApi = process.env.FACEBOOK_USER_API_URL;
const facebookPostsIdsApiUrl = process.env.FACEBOOK_POSTS_IDS_API_URL;
const facebookProfileDetailsApiUrl = process.env.FACEBOOK_PROFILE_DETAILS_API_URL;
const facebookProfilePostsIdsApiUrl = process.env.FACEBOOK_PROFILE_POSTS_IDS_API_URL;

const facebookPostRepliesApiUrl = process.env.FACEBOOK_POST_REPLIES_API_URL;
const linkedinPostRepliesApiUrl = process.env.LINKEDIN_POST_REPLIES_API_URL;
const tiktokPostRepliesApiUrl = process.env.TIKTOK_POST_REPLIES_API_URL;
const twitterTweetRepliesApiUrl = process.env.TWITTER_TWEET_REPLIES_API_URL;

const crossPlatformData = process.env.CROSS_PLATFORM_DATA_API_URL;
const linkedinProfilePostsApiUrl = process.env.LINKEDIN_PROFILE_POSTS_API_URL;


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
  try {
    let allReplies: string[] = [];
    for (let postid of postIds) {
      const InstagramParams = {
        code_or_id_or_url: postid,
      };
      if (!instagramPostRepliesApiUrl) {
        return '';
      }
      const instagramResponse = await axios.get(instagramPostRepliesApiUrl, {
        headers: instagramHeaders,
        params: InstagramParams,
      });
      const replies = instagramResponse.data.data.items;
      const replyTexts = replies.map((post: any) => post.text);
      allReplies = [...allReplies, ...replyTexts];
    }
    const combinedPostText = allReplies.join(' ');
    return combinedPostText;
  } catch (error) {
    console.error('Error fetching Instagram posts replies:', error);
    throw new Error('Failed to fetch Instagram posts replies');
  }
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
      if (isLinkedInCompanyURL(url)) {
        // Existing company logic
        const linkedinParams = { url };
        const linkedinResponse = await axios.get(linkedinCompanyPostsApiUrl as string, {
          headers: linkedinHeaders,
          params: linkedinParams,
        });
        const postIds = linkedinResponse.data.data.map((posts: any) => posts.url);
        const reactions = linkedinResponse.data.data.map((posts: any) => posts.reaction_types);
        dictionary.linkedin = { postIds, reactions };
      } else {
        // New profile logic
        if (!linkedinProfilePostsApiUrl) {
          throw new Error("LinkedIn profile posts API URL is not defined");
        }
        console.log('is profile')
        const linkedinProfileParams = { url, page: 1 };
        const linkedinProfileResponse = await axios.get(linkedinProfilePostsApiUrl, {
          headers: linkedinHeaders,
          params: linkedinProfileParams,
        });
        const results = linkedinProfileResponse.data.data || [];
        // Extract post URLs, reactions, and text
        const postIds = results.map((post: any) => post.url);
        const reactions = results.map((post: any) => {
          if (post.reaction_types) {
            return post.reaction_types
              .map((reaction: any) => `${reaction.type} (${reaction.total})`)
              .join(', ');
          }
          return "";
        });
        const texts = results.map((post: any) => post.text?.content || "");
        // Store in the same structure as company for downstream compatibility, but include texts
        dictionary.linkedin = { postIds, reactions, texts };
      }
    }

    else if (url.includes('tiktok.com')) {
      const tiktokScreenName = extractTikTokScreenName(url);
      if (tiktokScreenName && tiktokUserApi) {
        const tiktokUserParams = { uniqueId: tiktokScreenName };
        const tiktokUserResponse = await axios.get(tiktokUserApi as string, {
          headers: tiktokHeaders,
          params: tiktokUserParams,
        });

        const secUid = tiktokUserResponse.data.userInfo?.user.secUid;
        if (secUid) {
          const tiktokParams = { secUid, count: 5, cursor: 0 };
          const tiktokPostsResponse = await axios.get(tiktokPostsIdsApiUrl as string, {
            headers: tiktokHeaders,
            params: tiktokParams,
          });
          const postIds = tiktokPostsResponse.data.data.itemList.map((post: any) => post.id);
          dictionary.tiktok = { postIds };
        }
      }
    }

    else if (url.includes('facebook.com')) {
      // Check if it's a profile or page based on context
      const isProfile = context?.facebookType === 'profile';
      console.log('Facebook URL detected:', url);
      console.log('Facebook context:', context);
      console.log('Is profile:', isProfile);
      
      if (isProfile) {
        console.log('Processing Facebook profile...');
        // Handle Facebook profile
        if (!facebookProfileDetailsApiUrl) {
          console.error('Facebook profile details API URL is not defined');
          throw new Error("Facebook profile details API URL is not defined");
        }
        
        const facebookProfileParams = { url };
        console.log('Calling Facebook profile details API with params:', facebookProfileParams);
        const facebookProfileResponse = await axios.get(facebookProfileDetailsApiUrl, {
          headers: facebookHeaders,
          params: facebookProfileParams,
        });
        
        console.log('Facebook profile details response:', facebookProfileResponse.data);
        const profileData = facebookProfileResponse.data;
        
        // Check if profile is private
        if (profileData.profile && profileData.profile.type === 'private_profile') {
          console.log('Profile is private, throwing PRIVATE_PROFILE error');
          throw new Error('PRIVATE_PROFILE');
        }
        
        // Check if we have valid profile data
        if (!profileData.profile.profile_id) {
          console.error('Invalid profile data received:', profileData);
          throw new Error('Invalid profile data received');
        }
        
        console.log('Profile ID found:', profileData.profile.profile_id);
        
        // Fetch profile posts
        if (!facebookProfilePostsIdsApiUrl) {
          console.error('Facebook profile posts API URL is not defined');
          throw new Error("Facebook profile posts API URL is not defined");
        }
        
        const facebookProfilePostsParams = { profile_id: profileData.profile.profile_id };
        console.log('Calling Facebook profile posts API with params:', facebookProfilePostsParams);
        const facebookProfilePostsResponse = await axios.get(facebookProfilePostsIdsApiUrl, {
          headers: facebookHeaders,
          params: facebookProfilePostsParams,
        });
        
        console.log('Facebook profile posts response:', facebookProfilePostsResponse.data);
        const results = facebookProfilePostsResponse.data.results || [];
        console.log('Profile posts results length:', results.length);
        
        // Check if results are empty (private or no posts)
        if (results.length === 0) {
          console.log('No posts found, profile might be private, throwing PRIVATE_PROFILE error');
          throw new Error('PRIVATE_PROFILE');
        }
        
        const postIds = results.map((post: any) => post.post_id);
        const reactions = results.map((post: any) => {
          if (post.reactions) {
            return Object.entries(post.reactions)
              .map(([reaction, count]) => `${reaction} (${count})`)
              .join(', ');
          }
          return "";
        });
        
        console.log('Profile postIds:', postIds);
        console.log('Profile reactions:', reactions);
        dictionary.facebook = { postIds, reactions };
      } else {
        console.log('Processing Facebook page...');
        // Handle Facebook page (existing logic)
        const facebookUserParams = { url };
        const facebookUserResponse = await axios.get(facebookUserApi as string, {
          headers: facebookHeaders,
          params: facebookUserParams,
        });
        const pageId = facebookUserResponse.data.page_id;
        if (pageId) {
          const facebookParams = { page_id: pageId };
          const facebookPostsResponse = await axios.get(facebookPostsIdsApiUrl as string, {
            headers: facebookHeaders,
            params: facebookParams,
          });

          const results = facebookPostsResponse.data.results || [];
          const postIds = results.map((post: any) => post.post_id);
          const reactions = results.map((post: any) => {
            if (post.reactions) {
              return Object.entries(post.reactions)
                .map(([reaction, count]) => `${reaction} (${count})`)
                .join(', ');
            }
            return "";
          });

          dictionary.facebook = { postIds, reactions };
        }
      }
    }

    return dictionary; 
  } catch (error) {
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
      for (let tweetId of data.twitter.twitter) { 
        const twitterParams = { id: tweetId };

        const twitterResponse = await axios.get(twitterTweetRepliesApiUrl, {
          headers: twitterHeaders,
          params: twitterParams,
        });

        const replies = twitterResponse.data.timeline.map((tweet: any) => tweet.text);
        allReplies = [...allReplies, ...replies];
      }
      dictionary.twitter = allReplies.join(' ');
    }

    if (data.linkedin && data.linkedin.linkedin && data.linkedin.linkedin.postIds && data.linkedin.linkedin.reactions) {
      let allReplies: string[] = [];
      let allReactions: string[] = [];
      const { postIds, reactions } = data.linkedin.linkedin;

      for (let i = 0; i < postIds.length; i++) {
        const postId = postIds[i];
        const linkedinParams = { url: postId, page: 1, sort_order: "REVERSE_CHRONOLOGICAL" };

        const linkedinResponse = await axios.get(linkedinPostRepliesApiUrl as string, {
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
      dictionary.linkedin = combinedText;
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

  } catch (error) {
    console.error("Error fetching replies:", error);
    throw new Error("Failed to fetch replies");
  }
};


export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { twitter, linkedin, tiktok, facebook, instagram, query } = req.query; 
    const platform = req.headers['x-report-platform'] as string;
    const isPaidReport = req.headers['x-report-type'] === 'paid'; 

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

    let result;
    if (!isPaidReport) {
      console.log('Calling analyzeAndCombineCrossPlatformData with query:', query);
      result = await analyzeAndCombineCrossPlatformData(dictionary, query as string, 'Cross Platform'); 
    } else {
      console.log('Calling analyzeAndCombinePaidCrossPlatformData with query:', query, 'and platform:', platform);
      result = await analyzeAndCombinePaidCrossPlatformData(dictionary, query as string, platform); 
    }
    res.json(result);

  } catch (error) {
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





export const generateFreeReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { twitter, linkedin, tiktok, facebook, instagram, query } = req.query; 

    if (!twitter && !linkedin && !tiktok && !facebook && !instagram) {
      res.status(400).json({ message: 'Missing required query parameters: twitter, linkedin, tiktok, facebook, or instagram' });
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

    const queryParams: string[] = [];

    if (twitter) queryParams.push(`twitter=${twitter}`);
    if (linkedin) queryParams.push(`linkedin=${linkedin}`);
    if (tiktok) queryParams.push(`tiktok=${tiktok}`);
    if (facebook) queryParams.push(`facebook=${facebook}`);
    if (instagram) queryParams.push(`instagram=${instagram}`);
    if (req.query.facebookType) queryParams.push(`facebookType=${req.query.facebookType}`);

    const queryString = queryParams.join('&');
    const apiUrl = crossPlatformData;
    if (!apiUrl) {
      res.status(500).json({ message: 'API URL is not defined in .env' });
      return;
    }
    const response = await axios.get(`${apiUrl}?${queryString}&query=${query}`, {
      headers: {
        'x-report-type': 'free',
        'x-report-platform': 'Cross Platform',
        ...(req.query.facebookType && { 'x-facebook-type': req.query.facebookType as string })
      }
    });

    const data = response.data;
    console.log("data passed to report", data)

    if (!data) {
      res.status(404).json({ message: 'No data found for the given query' });
      return;
    }

    const pdfBuffer = await generateFreePdfReport(data);
    const report = new Report({
      name: `${query} - ${new Date().toISOString()}`,
      pdf: pdfBuffer,
      user: userId,
      platform: 'Cross Platform',
      type: 'free',
    });
    await report.save();

    if (!isSpecialUser) {
      user.freeReports += 1;
      await user.save();
    }
      
    res.setHeader('Content-Disposition', 'attachment; filename="paid_sentiment_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);

  } catch (error: any) {
    console.error('Error in generateFreeReport:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    
    // Forward PRIVATE_PROFILE error from internal API to frontend
    if (error.response && error.response.status === 404 && error.response.data?.error === 'PRIVATE_PROFILE') {
      console.log('PRIVATE_PROFILE error from API response detected');
      res.status(404).json({
        message: error.response.data.message,
        error: error.response.data.error
      });
      return;
    }
    
    // Handle direct PRIVATE_PROFILE error
    if (error.message === 'PRIVATE_PROFILE') {
      console.log('Direct PRIVATE_PROFILE error detected');
      res.status(404).json({
        message: 'The profile you are trying to fetch is set to private or has no accessible posts',
        error: 'PRIVATE_PROFILE'
      });
      return;
    }
    
    console.error('Error fetching data or generating PDF:', error);
    res.status(500).json({ message: 'Failed to fetch data or generate PDF' });
  }
};

export const generatePaidReport = async (req: Request, res: Response): Promise<void> => {
  try {
    
    const { twitter, linkedin, tiktok, facebook, instagram, query } = req.query; 

    if (!twitter && !linkedin && !tiktok && !facebook && !instagram) {
      res.status(400).json({ message: 'Missing required query parameters: twitter, linkedin, tiktok, facebook, or instagram' });
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

    const queryParams: string[] = [];

    if (twitter) queryParams.push(`twitter=${twitter}`);
    if (linkedin) queryParams.push(`linkedin=${linkedin}`);
    if (tiktok) queryParams.push(`tiktok=${tiktok}`);
    if (facebook) queryParams.push(`facebook=${facebook}`);
    if (instagram) queryParams.push(`instagram=${instagram}`);
    if (req.query.facebookType) queryParams.push(`facebookType=${req.query.facebookType}`);

    const queryString = queryParams.join('&');
    const apiUrl = crossPlatformData;
    if (!apiUrl) {
      res.status(500).json({ message: 'API URL is not defined in .env' });
      return;
    }

    // Dynamically build the x-report-platform header based on selected platforms
    const selectedPlatforms: string[] = [];
    if (twitter) selectedPlatforms.push('Twitter');
    if (linkedin) selectedPlatforms.push('Linkedin');
    if (tiktok) selectedPlatforms.push('Tiktok');
    if (facebook) selectedPlatforms.push('Facebook');
    if (instagram) selectedPlatforms.push('Instagram');

    const headers = {
      'x-report-type': 'paid',
      'x-report-platform': selectedPlatforms.join(', '),
      ...(req.query.facebookType && { 'x-facebook-type': req.query.facebookType as string })
    };

    const response = await axios.get(`${apiUrl}?${queryString}&query=${query}`, { headers });

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
      platform: 'Cross Platform',
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

  } catch (error: any) {
    console.error('Error in generatePaidReport:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    
    // Forward PRIVATE_PROFILE error from internal API to frontend
    if (error.response && error.response.status === 404 && error.response.data?.error === 'PRIVATE_PROFILE') {
      console.log('PRIVATE_PROFILE error from API response detected');
      res.status(404).json({
        message: error.response.data.message,
        error: error.response.data.error
      });
      return;
    }
    
    // Handle direct PRIVATE_PROFILE error
    if (error.message === 'PRIVATE_PROFILE') {
      console.log('Direct PRIVATE_PROFILE error detected');
      res.status(404).json({
        message: 'The profile you are trying to fetch is set to private or has no accessible posts',
        error: 'PRIVATE_PROFILE'
      });
      return;
    }
    
    console.error('Error fetching data or generating PDF:', error);
    res.status(500).json({ message: 'Failed to fetch data or generate PDF' });
  }
}; 