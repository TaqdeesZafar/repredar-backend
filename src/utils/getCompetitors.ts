import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

export const getCompetitors = async (name: string, platform: string): Promise<{ competitors: string[] }> => {
  try {
    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You will be provided with a username/handle from ${platform} and the platform name. Your task is to identify the person or brand behind this ${platform} account and list ONLY the top 3 competitors in the same field or industry. Respond ONLY with a plain, numbered list of the 3 competitor names, with no extra text, no headers, and no scores. If the username doesn't correspond to a well-known person or brand, respond with "brand / person not well known enough". Consider that usernames may be different from actual names (e.g., @ahormozi is Alex Hormozi on Instagram).`,
        },
        {
          role: 'user',
          content: `Platform: ${platform}\nUsername: ${name}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 100,
      top_p: 1,
    });

    const competitorsText = openaiResponse.choices[0].message.content;

    if (!competitorsText) {
      throw new Error('No competitor information returned.');
    }

    // If the model returns the fallback string, handle it
    if (competitorsText.trim().toLowerCase().includes('not well known')) {
      return { competitors: ["brand / person not well known enough"] };
    }

    const competitors = competitorsText
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean);
    return {
      competitors: competitors.slice(0, 3),
    };
  } catch (error) {
    console.error('Error fetching competitors from OpenAI API:', error);
    throw new Error('Failed to fetch competitors');
  }
};
