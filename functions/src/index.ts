import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  processGamificationActivity,
  ActivityType
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
    /**
     * --------------------------------------------------------
     * 1. REQUIRE AUTHENTICATION
     * --------------------------------------------------------
     */

    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to earn points.'
      );
    }

    const uid = request.auth.uid;

    /**
     * --------------------------------------------------------
     * 2. VALIDATE INPUT
     * --------------------------------------------------------
     */

    const data = request.data as {
      activityType?: unknown;
      itemId?: unknown;
    };

    const activityType =
      data.activityType;

    const itemId =
      data.itemId;

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

    /**
     * --------------------------------------------------------
     * 3. PROCESS EVERYTHING IN A FIRESTORE TRANSACTION
     * --------------------------------------------------------
     *
     * This prevents race conditions and duplicate rewards.
     */

    try {
      const result =
        await db.runTransaction(
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

      if (
        error instanceof HttpsError
      ) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        'Unable to process gamification activity.'
      );
    }
  }
);

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

  try {
    const result = await db.runTransaction(async transaction => {
      const itemSnapshot = await transaction.get(itemRef);

      if (!itemSnapshot.exists) {
        throw new HttpsError(
          'not-found',
          'Item not found.'
        );
      }

      const item = itemSnapshot.data();

      if (!item) {
        throw new HttpsError(
          'not-found',
          'Item data not found.'
        );
      }

      const userSnapshot = await transaction.get(
        db.collection('users').doc(uid)
      );

      if (!userSnapshot.exists) {
        throw new HttpsError(
          'failed-precondition',
          'User profile not found.'
        );
      }

      const userData = userSnapshot.data();

      const isAdmin = userData?.isAdmin === true;
      const isReporter = item.reportedBy === uid;

      if (!isReporter && !isAdmin) {
        throw new HttpsError(
          'permission-denied',
          'You can only change the status of items you reported.'
        );
      }

      const validStatuses =
        item.type === 'LOST'
          ? [
              'STILL_LOST',
              'MATCH_FOUND',
              'CLAIMED',
              'RECOVERED'
            ]
          : [
              'AVAILABLE',
              'PENDING_CLAIM',
              'RETURNED',
              'UNCLAIMED'
            ];

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
          stats: userData,
          newAchievements: [],
          pointsAwarded: 0,
          alreadyResolved: true
        };
      }

      const isResolution =
        newStatus === 'CLAIMED' ||
        newStatus === 'RETURNED';

      transaction.update(itemRef, {
        status: newStatus
      });

      if (!isResolution) {
        return {
          item: {
            ...item,
            id: itemId,
            status: newStatus
          },
          stats: userData,
          newAchievements: [],
          pointsAwarded: 0
        };
      }

      const gamificationResult =
        await processGamificationActivity(
          transaction,
          uid,
          'return',
          itemId
        );

      return {
        item: {
          ...item,
          id: itemId,
          status: newStatus
        },
        stats: gamificationResult.stats,
        newAchievements:
          gamificationResult.newAchievements,
        pointsAwarded:
          gamificationResult.pointsAwarded,
        alreadyResolved:
          gamificationResult.alreadyAwarded
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