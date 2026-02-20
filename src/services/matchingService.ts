import { findSmartMatches } from './geminiService';
import { getItemsByType } from './itemService';
import { ItemType, LostItemStatus, FoundItemStatus, type Item } from '../types';

export interface MatchResult {
  lostItem: Item;
  foundItem: Item;
  confidence: 'high' | 'medium' | 'low';
  score: number; // 0-100
  reasons: string[];
}

/**
 * Find potential matches for a lost item among available found items
 */
export const findMatchesForLostItem = async (lostItem: Item): Promise<MatchResult[]> => {
  if (lostItem.type !== ItemType.LOST) {
    throw new Error('Item must be a lost item');
  }

  // Get all available found items
  const foundItems = await getItemsByType(ItemType.FOUND);
  const availableFoundItems = foundItems.filter(
    item => item.status === FoundItemStatus.AVAILABLE
  );

  if (availableFoundItems.length === 0) {
    return [];
  }

  // Prepare items for AI matching
  const itemsForMatching = availableFoundItems.map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    location: item.location,
    tags: item.aiTags || [],
    date: item.date
  }));

  // Create search query from lost item details
  const searchQuery = `
    Lost: ${lostItem.title}
    Description: ${lostItem.description}
    Category: ${lostItem.category}
    Location: ${lostItem.location}
    Tags: ${(lostItem.aiTags || []).join(', ')}
  `.trim();

  try {
    // Use AI to find matches
    const matchedIds = await findSmartMatches(
      searchQuery,
      JSON.stringify(itemsForMatching)
    );

    if (!matchedIds || matchedIds.length === 0) {
      return [];
    }

    // Create match results with confidence levels
    const matches: MatchResult[] = matchedIds
      .map((id, index) => {
        const foundItem = availableFoundItems.find(i => i.id === id);
        if (!foundItem) return null;

        // Calculate confidence based on position and additional factors
        const baseScore = Math.max(30, 100 - (index * 15)); // 100, 85, 70, 55, 40...
        const { score, reasons } = calculateMatchScore(lostItem, foundItem, baseScore);
        
        const confidence: 'high' | 'medium' | 'low' = 
          score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';

        return {
          lostItem,
          foundItem,
          confidence,
          score,
          reasons
        };
      })
      .filter((m): m is MatchResult => m !== null)
      .sort((a, b) => b.score - a.score); // Sort by score descending

    return matches;
  } catch (error) {
    console.error('Error finding matches:', error);
    return [];
  }
};

/**
 * Find potential matches for a found item among open lost items
 */
export const findMatchesForFoundItem = async (foundItem: Item): Promise<MatchResult[]> => {
  if (foundItem.type !== ItemType.FOUND) {
    throw new Error('Item must be a found item');
  }

  // Get all open lost items
  const lostItems = await getItemsByType(ItemType.LOST);
  const openLostItems = lostItems.filter(
    item => item.status === LostItemStatus.STILL_LOST
  );

  if (openLostItems.length === 0) {
    return [];
  }

  // Prepare items for AI matching
  const itemsForMatching = openLostItems.map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    location: item.location,
    tags: item.aiTags || [],
    date: item.date
  }));

  // Create search query from found item details
  const searchQuery = `
    Found: ${foundItem.title}
    Description: ${foundItem.description}
    Category: ${foundItem.category}
    Location: ${foundItem.location}
    Tags: ${(foundItem.aiTags || []).join(', ')}
  `.trim();

  try {
    // Use AI to find matches
    const matchedIds = await findSmartMatches(
      searchQuery,
      JSON.stringify(itemsForMatching)
    );

    if (!matchedIds || matchedIds.length === 0) {
      return [];
    }

    // Create match results with confidence levels
    const matches: MatchResult[] = matchedIds
      .map((id, index) => {
        const lostItem = openLostItems.find(i => i.id === id);
        if (!lostItem) return null;

        // Calculate confidence based on position and additional factors
        const baseScore = Math.max(30, 100 - (index * 15));
        const { score, reasons } = calculateMatchScore(lostItem, foundItem, baseScore);
        
        const confidence: 'high' | 'medium' | 'low' = 
          score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';

        return {
          lostItem,
          foundItem,
          confidence,
          score,
          reasons
        };
      })
      .filter((m): m is MatchResult => m !== null)
      .sort((a, b) => b.score - a.score);

    return matches;
  } catch (error) {
    console.error('Error finding matches:', error);
    return [];
  }
};

/**
 * Calculate a detailed match score with reasons
 */
const calculateMatchScore = (
  lostItem: Item,
  foundItem: Item,
  baseScore: number
): { score: number; reasons: string[] } => {
  let score = baseScore;
  const reasons: string[] = [];

  // Category match (high importance)
  if (lostItem.category === foundItem.category) {
    score += 10;
    reasons.push('Same category');
  }

  // Location proximity (medium importance)
  if (lostItem.location === foundItem.location) {
    score += 8;
    reasons.push('Same location');
  }

  // Date proximity (medium importance) - items lost/found within 3 days
  const lostDate = new Date(lostItem.date);
  const foundDate = new Date(foundItem.date);
  const daysDiff = Math.abs(
    (foundDate.getTime() - lostDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysDiff <= 1) {
    score += 7;
    reasons.push('Same day');
  } else if (daysDiff <= 3) {
    score += 4;
    reasons.push('Within 3 days');
  }

  // Tag overlap (medium importance)
  const lostTags = new Set(lostItem.aiTags || []);
  const foundTags = foundItem.aiTags || [];
  const matchingTags = foundTags.filter(tag => lostTags.has(tag));
  
  if (matchingTags.length >= 3) {
    score += 6;
    reasons.push(`${matchingTags.length} matching tags`);
  } else if (matchingTags.length >= 1) {
    score += 3;
    reasons.push(`${matchingTags.length} matching tag(s)`);
  }

  // Cap score at 100
  score = Math.min(100, score);

  return { score, reasons };
};

/**
 * Get all high-confidence matches across the system
 * Useful for admin dashboard or notifications
 */
export const getAllHighConfidenceMatches = async (): Promise<MatchResult[]> => {
  const lostItems = await getItemsByType(ItemType.LOST);
  const openLostItems = lostItems.filter(
    item => item.status === LostItemStatus.STILL_LOST
  );

  const allMatches: MatchResult[] = [];

  for (const lostItem of openLostItems) {
    const matches = await findMatchesForLostItem(lostItem);
    allMatches.push(...matches.filter(m => m.confidence === 'high'));
  }

  // Remove duplicates and sort by score
  const uniqueMatches = Array.from(
    new Map(allMatches.map(m => [`${m.lostItem.id}-${m.foundItem.id}`, m])).values()
  );

  return uniqueMatches.sort((a, b) => b.score - a.score);
};

/**
 * Check if a new item should trigger match notifications
 */
export const checkForMatchesAndNotify = async (
  newItem: Item,
  onMatchFound: (matches: MatchResult[]) => void
): Promise<void> => {
  let matches: MatchResult[] = [];

  if (newItem.type === ItemType.LOST) {
    matches = await findMatchesForLostItem(newItem);
  } else {
    matches = await findMatchesForFoundItem(newItem);
  }

  // Only notify for medium and high confidence matches
  const significantMatches = matches.filter(
    m => m.confidence === 'high' || m.confidence === 'medium'
  );

  if (significantMatches.length > 0) {
    onMatchFound(significantMatches);
  }
};

