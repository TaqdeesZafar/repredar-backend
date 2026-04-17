import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { getCompetitors } from './getCompetitors'; 

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface PaidSentimentAnalysis {
  rating: number;
  sentiment: string;
  reasoning: string;
  tips_on_improving: string;
}

interface CompetitorsSentimentAnalysis {
  name: string;
  rating: number;
  sentiment: string;
  reasoning: string;
  key_positives: string[];
}

/**
 * Extracts JSON content from a Markdown block.
 * @param markdown - The Markdown string containing a JSON block.
 * @returns The extracted JSON string.
 */
const extractJsonFromMarkdown = (markdown: string): string => {
  console.log("Raw Markdown:", markdown); 
  const match = markdown.match(/```json\s*([\s\S]*?)\s*```/);
  
  if (match && match[1]) {
    const cleanedJson = match[1].trim();
    console.log("Extracted JSON:", cleanedJson);
    return cleanedJson;
  }
  
  console.error('No valid JSON block found!');
  return ''; 
};


/**
 * Analyzes and combines data for paid reports, including competitor sentiment analysis.
 * @param combinedData - The combined text data to analyze.
 * @param name - The name of the entity being analyzed.
 * @param platform - The platform (e.g., Twitter) to analyze competitors on.
 * @returns An object containing the analysis results.
 */
export const analyzeAndCombinePaidData = async (
  combinedData: any,
  name: string,
  platform: string
): Promise<any> => {
  try {
    console.log(combinedData)
    const competitorsData = await getCompetitors(name, platform);
    const competitors = competitorsData.competitors;

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini-2024-07-18',
      messages: [
        {
          role: 'system',
          content:
            `You are an AI Reputation Strategist. You will receive:

- A labeled profile type: "personal" or "company."  
- Raw text data (posts, comments, reactions, etc.) from one or more platforms (e.g. X, Facebook, LinkedIn, TikTok).  
- Optional: competitor handles/profiles (zero or more).

1. *Identify Profile*  
   - Confirm if the target is a "personal" profile or a "company" page.

2. *Overall Analysis*  
   - Compute overall sentiment (positive/neutral/negative) and score (1–10).  
   - List *6* *Key Positives* (strengths).  
   - List *6* *Key Negatives* (areas to improve).


3. *Monthly Sentiment Trends*  
   - Return an array of the last 12 months, each with { "month": "YYYY-MM", "score": 1–10 }.

4. *Per-Platform Reports*  
   For each platform present (or the single one if only one):
   - "sentiment": positive/neutral/negative  
   - "score": 1–10  
   - "positives": up to 3 bullets  
   - "negatives": up to 3 bullets

5. *Action Plan*  
   For each phase—*30-day, **60-day, **90-day*—provide:
   - "objective": one-sentence goal  
   - "points": 3–5 bullet actions  
   - In each bullet, point out where they're currently lacking, then "how we can help" (mention our core services only as needed).

   Our core services (mention only when relevant to fill a gap):  
   • Reputation Management  
   • Review Management  
   • Crisis Consultation  
   • SEO & Content Suppression  
   • Autocomplete/Autosuggest Optimization  
   • Press Release Syndication

6. *Output Schema*  
   Return exactly one JSON object, with keys:

{
  "profile_type": "<personal|company>",
  "overall": {
    "sentiment": "<positive|neutral|negative>",
    "score": <1–10>,
    "key_positives": ["…","…",…],
    "key_negatives": ["…","…",…]
  },
  "monthly_trends": [
    { "month": "2024-06", "score": 7 },
    … up to 12 entries …
  ],
  "platform_reports": {
    "<platform_name>": {
      "sentiment": "<positive|neutral|negative>",
      "score": <1–10>,
      "positives": ["…",…],
      "negatives": ["…",…]
    }
  },
  "action_plan": {
    "30_days": {
      "objective": "…",
      "points": ["…","…",…]
    },
    "60_days": {
      "objective": "…",
      "points": ["…","…",…]
    },
    "90_days": {
      "objective": "…",
      "points": ["…","…",…]
    }
  }
}`
        },
        {
          role: 'user',
          content: combinedData,
        },
      ],
      temperature: 1,
      top_p: 1,
    });

    let jsonResponse = openaiResponse.choices[0].message.content;
    if (!jsonResponse) throw new Error('Empty response from OpenAI API');
    jsonResponse = jsonResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');


    if (typeof jsonResponse !== 'string') {
      throw new Error('Invalid response format from OpenAI API');
    }

    const structuredAnalysis: PaidSentimentAnalysis = JSON.parse(jsonResponse);

    const competitorsSentimentAnalysis: CompetitorsSentimentAnalysis[] = [];
    for (const competitor of competitors) {
      const competitorResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          {
            role: 'system',
            content:
              `
              You will be provided with the name of a competitor. Your task is to analyze the sentiment around this competitor on the platform: ${platform}.
              Classify the overall sentiment as positive, neutral, or negative, and rate the sentiment on a scale of 1 to 10. 
              *Competitor Benchmarking*  
              For each competitor provided:
              Provide reasoning for the sentiment, and compare this competitor's sentiment with the main brand's sentiment over the same period.
              Return the response as a JSON object with the following keys:
              - "name_of_competitor" (name of the competitor)
              - "rating" (sentiment rating)
              - "sentiment" (overall sentiment)
              - "reasoning" (detailed reasoning for the sentiment)
              - "key_positives" (array of 5 key positive aspects)
              - "comparison_with_brand" (comparison of the competitor's sentiment with the main brand)
            `
            },
          {
            role: 'user',
            content: competitor,
          },
        ],
        temperature: 1,
        top_p: 1,
      });
      
      let competitorJsonResponse = competitorResponse.choices[0].message.content;
      if (!competitorJsonResponse) throw new Error('Empty response from OpenAI API');
      competitorJsonResponse = competitorJsonResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  

      if (typeof competitorJsonResponse !== 'string') {
        throw new Error('Invalid response format from OpenAI API for competitor analysis');
      }

      const competitorAnalysis: CompetitorsSentimentAnalysis = {
        name: competitor,
        ...JSON.parse(competitorJsonResponse),
      };

      competitorsSentimentAnalysis.push(competitorAnalysis);
    }

    return {
      competitors: competitors,
      sentimentAnalysis: structuredAnalysis,
      competitorsSentimentAnalysis: competitorsSentimentAnalysis,
      platform: platform, 
      brand : name,

    };
  } catch (error) {
    console.error('Error analyzing tweets and combining data:', error);
    throw new Error('Failed to analyze tweets and combine data');
  }
};


