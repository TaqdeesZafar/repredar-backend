import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { generatePaidPdfReport } from '../utils/generatePdfReport';
import { analyzeAndCombinePaidData } from '../utils/getPaidReport';
import { triggerGHLWorkflowSilent } from '../utils/emailUtils';
import { saveReportAndGetUrl } from '../utils/saveReport';


dotenv.config();

  const tiktokHeaders = {
    'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPID_API_KEY,
  };

  const tiktokSearchApiUrl = process.env.TIKTOK_SEARCH_API_URL;
  const tiktokPostsIdsApiUrl = process.env.TIKTOK_POSTS_IDS_API_URL;
  const tiktokPostRepliesApiUrl = process.env.TIKTOK_POST_REPLIES_API_URL;


export const fetchUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { query } = req.query;

        if (!query) {
            res.status(400).json({ message: 'Missing required query parameters: keyword or cursor' });
            return;
        }

        if (!tiktokSearchApiUrl) {
            res.status(500).json({ message: 'API URLs for Tiktok are not defined in .env' });
            return;
        }

        const keyword = query.toString().replace(/^@/, '');

        // Direct username lookup + keyword search in parallel
        const userInfoUrl = 'https://tiktok-api23.p.rapidapi.com/api/user/info';
        const [searchResponse, userInfoResponse] = await Promise.allSettled([
          axios.get(tiktokSearchApiUrl, {
            headers: tiktokHeaders,
            params: { keyword, cursor: 0, search_id: 0 },
          }),
          axios.get(userInfoUrl, {
            headers: tiktokHeaders,
            params: { uniqueId: keyword },
          }),
        ]);

        const rawSearchUsers: any[] =
          searchResponse.status === 'fulfilled'
            ? searchResponse.value.data?.user_list || []
            : [];

        // Debug: log raw user_info fields to find the verified field name
        if (rawSearchUsers.length > 0) {
          console.log('[TikTok search] first user_info keys:', Object.keys(rawSearchUsers[0]?.user_info || {}));
          console.log('[TikTok search] first user_info verified fields:', {
            verified: rawSearchUsers[0]?.user_info?.verified,
            custom_verify: rawSearchUsers[0]?.user_info?.custom_verify,
            enterprise_verify_reason: rawSearchUsers[0]?.user_info?.enterprise_verify_reason,
          });
        }

        // Normalize verified field from search results (API may use verified, custom_verify, etc.)
        const searchUsers = rawSearchUsers.map((item: any) => {
          const ui = item?.user_info || {};
          const isVerified = !!(ui.verified || ui.custom_verify || ui.enterprise_verify_reason);
          return { ...item, user_info: { ...ui, verified: isVerified } };
        });

        // If direct lookup succeeded, map camelCase fields to search-result snake_case shape
        let directUser: any = null;
        if (userInfoResponse.status === 'fulfilled') {
          const u = userInfoResponse.value.data?.userInfo?.user;
          const s = userInfoResponse.value.data?.userInfo?.stats;
          if (u?.secUid) {
            const isVerified = !!(u.verified || u.customVerify || u.enterpriseVerifyReason);
            directUser = {
              user_info: {
                nickname: u.nickname,
                unique_id: u.uniqueId,
                sec_uid: u.secUid,
                avatar_thumb: { url_list: [u.avatarThumb || u.avatarMedium || u.avatarLarger || ''] },
                follower_count: s?.followerCount || 0,
                signature: u.signature || '',
                verified: isVerified,
              },
            };
          }
        }

        // Dedupe: remove from search list if it matches the direct result
        const deduped = directUser
          ? searchUsers.filter(
              (u: any) => u?.user_info?.sec_uid !== directUser.user_info.sec_uid
            )
          : searchUsers;

        const tiktokUsers = directUser ? [directUser, ...deduped] : deduped;

        res.json({ tiktokUsers });

    } catch (error: any) {
        const errDetail = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown error';
      console.error('Error fetching data from external APIs:', errDetail);
      res.status(500).json({ message: 'Failed to fetch data from external APIs: ' + errDetail });
    }
};

export const fetchPostsById = async (secUid: string) => {
  try {
    const tiktokParams = {
        secUid: secUid,
        count: 5,
        cursor : 0
    };

    if (!tiktokPostsIdsApiUrl) {
      return;
    }

    const tiktokResponse = await axios.get(tiktokPostsIdsApiUrl, {
      headers: tiktokHeaders,
      params: tiktokParams,
    });

    if (!tiktokResponse.data || !tiktokResponse.data.data || !Array.isArray(tiktokResponse.data.data.itemList)) {
      console.error('Unexpected API response format:', tiktokResponse.data);
      return [];
    }

    const postIds = tiktokResponse.data.data.itemList.map((posts: any) => posts.id);

    return postIds; 

  } catch (error) {
    console.error('Error fetching Posts by ID:', error);
    throw new Error('Failed to fetch Tiktok Posts by ID');
  }
};

export const fetchPostsReplies = async (postIds: string[]) => {
  if (!tiktokPostRepliesApiUrl || !postIds?.length) return '';
  let allReplies: string[] = [];

  for (const postId of postIds) {
    try {
      const tiktokResponse = await axios.get(tiktokPostRepliesApiUrl, {
        headers: tiktokHeaders,
        params: { videoId: postId, count: 50, cursor: 0 },
      });
      const comments = tiktokResponse?.data?.comments || tiktokResponse?.data?.data?.comments || [];
      const texts = comments.map((c: any) => c.text || c.comment_text || '').filter(Boolean);
      allReplies = [...allReplies, ...texts];
    } catch {
      // skip posts with no accessible comments
    }
  }

  return allReplies.join(' ');
};

export const fetchAndAnalyzePosts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { secUid, query } = req.query;
  
      if (!secUid || !query) {
        res.status(400).json({ message: 'Missing required query parameter: secUid / query' });
        return;
      }
      const platform = req.headers['x-report-platform'] as string;

      const postIds = await fetchPostsById(secUid.toString());
      const postReplies = await fetchPostsReplies(postIds);

      const Result = await analyzeAndCombinePaidData(postReplies, query.toString(), platform || 'TikTok');

      res.json(Result);  
    } catch (error: any) {
      const errDetail = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown error';
      console.error('Error fetching data from external APIs:', errDetail);
      res.status(500).json({ message: 'Failed to fetch data from external APIs: ' + errDetail });
    }
  };

export const generateReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { secUid, query } = req.query;

    if (!secUid || !query) {
      res.status(400).json({ message: 'Missing required query parameter: secUid or query' });
      return;
    }

    const postIds = (await fetchPostsById(secUid.toString())) || [];
    const postReplies = (await fetchPostsReplies(postIds as string[])) || '';
    const data = await analyzeAndCombinePaidData(postReplies, query.toString(), 'TikTok');

    if (!data) {
      res.status(404).json({ message: 'No data found for the given query' });
      return;
    }

    const pdfBuffer = await generatePaidPdfReport(data);
    const reportUrl = await saveReportAndGetUrl(pdfBuffer, `${query} - ${new Date().toISOString()}`, 'TikTok');

    const userEmail = (req.query.email as string) || "";
    triggerGHLWorkflowSilent(userEmail, query.toString(), 'TikTok', reportUrl || undefined);

    res.setHeader('Content-Disposition', 'attachment; filename="reputation_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);

  } catch (error: any) {
    console.error('Error fetching data or generating PDF:', error);
    res.status(500).json({ message: error?.message || 'Failed to generate PDF' });
  }
};

  