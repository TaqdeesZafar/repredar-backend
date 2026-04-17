import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { getCompetitors } from './getCompetitors'; 

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

interface SentimentAnalysis {
  rating: number;
  sentiment: string;
  reasoning: string;
}

export const analyzeAndCombineData = async (combinedData: any, name: string, platform: string): Promise<any> => {
  try {
    const competitorsData = await getCompetitors(name, platform);
    const competitors = competitorsData.competitors;

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini-2024-07-18',
      messages: [
        {
          role: 'system',
          content:
            `You are an AI Reputation Analyst. You will be given a dataset of social media posts, comments, reactions, and/or messages collected from one or more platforms (e.g. X, Facebook, LinkedIn, TikTok).

1. *Per-Platform Analysis*  
   - Detect which platform(s) are present.  
   - For each platform that has data, compute:
     - *Overall Sentiment*: classify as "positive", "neutral", or "negative."  
     - *Sentiment Score*: rate from 1 (most negative) to 10 (most positive).  
     - *Key Positives*: list up to 3 bullet points describing what's working well.  
     - *Key Negatives*: list up to 3 bullet points describing areas of concern.

2. *Aggregate Insight*  
   - If data spans multiple platforms, provide an overall sentiment and score (average of the platform scores, rounded).  
   - If data is from only one platform, skip aggregation.

3. *Action Plan (30-Day Campaign)*  
   - For this free snapshot, suggest *3* quick-win actions.  
   - Where relevant, reference these service areas (include "use our services"):
     1. Reputation Management  
     2. Content Suppression  
     3. Review Management  
     4. Crisis Management Consultation  
     5. Reputation Management + Content Suppression Combo  
     6. Google & Bing Autocomplete/Autosuggest  
     7. Off-site SEO  
     8. DMCA Takedown Request  
     9. Google "People Also Ask" (PAA)  
     10. Google "People Also Search" (PAS)  
     11. Google Image Search Optimization  
     12. Press Release Syndication

4. *Output Format*  
   Return exactly one JSON object with keys:
   {
     "platforms": {
       "<platform_name>": {
         "sentiment": "<positive|neutral|negative>",
         "score": <1–10>,
         "key_positives": ["…", "…"],
         "key_negatives": ["…", "…"]
       }
     },
     "aggregate_sentiment": {
       "sentiment": "<positive|neutral|negative>",
       "score": <1–10>
     },
     "action_plan": {
       "30_days": {
         "objective": "Quick-win reputation improvements",
         "points": [
           "…",
           "…",
           "…"
         ]
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
    
    
    jsonResponse = jsonResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    
   
    try {
      const parsedResponse = JSON.parse(jsonResponse);
      
      // Validate the new JSON structure
      if (!parsedResponse.platforms || !parsedResponse.action_plan) {
        throw new Error('Missing required fields in OpenAI response');
      }

      // Validate platform data structure
      let totalScore = 0;
      let platformCount = 0;
      for (const platform in parsedResponse.platforms) {
        const platformData = parsedResponse.platforms[platform];
        if (!platformData.sentiment || !platformData.score || !platformData.key_positives || !platformData.key_negatives) {
          throw new Error('Invalid platform data structure in OpenAI response');
        }
        totalScore += platformData.score;
        platformCount++;
      }

      // Calculate aggregate sentiment if not provided
      if (!parsedResponse.aggregate_sentiment) {
        const averageScore = Math.round(totalScore / platformCount);
        let aggregateSentiment = 'neutral';
        if (averageScore >= 7) aggregateSentiment = 'positive';
        else if (averageScore <= 3) aggregateSentiment = 'negative';

        parsedResponse.aggregate_sentiment = {
          sentiment: aggregateSentiment,
          score: averageScore
        };
      } else {
        // Validate aggregate sentiment if provided
        if (!parsedResponse.aggregate_sentiment.sentiment || !parsedResponse.aggregate_sentiment.score) {
          throw new Error('Invalid aggregate sentiment structure in OpenAI response');
        }
      }

      // Validate action plan
      if (!parsedResponse.action_plan['30_days'] || !parsedResponse.action_plan['30_days'].points) {
        throw new Error('Invalid action plan structure in OpenAI response');
      }
      
      return {
        competitors: competitors,
        sentimentAnalysis: parsedResponse,
      };
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.error('Raw response:', jsonResponse);
      throw new Error('Invalid JSON response from OpenAI API');
    }
  } catch (error) {
    console.error('Error analyzing tweets and combining data:', error);
    throw new Error('Failed to analyze tweets and combine data');
  }
};


export const analyzeAndCombineCrossPlatformData = async (combinedData: any, name: string, platform: string): Promise<any> => {
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
            'You will be provided with a collection of posts from various platforms like Twitter, LinkedIn, TikTok, and Facebook. Your task is to classify the overall sentiment as positive, neutral, or negative. Rate the sentiment on a scale of 1 to 10, with 10 being the most positive and 1 being the most negative. Additionally, provide a collective explanation of the sentiment expressed in the posts, highlight the reasons that contribute to the overall sentiment, and mention if the user engagement is low based on the amount of content (less than 200-500 words). Return the response as a JSON object with the following keys: "rating", "sentiment", and "reasoning".',
        },
        {
          role: 'user',
          content: combinedContent,
        },
      ],
      temperature: 1,
      max_tokens: 256,
      top_p: 1,
    });

    let jsonResponse = openaiResponse.choices[0].message.content;
    if (!jsonResponse) throw new Error('Empty response from OpenAI API');
    jsonResponse = jsonResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');

    if (typeof jsonResponse === 'string') {
      const structuredAnalysis: SentimentAnalysis = JSON.parse(jsonResponse);

      return {
        competitors: competitors,
        sentimentAnalysis: structuredAnalysis,
      };
    } else {
      throw new Error('Invalid response format from OpenAI API');
    }
  } catch (error) {
    console.error('Error analyzing cross-platform data:', error);
    throw new Error('Failed to analyze cross-platform data');
  }
};
