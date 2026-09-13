import { getFunctions, httpsCallable } from 'firebase/functions';

import { app } from './firebase';

import type { Achievement, UserStats } from '../types';

import type {
  GamificationActivityType,
  GamificationResult
} from './gamificationService';

const functions = getFunctions(app);

/**
 * Data sent FROM the client TO the Cloud Function.
 *
 * Notice that there is NO points value here.
 *
 * The server decides the reward.
 */
interface AwardGamificationRequest {
  activityType: GamificationActivityType;
  itemId: string;
}

/**
 * Data returned FROM the Cloud Function.
 */
interface AwardGamificationResponse {
  stats: UserStats;
  newAchievements: Achievement[];
  pointsAwarded: number;
  streakIncreased: boolean;
  alreadyAwarded?: boolean;
}

/**
 * Callable Cloud Function.
 */
const awardPointsCallable = httpsCallable<
  AwardGamificationRequest,
  AwardGamificationResponse
>(
  functions,
  'awardPoints'
);

/**
 * Ask the server to process a gamification activity.
 */
export const awardGamificationActivity = async (
  activityType: GamificationActivityType,
  itemId: string
): Promise<GamificationResult> => {
  if (!itemId) {
    throw new Error('An item ID is required for gamification.');
  }

  const result = await awardPointsCallable({
    activityType,
    itemId
  });

  return result.data;
};