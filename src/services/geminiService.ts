import {GoogleGenAI, Type} from "@google/genai";
import { ItemCategory, CampusLocation } from "../types";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 10; // Max requests per minute

// Track API requests for rate limiting
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const requestCounts = new Map<string, RateLimitEntry>();

/**
 * Check if the request should be rate limited
 * @param key - Unique identifier (e.g., user ID or IP)
 * @returns true if rate limited, false otherwise
 */
const isRateLimited = (key: string): boolean => {
  const now = Date.now();
  const entry = requestCounts.get(key);
  
  if (!entry || now > entry.resetTime) {
    // Reset or create new rate limit entry
    requestCounts.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    });
    return false;
  }
  
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    // Rate limit exceeded
    return true;
  }
  
  // Increment count
  entry.count++;
  return false;
};

/**
 * Get remaining requests for a key
 */
export const getRemainingRequests = (key: string): number => {
  const now = Date.now();
  const entry = requestCounts.get(key);
  
  if (!entry || now > entry.resetTime) {
    return MAX_REQUESTS_PER_WINDOW;
  }
  
  return Math.max(0, MAX_REQUESTS_PER_WINDOW - entry.count);
};

/**
 * Get rate limit reset time in seconds
 */
export const getRateLimitResetTime = (key: string): number => {
  const now = Date.now();
  const entry = requestCounts.get(key);
  
  if (!entry) {
    return 0;
  }
  
  return Math.max(0, Math.ceil((entry.resetTime - now) / 1000));
};

// Lazy initialization - only create client when needed
let ai: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI | null => {
  if (!API_KEY) {
    return null;
  }
  if (!ai) {
    ai = new GoogleGenAI({apiKey: API_KEY});
  }
  return ai;
};


export interface AIAnalysisResult {
    title: string;
    description: string;
    category: ItemCategory;
    color: string;
    tags: string[];
    location?: CampusLocation;
}

//Analyzes an image of a found item to automatically extract details.
export const analyzeItemImage = async (base64Image: string, userId?: string): Promise<AIAnalysisResult> => {
  // Apply rate limiting using user ID or IP as key
  const rateLimitKey = userId || 'anonymous';
  
  if (isRateLimited(rateLimitKey)) {
    const resetIn = getRateLimitResetTime(rateLimitKey);
    console.warn(`Rate limit exceeded. Try again in ${resetIn} seconds.`);
    return {
        title: "Unknown Item",
        description: `Rate limit exceeded. Please wait ${resetIn} seconds before trying again.`,
        category: ItemCategory.OTHER,
        color: "Unknown",
        tags: []
    };
  }
  
  const aiClient = getAI();
  if (!aiClient) {
    console.warn("No API Key provided for Gemini. AI features disabled.");
    return {
        title: "Unknown Item",
        description: "AI analysis disabled - no API key configured",
        category: ItemCategory.OTHER,
        color: "Unknown",
        tags: []
    };
  }

  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  try {
    const response = await aiClient.models.generateContent({

        model: 'gemini-3-flash-preview',
        contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text: `Analyze this image of a lost/found item. 
            Return a JSON object with the following fields:
            - title: A short, clear title (e.g., "Blue Hydroflask").
            - description: A brief description of visual features (scratches, stickers, brand).
            - category: One of [${Object.values(ItemCategory).join(', ')}].
            - color: The dominant color.
            - tags: An array of 3-5 keywords.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING, enum: Object.values(ItemCategory) },
            color: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    });

    if (response.text){
        return JSON.parse(response.text) as AIAnalysisResult;
    }
    throw new Error("No text response from Gemini");
  } catch (error) {
    console.error("Error analyzing image with Gemini:", error);
    return{
        title: "Unknown Item",
        description: "Could not analyze image",
        category: ItemCategory.OTHER,
        color: "Unknown",
        tags: []
    };
  }
};

//Smart search/matching with rate limiting

export const findSmartMatches = async (query: string, itemsJson: string, userId?: string) => {
  // Apply rate limiting
  const rateLimitKey = userId || 'anonymous';
  
  if (isRateLimited(rateLimitKey)) {
    console.warn(`Rate limit exceeded for user ${rateLimitKey}. Try again later.`);
    return [];
  }
  
  const aiClient = getAI();
  if (!aiClient) {
    console.warn("No API Key provided for Gemini. Smart search disabled.");
    return [];
  }


  try {
    const response = await aiClient.models.generateContent({

      model: 'gemini-3-flash-preview',
      contents: `
        I have a search query from a user looking for a lost item: "${query}".
        Here is a list of items currently in the database:
        ${itemsJson}
        
        Return a JSON array of IDs of the items that are likely matches, ranked by relevance.
        Only return the array of strings (IDs).
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    
    if (response.text) {
      return JSON.parse(response.text) as string[];
    }
    return [];
  } catch (e) {
    console.error(e);
    return [];
  }
};
