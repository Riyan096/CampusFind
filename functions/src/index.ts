import {onCall, HttpsError} from "firebase-functions/v2/https";

import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";

import {
  processGamificationActivity,
  ActivityType,
  ACTIVITY_POINTS,
  checkAchievements,
  getDefaultUserStats,
  UserStats,
} from "./gamification";
import {analyzeItemImage, findSmartMatches} from "./aiFunctions";

initializeApp();

const db = getFirestore();

export {analyzeItemImage, findSmartMatches};

export const awardPoints = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in to earn points.");
  const uid = request.auth.uid;
  const data = request.data as { activityType?: unknown; itemId?: unknown };
  const activityType = data.activityType;
  const itemId = data.itemId;
  if (activityType !== "report" && activityType !== "return" && activityType !== "claim") {
    throw new HttpsError("invalid-argument", "Invalid activity type.");
  }
  if (typeof itemId !== "string" || itemId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "A valid item ID is required.");
  }
  try {
    return await db.runTransaction(async (transaction) => {
      return await processGamificationActivity(transaction, uid, activityType as ActivityType, itemId);
    });
  } catch (error) {
    console.error("Gamification transaction failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Unable to process gamification activity.");
  }
});

interface ResolutionItem {
  reportedBy?: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
}

const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  LOST: {STILL_LOST: ["MATCH_FOUND"], MATCH_FOUND: ["CLAIMED"], CLAIMED: ["RECOVERED"], RECOVERED: []},
  FOUND: {AVAILABLE: ["PENDING_CLAIM"], PENDING_CLAIM: ["RETURNED", "UNCLAIMED"], RETURNED: [], UNCLAIMED: []},
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
    streaks: {...defaults.streaks, ...(data?.streaks as Partial<UserStats["streaks"]> | undefined)},
    badges: Array.isArray(data?.badges) ? data.badges as string[] : defaults.badges,
    unlockedAchievements: Array.isArray(data?.unlockedAchievements) ? data.unlockedAchievements as UserStats["unlockedAchievements"] : defaults.unlockedAchievements,
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
    displayName: typeof privateUser.displayName === "string" ? privateUser.displayName : "Anonymous",
    photoURL: privateUser.photoURL ?? null,
    points: stats.points,
    itemsReported: stats.itemsReported,
    itemsReturned: stats.itemsReturned,
    itemsClaimed: stats.itemsClaimed,
  }, {merge: true});
};

export const resolveItem = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in to resolve an item.");
  const uid = request.auth.uid;
  const itemId = request.data?.itemId;
  const newStatus = request.data?.newStatus;
  if (typeof itemId !== "string" || !itemId.trim() || typeof newStatus !== "string") {
    throw new HttpsError("invalid-argument", "A valid item ID and status are required.");
  }
  const itemRef = db.collection("items").doc(itemId);
  const actorRef = db.collection("users").doc(uid);
  try {
    return await db.runTransaction(async (transaction) => {
      const itemSnapshot = await transaction.get(itemRef);
      if (!itemSnapshot.exists) throw new HttpsError("not-found", "Item not found.");
      const item = itemSnapshot.data() as ResolutionItem | undefined;
      if (!item) throw new HttpsError("not-found", "Item data not found.");
      const actorSnapshot = await transaction.get(actorRef);
      if (!actorSnapshot.exists) throw new HttpsError("failed-precondition", "User profile not found.");
      const actorData = actorSnapshot.data() || {};
      const isAdmin = actorData.isAdmin === true;
      const reporterId = item.reportedBy;
      if (!reporterId) throw new HttpsError("failed-precondition", "Item has no valid reporter.");
      if (!isAdmin && reporterId !== uid) throw new HttpsError("permission-denied", "You can only change the status of items you reported.");

      const reporterRef = db.collection("users").doc(reporterId);
      const reporterSnapshot = reporterId === uid ? actorSnapshot : await transaction.get(reporterRef);
      if (!reporterSnapshot.exists) throw new HttpsError("failed-precondition", "Reporter profile not found.");
      const reporterData = reporterSnapshot.data() || {};
      const reporterStats = normalizeStats(reporterData);
      const validTransitions = ALLOWED_TRANSITIONS[item.type || ""];
      const allowedNextStatuses = validTransitions?.[item.status || ""];
      if (!allowedNextStatuses) throw new HttpsError("failed-precondition", "The item has an invalid or unsupported current status.");
      if (newStatus === item.status) {
        writePublicProfile(transaction, reporterId, reporterData, reporterStats);
        return {item: {...item, id: itemId}, stats: reporterStats, newAchievements: [], pointsAwarded: 0, alreadyResolved: true};
      }
      if (!allowedNextStatuses.includes(newStatus)) throw new HttpsError("failed-precondition", `Invalid status transition from ${item.status} to ${newStatus}.`);
      const isResolution = newStatus === "CLAIMED" || newStatus === "RETURNED";
      const awardRef = reporterRef.collection("pointAwards").doc(`${itemId}_return`);
      if (!isResolution) {
        transaction.update(itemRef, {status: newStatus});
        writePublicProfile(transaction, reporterId, reporterData, reporterStats);
        return {item: {...item, id: itemId, status: newStatus}, stats: reporterStats, newAchievements: [], pointsAwarded: 0, alreadyResolved: false};
      }
      const awardSnapshot = await transaction.get(awardRef);
      if (awardSnapshot.exists) {
        writePublicProfile(transaction, reporterId, reporterData, reporterStats);
        return {item: {...item, id: itemId}, stats: reporterStats, newAchievements: [], pointsAwarded: 0, alreadyResolved: true};
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
      writePublicProfile(transaction, reporterId, reporterData, reward.stats);
      transaction.create(awardRef, {activityType: "return", itemId, pointsAwarded: reward.pointsAwarded, createdAt: now});
      return {item: {...item, id: itemId, status: newStatus}, stats: reward.stats, newAchievements: reward.newAchievements, pointsAwarded: reward.pointsAwarded, streakIncreased: reward.streakIncreased, alreadyResolved: false};
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("resolveItem transaction failed:", error);
    throw new HttpsError("internal", "Unable to resolve item.");
  }
});
