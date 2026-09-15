import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentDeleted, onDocumentUpdated} from "firebase-functions/v2/firestore";

import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

import {
  processGamificationActivity,
  ActivityType,
  ACTIVITY_POINTS,
  checkAchievements,
  getDefaultUserStats,
  UserStats,
} from "./gamification";
import {analyzeItemImage, findSmartMatches} from "./aiFunctions";

const db = getFirestore();

// The Functions emulator normally sets this automatically. Explicitly provide
// it for local integration tests so cleanup can never silently target a live
// bucket if the emulator environment is missing the variable.
if (process.env.FUNCTIONS_EMULATOR === "true" &&
    !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
}

const getConfiguredStorageBucket = (): string | undefined => {
  const firebaseConfig = process.env.FIREBASE_CONFIG;
  if (!firebaseConfig) return undefined;

  try {
    const parsed = JSON.parse(firebaseConfig);
    return typeof parsed.storageBucket === "string" && parsed.storageBucket ?
      parsed.storageBucket : undefined;
  } catch {
    return undefined;
  }
};

const configuredStorageBucket = getConfiguredStorageBucket();
const storageBucket = configuredStorageBucket ?
  getStorage().bucket(configuredStorageBucket) : getStorage().bucket();

if (process.env.FUNCTIONS_EMULATOR === "true") {
  console.log("Storage cleanup emulator configuration:", {
    bucket: storageBucket.name,
    emulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  });
}

export {analyzeItemImage, findSmartMatches};

/**
 * Extract a Firebase Storage object path from a Storage download URL.
 * Returns null for non-Firebase URLs so legacy/external images are untouched.
 */
const storagePathFromDownloadUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    return null;
  }

  const isFirebaseStorageHost = parsedUrl.hostname === "firebasestorage.googleapis.com";
  const isStorageEmulator =
    (parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost") &&
    parsedUrl.port === "9199";
  if (!isFirebaseStorageHost && !isStorageEmulator) return null;

  const match = parsedUrl.pathname.match(/\/o\/(.+)$/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

/**
 * Clean up a report image that is no longer referenced by an item.
 * Throwing on failure is intentional: Firestore-triggered functions can retry,
 * preventing a transient Storage failure from permanently leaving an orphan.
 */
const deleteStorageImageFromUrl = async (value: unknown): Promise<void> => {
  const path = storagePathFromDownloadUrl(value);

  if (process.env.FUNCTIONS_EMULATOR === "true") {
    console.log("Storage cleanup target:", {
      url: value,
      path,
      bucket: storageBucket.name,
      emulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    });
  }

  if (!path) return;

  try {
    await storageBucket.file(path).delete({ignoreNotFound: true});
  } catch (error) {
    console.error("Failed to clean up item image from Storage:", {
      path,
      bucket: storageBucket.name,
      emulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
      error,
    });
    throw error;
  }
};

export const cleanupDeletedItemImage = onDocumentDeleted("items/{itemId}", async (event) => {
  const item = event.data?.data();
  await deleteStorageImageFromUrl(item?.imageUrl);
});

export const cleanupReplacedItemImage = onDocumentUpdated("items/{itemId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (before?.imageUrl === after?.imageUrl) return;
  await deleteStorageImageFromUrl(before?.imageUrl);
});

export const awardPoints = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in to earn points."
    );
  }
  const uid = request.auth.uid;
  const data = request.data as {
    activityType?: unknown;
    itemId?: unknown;
  };
  const activityType = data.activityType;
  const itemId = data.itemId;
  if (activityType !== "report" &&
      activityType !== "return" &&
      activityType !== "claim") {
    throw new HttpsError("invalid-argument", "Invalid activity type.");
  }
  if (typeof itemId !== "string" || itemId.trim().length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "A valid item ID is required."
    );
  }
  try {
    return await db.runTransaction(async (transaction) => {
      return await processGamificationActivity(
        transaction,
        uid,
        activityType as ActivityType,
        itemId
      );
    });
  } catch (error) {
    console.error("Gamification transaction failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      "Unable to process gamification activity."
    );
  }
});

interface ResolutionItem {
  reportedBy?: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
}

const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  LOST: {
    STILL_LOST: ["MATCH_FOUND"],
    MATCH_FOUND: ["CLAIMED"],
    CLAIMED: ["RECOVERED"],
    RECOVERED: [],
  },
  FOUND: {
    AVAILABLE: ["PENDING_CLAIM"],
    PENDING_CLAIM: ["RETURNED", "UNCLAIMED"],
    RETURNED: [],
    UNCLAIMED: [],
  },
};

const calculateResolutionReward = (stats: UserStats, now: Date) => {
  const pointsAwarded = ACTIVITY_POINTS.return;
  const updatedStats: UserStats = {
    ...stats,
    points: stats.points + pointsAwarded,
    itemsReturned: stats.itemsReturned + 1,
    lastActive: now.toISOString(),
  };
  const achievementResult = checkAchievements(updatedStats, now);
  return {
    stats: achievementResult.updatedStats,
    newAchievements: achievementResult.newAchievements,
    pointsAwarded,
    streakIncreased: false,
  };
};

const normalizeStats = (data: Record<string, unknown> | undefined): UserStats => {
  const defaults = getDefaultUserStats();
  return {
    ...defaults,
    ...(data || {}),
    streaks: {
      ...defaults.streaks,
      ...(data?.streaks as Partial<UserStats["streaks"]> | undefined),
    },
    badges: Array.isArray(data?.badges) ?
      data.badges as string[] : defaults.badges,
    unlockedAchievements: Array.isArray(data?.unlockedAchievements) ?
      data.unlockedAchievements as UserStats["unlockedAchievements"] :
      defaults.unlockedAchievements,
  };
};

