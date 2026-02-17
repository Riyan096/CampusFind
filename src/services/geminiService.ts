import {GoogleGenAI, Type} from "@google/genai";
import { ItemCategory, CampusLocation } from "../types";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error('VITE_GEMINI_API_KEY environment variable is not set');
}

const ai = new GoogleGenAI({apiKey: API_KEY});

export interface AIAnalysisResult {
    title: string;
    description: string;
    category: ItemCategory;
    color: string;
    tags: string[];
    location?: CampusLocation;
}

//Analyzes an image of a found item to automatically extract details.
export const analyzeItemImage = async (base64Image: string): Promise<AIAnalysisResult> => {
  if (!API_KEY) {
    console.warn("No API Key provided for Gemini.");
    throw new Error("API Key missing");
  }


  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  try {
    const response = await ai.models.generateContent({
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

//Smart search/matching

export const findSmartMatches = async (query: string, itemsJson: string) => {
  if (!API_KEY) return [];


  try {
    const response = await ai.models.generateContent({
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
