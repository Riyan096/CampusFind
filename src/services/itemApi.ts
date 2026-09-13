import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';
import type { Achievement, Item, UserStats } from '../types';
import type { LostItemStatus, FoundItemStatus } from '../types';

const functions = getFunctions(app);

type ResolveStatus = LostItemStatus | FoundItemStatus;

interface ResolveItemRequest {
  itemId: string;
  newStatus: ResolveStatus;
}

interface ResolveItemResponse {
  item: Item;
  stats: UserStats;
  newAchievements: Achievement[];
  pointsAwarded: number;
  alreadyResolved?: boolean;
}

const resolveItemCallable = httpsCallable<
  ResolveItemRequest,
  ResolveItemResponse
>(functions, 'resolveItem');

export const resolveItem = async (
  itemId: string,
  newStatus: ResolveStatus
): Promise<ResolveItemResponse> => {
  if (!itemId) {
    throw new Error('An item ID is required.');
  }

  const result = await resolveItemCallable({
    itemId,
    newStatus
  });

  return result.data;
};