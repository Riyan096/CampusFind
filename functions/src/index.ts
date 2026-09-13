import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  processGamificationActivity,
  ActivityType,
  ACTIVITY_POINTS,
  checkAchievements,
  getDefaultUserStats,
  updateStreak,
  UserStats
} from './gamification';

initializeApp();

const db = getFirestore();

/**
 * ============================================================
 * AWARD POINTS
 * ============================================================
 *
 * Client calls:
 *
 * awardPoints({
 *   activityType: 'report',
 *   itemId: 'abc123'
 * })
 *
 * The client DOES NOT provide the number of points.
 *
 * The server decides the reward.
 */

export const awardPoints = onCall(
  async request => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to earn points.'
      );
    }

    const uid = request.auth.uid;

    const data = request.data as {
      activityType?: unknown;
      itemId?: unknown;
    };

    const activityType = data.activityType;
    const itemId = data.itemId;

    if (
      activityType !== 'report' &&
      activityType !== 'return' &&
      activityType !== 'claim'
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Invalid activity type.'
      );
    }

    if (
      typeof itemId !== 'string' ||
      itemId.trim().length === 0
    ) {
      throw new HttpsError(
        'invalid-argument',
        'A valid item ID is required.'
      );
    }

    try {
      const result = await db.runTransaction(
        async transaction => {
          return await processGamificationActivity(
            transaction,
            uid,
            activityType as ActivityType,
            itemId
          );
        }
      );

      return result;
    } catch (error) {
      console.error(
        'Gamification transaction failed:',
        error
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        'Unable to process gamification activity.'
      );
    }
  }
);