const writePublicProfile = (
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  privateUser: FirebaseFirestore.DocumentData,
  stats: UserStats
) => {
  transaction.set(db.collection("publicProfiles").doc(uid), {
    uid,
    displayName: typeof privateUser.displayName === "string" ?
      privateUser.displayName : "Anonymous",
    photoURL: privateUser.photoURL ?? null,
    points: stats.points,
    itemsReported: stats.itemsReported,
    itemsReturned: stats.itemsReturned,
    itemsClaimed: stats.itemsClaimed,
  }, {merge: true});
};

export const resolveItem = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in to resolve an item."
    );
  }
  const uid = request.auth.uid;
  const itemId = request.data?.itemId;
  const newStatus = request.data?.newStatus;
  if (typeof itemId !== "string" || !itemId.trim() ||
      typeof newStatus !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "A valid item ID and status are required."
    );
  }
  try {
    return await db.runTransaction(async (transaction) => {
      const itemRef = db.collection("items").doc(itemId);
      const actorRef = db.collection("users").doc(uid);
      const itemSnapshot = await transaction.get(itemRef);
      if (!itemSnapshot.exists) {
        throw new HttpsError("not-found", "Item not found.");
      }
      const item = itemSnapshot.data() as ResolutionItem | undefined;
      if (!item) {
        throw new HttpsError("not-found", "Item data not found.");
      }
      const actorSnapshot = await transaction.get(actorRef);
      if (!actorSnapshot.exists) {
        throw new HttpsError(
          "failed-precondition",
          "User profile not found."
        );
      }
      const actorData = actorSnapshot.data() || {};
      const isAdmin = actorData.isAdmin === true;
      const reporterId = item.reportedBy;
      if (!reporterId) {
        throw new HttpsError(
          "failed-precondition",
          "Item has no valid reporter."
        );
      }
      if (!isAdmin && reporterId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "You can only change the status of items you reported."
        );
      }

      const reporterRef = db.collection("users").doc(reporterId);
      const reporterSnapshot = reporterId === uid ?
        actorSnapshot : await transaction.get(reporterRef);
      if (!reporterSnapshot.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Reporter profile not found."
        );
      }
      const reporterData = reporterSnapshot.data() || {};
      const reporterStats = normalizeStats(reporterData);
      const validTransitions = ALLOWED_TRANSITIONS[item.type || ""];
      const allowedNextStatuses = validTransitions?.[item.status || ""];
      if (!allowedNextStatuses) {
        throw new HttpsError(
          "failed-precondition",
          "The item has an invalid or unsupported current status."
        );
      }
      if (newStatus === item.status) {
        writePublicProfile(
          transaction,
          reporterId,
          reporterData,
          reporterStats
        );
        return {
          item: {...item, id: itemId},
          stats: reporterStats,
          newAchievements: [],
          pointsAwarded: 0,
          alreadyResolved: true,
        };
      }
      if (!allowedNextStatuses.includes(newStatus)) {
        throw new HttpsError(
          "failed-precondition",
          `Invalid status transition from ${item.status} to ${newStatus}.`
        );
      }
      const isResolution = newStatus === "CLAIMED" || newStatus === "RETURNED";
      const awardRef = reporterRef.collection("pointAwards").doc(`${itemId}_return`);
      if (!isResolution) {
        transaction.update(itemRef, {status: newStatus});
        writePublicProfile(
          transaction,
          reporterId,
          reporterData,
          reporterStats
        );
        return {
          item: {...item, id: itemId, status: newStatus},
          stats: reporterStats,
          newAchievements: [],
          pointsAwarded: 0,
          alreadyResolved: false,
        };
      }
      const awardSnapshot = await transaction.get(awardRef);
      if (awardSnapshot.exists) {
        writePublicProfile(
          transaction,
          reporterId,
          reporterData,
          reporterStats
        );
        return {
          item: {...item, id: itemId},
          stats: reporterStats,
          newAchievements: [],
          pointsAwarded: 0,
          alreadyResolved: true,
        };
      }
      const now = new Date();
      const reward = calculateResolutionReward(reporterStats, now);
      transaction.update(itemRef, {status: newStatus});
      transaction.set(reporterRef, {
        points: reward.stats.points,
        itemsReported: reward.stats.itemsReported,
        itemsReturned: reward.stats.itemsReturned,
        itemsClaimed: reward.stats.itemsClaimed,
        streaks: reward.stats.streaks,
        unlockedAchievements: reward.stats.unlockedAchievements,
        lastActive: reward.stats.lastActive,
      }, {merge: true});
      writePublicProfile(
        transaction,
        reporterId,
        reporterData,
        reward.stats
      );
      transaction.create(awardRef, {
        activityType: "return",
        itemId,
        pointsAwarded: reward.pointsAwarded,
        createdAt: now,
      });
      return {
        item: {...item, id: itemId, status: newStatus},
        stats: reward.stats,
        newAchievements: reward.newAchievements,
        pointsAwarded: reward.pointsAwarded,
        streakIncreased: reward.streakIncreased,
        alreadyResolved: false,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("resolveItem transaction failed:", error);
    throw new HttpsError("internal", "Unable to resolve item.");
  }
});
