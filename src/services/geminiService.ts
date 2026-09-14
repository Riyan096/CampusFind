import { httpsCallable } from "firebase/functions";
import { ItemCategory } from "../types";
import { functions } from "./firebase";

export interface AIAnalysisResult {
  title: string;
  description: string;
  category: ItemCategory;
  color: string;
  tags: string[];
  location?: string;
}

const analyzeImageCallable = httpsCallable<
  { imageBase64: string; mimeType?: string },
  AIAnalysisResult
>(functions, "analyzeItemImage");

const smartMatchesCallable = httpsCallable<
  { query: string; itemsJson: string },
  string[]
>(functions, "findSmartMatches");

/**
 * Analyze an item image through the authenticated Cloud Function.
 * The Gemini credential never reaches the browser.
 */
export const analyzeItemImage = async (
  base64Image: string,
  _userId?: string
): Promise<AIAnalysisResult> => {
  const mimeMatch = base64Image.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,/i);
  const mimeType = mimeMatch?.[1]?.toLowerCase() === "image/jpg"
    ? "image/jpeg"
    : mimeMatch?.[1]?.toLowerCase();

  const cleanBase64 = base64Image.replace(/^data:image\/(?:png|jpeg|jpg|webp);base64,/i, "");

  try {
    const response = await analyzeImageCallable({
      imageBase64: cleanBase64,
      ...(mimeType ? { mimeType } : {})
    });
    return response.data;
  } catch (error) {
    console.error("Error analyzing image with Gemini:", error);
    return {
      title: "Unknown Item",
      description: "Could not analyze image",
      category: ItemCategory.OTHER,
      color: "Unknown",
      tags: []
    };
  }
};

/**
 * Find likely item matches through the authenticated Cloud Function.
 * The server validates the candidate IDs returned by Gemini.
 */
export const findSmartMatches = async (
  query: string,
  itemsJson: string,
  _userId?: string
): Promise<string[]> => {
  try {
    const response = await smartMatchesCallable({ query, itemsJson });
    return response.data;
  } catch (error) {
    console.error("Error finding smart matches with Gemini:", error);
    return [];
  }
};

export const getRemainingRequests = (_key: string): number => 0;
export const getRateLimitResetTime = (_key: string): number => 0;