interface ResolutionItem {
  reportedBy?: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Pure reward calculator used by resolveItem.
 *
 * No Firestore reads/writes happen here. This makes the reward calculation
 * deterministic for a transaction attempt and keeps all I/O in resolveItem.
 */
const calculateResolutionReward = (
  stats: UserStats,
  now: Date
) => {
  const pointsAwarded = ACTIVITY_POINTS.return;

  const updatedStats: UserStats = {
    ...stats,
    points: stats.points + pointsAwarded,
    itemsReturned: stats.itemsReturned + 1,
    lastActive: now.toISOString()
  };

  const streakResult = {
    updatedStats,
    streakIncreased: false
  };

  const achievementResult = checkAchievements(
    streakResult.updatedStats,
    now
  );

  return {
    stats: achievementResult.updatedStats,
    newAchievements: achievementResult.newAchievements,
    pointsAwarded,
    streakIncreased: streakResult.streakIncreased
  };
};

const normalizeStats = (
  data: Record<string, unknown> | undefined
): UserStats => {
  const defaults = getDefaultUserStats();

  return {
    ...defaults,
    ...(data || {}),
    streaks: {
      ...defaults.streaks,
      ...(data?.streaks as Partial<UserStats['streaks']> | undefined)
    },
    badges: Array.isArray(data?.badges)
      ? data.badges as string[]
      : defaults.badges,
    unlockedAchievements: Array.isArray(data?.unlockedAchievements)
      ? data.unlockedAchievements as UserStats['unlockedAchievements']
      : defaults.unlockedAchievements
  };
};

export const resolveItem = onCall(async request => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'You must be signed in to resolve an item.'
    );
  }

  const uid = request.auth.uid;
  const itemId = request.data?.itemId;
  const newStatus = request.data?.newStatus;

  if (
    typeof itemId !== 'string' ||
    !itemId.trim() ||
    typeof newStatus !== 'string'
  ) {
    throw new HttpsError(
      'invalid-argument',
      'A valid item ID and status are required.'
    );
  }

  const itemRef = db.collection('items').doc(itemId);
  const actorRef = db.collection('users').doc(uid);

  try {
    const result = await db.runTransaction(async transaction => {
      // ========================================================
      // READ PHASE — ALL TRANSACTION READS HAPPEN BEFORE WRITES
      // ========================================================
      const itemSnapshot = await transaction.get(itemRef);

      if (!itemSnapshot.exists) {
        throw new HttpsError(
          'not-found',
          'Item not found.'
        );
      }

      const item = itemSnapshot.data() as ResolutionItem | undefined;

      if (!item) {
        throw new HttpsError(
          'not-found',
          'Item data not found.'
        );
      }

      const actorSnapshot = await transaction.get(actorRef);

      if (!actorSnapshot.exists) {
        throw new HttpsError(
          'failed-precondition',
          'User profile not found.'
        );
      }

      const actorData = actorSnapshot.data() || {};
      const isAdmin = actorData.isAdmin === true;
      const reporterId = item.reportedBy;

      if (!reporterId) {
        throw new HttpsError(
          'failed-precondition',
          'Item has no valid reporter.'
        );
      }

      if (!isAdmin && reporterId !== uid) {
        throw new HttpsError(
          'permission-denied',
          'You can only change the status of items you reported.'
        );
      }

      // The reporter is the reward recipient. If an admin resolves an item,
      // the admin is allowed to perform the action but does not receive the
      // reporter's reward.
      const reporterRef = db.collection('users').doc(reporterId);
      const reporterSnapshot =
        reporterId === uid
          ? actorSnapshot
          : await transaction.get(reporterRef);

      if (!reporterSnapshot.exists) {
        throw new HttpsError(
          'failed-precondition',
          'Reporter profile not found.'
        );
      }

      const reporterData = reporterSnapshot.data() || {};
      const reporterStats = normalizeStats(reporterData);

      // Read the deterministic idempotency record before any write.
      const awardRef = reporterRef
        .collection('pointAwards')
        .doc(`${itemId}_return`);
      const awardSnapshot = await transaction.get(awardRef);

      // ========================================================
      // VALIDATION / CALCULATION PHASE — STILL NO WRITES
      // ========================================================
      const validStatuses =
        item.type === 'LOST'
          ? ['STILL_LOST', 'MATCH_FOUND', 'CLAIMED', 'RECOVERED']
          : item.type === 'FOUND'
            ? ['AVAILABLE', 'PENDING_CLAIM', 'RETURNED', 'UNCLAIMED']
            : [];

      if (!validStatuses.includes(newStatus)) {
        throw new HttpsError(
          'invalid-argument',
          'Invalid status for this item type.'
        );
      }

      const oldStatus = item.status;

      if (oldStatus === newStatus) {
        return {
          item: {
            ...item,
            id: itemId
          },
          stats: reporterStats,
          newAchievements: [],
          pointsAwarded: 0,
          alreadyResolved: true
        };
      }

      const isResolution =
        newStatus === 'CLAIMED' ||
        newStatus === 'RETURNED';

      if (
        newStatus === 'CLAIMED' &&
        item.type !== 'LOST'
      ) {
        throw new HttpsError(
          'failed-precondition',
          'A found item cannot be resolved as claimed.'
        );
      }

      if (
        newStatus === 'RETURNED' &&
        item.type !== 'FOUND'
      ) {
        throw new HttpsError(
          'failed-precondition',
          'A lost item cannot be resolved as returned.'
        );
      }

      if (
        isResolution &&
        (oldStatus === 'CLAIMED' ||
          oldStatus === 'RETURNED' ||
          oldStatus === 'RECOVERED')
      ) {
        throw new HttpsError(
          'failed-precondition',
          'The item has already been resolved.'
        );
      }

      if (!isResolution) {
        // Status-only changes do not award points, so no reward write is
        // needed. The item write is still performed only after all reads.
        transaction.update(itemRef, {
          status: newStatus
        });

        return {
          item: {
            ...item,
            id: itemId,
            status: newStatus
          },
          stats: reporterStats,
          newAchievements: [],
          pointsAwarded: 0,
          alreadyResolved: false
        };
      }

      if (awardSnapshot.exists) {
        // The item and award are committed atomically, so an existing award
        // means this resolution was already successfully processed.
        return {
          item: {
            ...item,
            id: itemId
          },
          stats: reporterStats,
          newAchievements: [],
          pointsAwarded: 0,
          alreadyResolved: true
        };
      }

      const now = new Date();
      const reward = calculateResolutionReward(
        reporterStats,
        now
      );

      // ========================================================
      // WRITE PHASE — ALL WRITES HAPPEN AFTER READS/VALIDATION
      // ========================================================
      transaction.update(itemRef, {
        status: newStatus
      });

      transaction.set(
        reporterRef,
        {
          points: reward.stats.points,
          itemsReported: reward.stats.itemsReported,
          itemsReturned: reward.stats.itemsReturned,
          itemsClaimed: reward.stats.itemsClaimed,
          streaks: reward.stats.streaks,
          unlockedAchievements:
            reward.stats.unlockedAchievements,
          lastActive: reward.stats.lastActive
        },
        { merge: true }
      );

      transaction.create(awardRef, {
        activityType: 'return',
        itemId,
        pointsAwarded: reward.pointsAwarded,
        createdAt: now
      });

      return {
        item: {
          ...item,
          id: itemId,
          status: newStatus
        },
        stats: reward.stats,
        newAchievements: reward.newAchievements,
        pointsAwarded: reward.pointsAwarded,
        streakIncreased: reward.streakIncreased,
        alreadyResolved: false
      };
    });

    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    console.error('resolveItem failed:', error);

    throw new HttpsError(
      'internal',
      'Failed to update the item.'
    );
  }
});