export const analyzeAndCombinePaidCrossPlatformData = async (
  combinedData: any,
  name: string,
  platform: string
): Promise<any> => {
  try {
    const competitorsData = await getCompetitors(name, platform);
    const competitors = competitorsData.competitors;

    let combinedContent = '';


    for (const platform in combinedData) {
      const platformData = combinedData[platform];
      combinedContent += platformData + ' ';
    }

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini-2024-07-18',
      messages: [
        {
          role: 'system',
          content:
            `You are an AI Reputation Strategist. You will receive:

- A labeled profile type: "personal" or "company."  
- Raw text data (posts, comments, reactions, etc.) from one or more platforms (e.g. X, Facebook, LinkedIn, TikTok).  
- Optional: competitor handles/profiles (zero or more).

1. *Identify Profile*  
   - Confirm if the target is a "personal" profile or a "company" page.

2. *Overall Analysis*  
   - Compute overall sentiment (positive/neutral/negative) and score (1–10).  
   - List *6* *Key Positives* (strengths).  
   - List *6* *Key Negatives* (areas to improve).


3. *Monthly Sentiment Trends*  
   - Return an array of the last 12 months, each with { "month": "YYYY-MM", "score": 1–10 }.

4. *Per-Platform Reports*  
   For each platform present (or the single one if only one):
   - "sentiment": positive/neutral/negative  
   - "score": 1–10  
   - "positives": up to 3 bullets  
   - "negatives": up to 3 bullets

5. *Action Plan*  
   For each phase—*30-day, **60-day, **90-day*—provide:
   - "objective": one-sentence goal  
   - "points": 3–5 bullet actions  
   - In each bullet, point out where they're currently lacking, then "how we can help" (mention our core services only as needed).

   Our core services (mention only when relevant to fill a gap):  
   • Reputation Management  
   • Review Management  
   • Crisis Consultation  
   • SEO & Content Suppression  
   • Autocomplete/Autosuggest Optimization  
   • Press Release Syndication

7. *Output Schema*  
   Return exactly one JSON object, with keys:

{
  "profile_type": "<personal|company>",
  "overall": {
    "sentiment": "<positive|neutral|negative>",
    "score": <1–10>,
    "key_positives": ["…","…",…],
    "key_negatives": ["…","…",…]
  },
  "monthly_trends": [
    { "month": "2024-06", "score": 7 },
    … up to 12 entries …
  ],
  "platform_reports": {
    "<platform_name>": {
      "sentiment": "<positive|neutral|negative>",
      "score": <1–10>,
      "positives": ["…",…],
      "negatives": ["…",…]
    }
  },
  "action_plan": {
    "30_days": {
      "objective": "…",
      "points": ["…","…",…]
    },
    "60_days": {
      "objective": "…",
      "points": ["…","…",…]
    },
    "90_days": {
      "objective": "…",
      "points": ["…","…",…]
    }
  }
}`
        },
        {
          role: 'user',
          content: combinedContent,
        },
      ],
      temperature: 1,
      top_p: 1,
    });

    let jsonResponse = openaiResponse.choices[0].message.content;
    if (!jsonResponse) throw new Error('Empty response from OpenAI API');
    jsonResponse = jsonResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');

    if (typeof jsonResponse === 'string') {
      const structuredAnalysis: PaidSentimentAnalysis = JSON.parse(jsonResponse);

      const competitorsSentimentAnalysis: CompetitorsSentimentAnalysis[] = [];
      for (const competitor of competitors) {
        const competitorResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini-2024-07-18',
          messages: [
            {
              role: 'system',
              content:
                `
                You will be provided with the name of a competitor. Your task is to analyze the sentiment around this competitor on the platform: ${platform}.
                Classify the overall sentiment as positive, neutral, or negative, and rate the sentiment on a scale of 1 to 10. 
                Provide reasoning for the sentiment, and compare this competitor's sentiment with the main brand's sentiment over the same period.
                Return the response as a JSON object with the following keys:
                - "name_of_competitor" (name of the competitor)
                - "rating" (sentiment rating)
                - "sentiment" (overall sentiment)
                - "reasoning" (detailed reasoning for the sentiment)
                - "key_positives" (array of 5 key positive aspects)
                - "comparison_with_brand" (comparison of the competitor's sentiment with the main brand)
              `
              },
            {
              role: 'user',
              content: competitor,
            },
          ],
          temperature: 1,
          top_p: 1,
        });

        let competitorJsonResponse = competitorResponse.choices[0].message.content;
        if (!competitorJsonResponse) throw new Error('Empty response from OpenAI API');
        competitorJsonResponse = competitorJsonResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');

        if (typeof competitorJsonResponse !== 'string') {
          throw new Error('Invalid response format from OpenAI API for competitor analysis');
        }

        const competitorAnalysis: CompetitorsSentimentAnalysis = {
          name: competitor,
          ...JSON.parse(competitorJsonResponse),
        };

        competitorsSentimentAnalysis.push(competitorAnalysis);
      }

      return {
        competitors: competitors,
        sentimentAnalysis: structuredAnalysis,
        competitorsSentimentAnalysis: competitorsSentimentAnalysis,
        platform: platform,
        brand : name,
      };
    } else {
      throw new Error('Invalid response format from OpenAI API');
    }
  } catch (error) {
    console.error('Error analyzing tweets and combining data:', error);
    throw new Error('Failed to analyze tweets and combine data');
  }
};
