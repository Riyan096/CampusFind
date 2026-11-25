import { callWorker } from './workerApi';
import type { Achievement, Item } from '../types';
import type { LostItemStatus, FoundItemStatus } from '../types';

type ResolveStatus = LostItemStatus | FoundItemStatus;

interface ResolveItemRequest {
  itemId: string;
  newStatus: ResolveStatus;
}

interface ResolveItemResponse {
  item: Item;
  newAchievements: Achievement[];
  pointsAwarded: number;
  alreadyResolved?: boolean;
}

/** Status changes go through the worker, which checks permissions and awards points atomically. */
export const resolveItem = async (
  itemId: string,
  newStatus: ResolveStatus
): Promise<ResolveItemResponse> => {
  if (!itemId) {
    throw new Error('An item ID is required.');
  }

  const request: ResolveItemRequest = { itemId, newStatus };
  return callWorker<ResolveItemResponse>('/api/items/resolve', request);
};