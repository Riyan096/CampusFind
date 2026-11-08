import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentDeleted, onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onValueWritten} from "firebase-functions/v2/database";

import {getFirestore} from "firebase-admin/firestore";
import {getDatabase} from "firebase-admin/database";
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
 * Maintain a private per-user chat index. Clients read only their own index,
 * never the global /chats collection. The index mirrors chat-list metadata.
 */
export const syncUserChatIndexes = onValueWritten("chats/{chatId}", async (event) => {
  const before = event.data.before.val() as {participants?: Record<string, unknown>} | null;
  const after = event.data.after.val() as {
    itemId?: unknown; itemTitle?: unknown; createdBy?: unknown;
    participants?: Record<string, unknown>; createdAt?: unknown; lastMessage?: unknown;
  } | null;
  const chatId = event.params.chatId;
  const previousIds = Object.keys(before?.participants || {});
  const participants = after?.participants || {};
  const updates: Record<string, unknown> = {};

  for (const uid of previousIds) {
    if (!participants[uid]) updates[`userChats/${uid}/${chatId}`] = null;
  }
  if (after) {
    const summary: Record<string, unknown> = {
      id: chatId,
      itemId: typeof after.itemId === "string" ? after.itemId : "",
      itemTitle: typeof after.itemTitle === "string" ? after.itemTitle : "Untitled item",
      createdBy: typeof after.createdBy === "string" ? after.createdBy : "",
      participants,
      createdAt: typeof after.createdAt === "number" ? after.createdAt : 0,
    };
    if (after.lastMessage && typeof after.lastMessage === "object") {
      summary.lastMessage = after.lastMessage;
    }
    for (const uid of Object.keys(participants)) {
      updates[`userChats/${uid}/${chatId}`] = summary;
    }
  }
  if (Object.keys(updates).length) await getDatabase().ref().update(updates);
});


/**
 * Extract a Firebase Storage object path from a Storage download URL.
 * Returns null for non-Firebase URLs so legacy/external images are untouched.
 *
 * @param {unknown} value The candidate Storage download URL.
 * @return {?string} The decoded Storage object path, or null when unrecognized.
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

  const match = parsedUrl.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!match || match[1] !== storageBucket.name) return null;

  try {
    return decodeURIComponent(match[2]);
  } catch {
    return null;
  }
};

/**
 * Clean up a report image that is no longer referenced by an item.
 * Throwing on failure is intentional: Firestore-triggered functions can retry,
 * preventing a transient Storage failure from permanently leaving an orphan.
 *
 * @param {unknown} value The old image URL.
 * @param {unknown} reporterId The item's reporting user's ID.
 * @param {string} itemId The item's document ID.
 * @return {Promise<void>} Resolves after any owned Storage object is deleted.
 */
const deleteStorageImageFromUrl = async (
  value: unknown,
  reporterId: unknown,
  itemId: string,
): Promise<void> => {
  const path = storagePathFromDownloadUrl(value);
  const prefix = typeof reporterId === "string" ?
    `users/${reporterId}/items/${itemId}/` : "";
  const relativePath = path?.startsWith(prefix) ? path.slice(prefix.length) : "";
  const isOwnedItemImage = prefix.length > 0 && relativePath.length > 0 &&
    !relativePath.includes("/");

  if (process.env.FUNCTIONS_EMULATOR === "true") {
    console.log("Storage cleanup target:", {
      url: value,
      path,
      isOwnedItemImage,
      bucket: storageBucket.name,
      emulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    });
  }

  if (!path || !isOwnedItemImage) return;

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
  await deleteStorageImageFromUrl(
    item?.imageUrl,
    item?.reportedBy,
    event.params.itemId,
  );
});

export const cleanupReplacedItemImage = onDocumentUpdated("items/{itemId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (before?.imageUrl === after?.imageUrl) return;
  await deleteStorageImageFromUrl(
    before?.imageUrl,
    before?.reportedBy,
    event.params.itemId,
  );
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
  // Return awards are issued atomically by resolveItem after an independent
  // confirmation. Claim counters have no client-authorized award path.
  if (activityType !== "report") {
    throw new HttpsError("invalid-argument", "Only report awards can be requested directly.");
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

const writeNotificationOnce = async (
  id: string,
  data: FirebaseFirestore.DocumentData,
): Promise<void> => {
  const ref = db.collection("notifications").doc(id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) transaction.create(ref, data);
  });
};

/** Create a chat notification only for a real message in a shared chat. */
export const notifyChatMessage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const {chatId, messageId, recipientId} = request.data || {};
  const validKey = (value: unknown): value is string =>
    typeof value === "string" && /^[-\w]{1,128}$/.test(value);
  if (!validKey(chatId) || !validKey(messageId) || !validKey(recipientId)) {
    throw new HttpsError("invalid-argument", "Invalid chat notification details.");
  }

  const chatSnapshot = await getDatabase().ref(`chats/${chatId}`).get();
  const chat = chatSnapshot.val() as {
    participants?: Record<string, unknown>;
  } | null;
  if (!chat?.participants?.[request.auth.uid] ||
      !chat.participants[recipientId]) {
    throw new HttpsError("permission-denied", "Both users must belong to the chat.");
  }
  const messageSnapshot = await getDatabase()
    .ref(`chats/${chatId}/messages/${messageId}`).get();
  const message = messageSnapshot.val() as {
    senderId?: unknown;
    content?: unknown;
  } | null;
  if (message?.senderId !== request.auth.uid ||
      typeof message.content !== "string") {
    throw new HttpsError("permission-denied", "Message was not sent by you.");
  }

  await writeNotificationOnce(`chat_${chatId}_${messageId}_${recipientId}`, {
    userId: recipientId,
    title: "New chat message",
    message: message.content.slice(0, 100),
    type: "chat_message",
    read: false,
    createdAt: new Date().toISOString(),
    relatedChatId: chatId,
    relatedItemId: typeof (chat as {itemId?: unknown}).itemId === "string" ?
      (chat as {itemId: string}).itemId : "",
  });
  return {ok: true};
});

/** Notify an item's owner about a complementary item reported by the caller. */
export const notifyPotentialMatch = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const {sourceItemId, targetItemId} = request.data || {};
  const validItemId = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= 200 &&
    !value.includes("/");
  if (!validItemId(sourceItemId) || !validItemId(targetItemId)) {
    throw new HttpsError("invalid-argument", "Invalid item details.");
  }
  const sourceRef = db.collection("items").doc(sourceItemId);
  const targetRef = db.collection("items").doc(targetItemId);
  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    sourceRef.get(),
    targetRef.get(),
  ]);
  if (!sourceSnapshot.exists || !targetSnapshot.exists) {
    throw new HttpsError("not-found", "An item was not found.");
  }
  const source = sourceSnapshot.data() || {};
  const target = targetSnapshot.data() || {};
  if (source.reportedBy !== request.auth.uid || source.type !== "FOUND" ||
      !["AVAILABLE", "PENDING_CLAIM"].includes(source.status) ||
      target.type !== "LOST" ||
      !["STILL_LOST", "MATCH_FOUND"].includes(target.status) ||
      typeof target.reportedBy !== "string" ||
      target.reportedBy === request.auth.uid) {
    throw new HttpsError("permission-denied", "These items cannot be matched by you.");
  }
  const foundTitle = typeof source.title === "string" ? source.title.slice(0, 200) : "a found item";
  await writeNotificationOnce(`match_${sourceItemId}_${targetItemId}`, {
    userId: target.reportedBy,
    title: "Potential match found",
    message: `Someone found an item that might match: "${foundTitle}".`,
    type: "item_match",
    read: false,
    createdAt: new Date().toISOString(),
    relatedItemId: targetItemId,
  });
  return {ok: true};
});

/**
 * Add the verified item owner to a discussion. The chat creator may request
 * this immediately after creating the chat; the owner may also join directly.
 * The target participant is derived from Firestore, never supplied by client.
 */
/**
 * One-time backfill for chats created before the private user index existed.
 * The caller receives no other users' chat data; only their own index is built.
 */
export const rebuildUserChatIndex = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const uid = request.auth.uid;
  const userIndexRef = getDatabase().ref(`userChats/${uid}`);
  const existing = await userIndexRef.child("_initialized").get();
  if (existing.val() === true) return {ok: true, alreadyInitialized: true};

  const chatsSnapshot = await getDatabase().ref("chats").get();
  const index: Record<string, unknown> = {_initialized: true};
  chatsSnapshot.forEach((child) => {
    const chat = child.val() as {
      itemId?: unknown; itemTitle?: unknown; createdBy?: unknown;
      participants?: Record<string, unknown>; createdAt?: unknown; lastMessage?: unknown;
    } | null;
    if (!chat?.participants?.[uid]) return;
    const summary: Record<string, unknown> = {
      id: child.key,
      itemId: typeof chat.itemId === "string" ? chat.itemId : "",
      itemTitle: typeof chat.itemTitle === "string" ? chat.itemTitle : "Untitled item",
      createdBy: typeof chat.createdBy === "string" ? chat.createdBy : "",
      participants: chat.participants,
      createdAt: typeof chat.createdAt === "number" ? chat.createdAt : 0,
    };
    if (chat.lastMessage && typeof chat.lastMessage === "object") {
      summary.lastMessage = chat.lastMessage;
    }
    if (child.key) index[child.key] = summary;
  });
  await userIndexRef.set(index);
  return {ok: true, chatCount: Object.keys(index).length - 1};
});

export const joinItemChat = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const chatId = request.data?.chatId;
  if (typeof chatId !== "string" || !/^[-\w]{1,128}$/.test(chatId)) {
    throw new HttpsError("invalid-argument", "Invalid chat ID.");
  }
  const chatRef = getDatabase().ref(`chats/${chatId}`);
  const chatSnapshot = await chatRef.get();
  const chat = chatSnapshot.val() as {
    itemId?: unknown; createdBy?: unknown; participants?: Record<string, unknown>;
  } | null;
  if (!chat || typeof chat.itemId !== "string" || typeof chat.createdBy !== "string") {
    throw new HttpsError("not-found", "Chat not found.");
  }
  const itemSnapshot = await db.collection("items").doc(chat.itemId).get();
  const ownerId = itemSnapshot.data()?.reportedBy;
  if (!itemSnapshot.exists || typeof ownerId !== "string" || !ownerId) {
    throw new HttpsError("failed-precondition", "The chat's item has no valid owner.");
  }
  const callerIsCreator = chat.createdBy === request.auth.uid;
  const callerIsOwner = ownerId === request.auth.uid;
  if (!callerIsCreator && !callerIsOwner) {
    throw new HttpsError("permission-denied", "Only the chat creator or item owner can join.");
  }
  const participantId = callerIsCreator ? ownerId : request.auth.uid;
  if (chat.participants?.[participantId]) return {ok: true};
  const userSnapshot = await db.collection("users").doc(participantId).get();
  const userName = userSnapshot.data()?.displayName;
  await chatRef.child(`participants/${participantId}`).set({
    name: typeof userName === "string" ? userName.slice(0, 100) : "Anonymous",
    joinedAt: Date.now(),
  });
  return {ok: true};
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
      const isRewardedFinalTransition =
        (item.type === "LOST" && item.status === "MATCH_FOUND" &&
          newStatus === "CLAIMED") ||
        (item.type === "FOUND" && item.status === "PENDING_CLAIM" &&
          newStatus === "RETURNED");
      const isAlreadyRewardedFinalStatus = newStatus === item.status &&
        ((item.type === "LOST" && item.status === "CLAIMED") ||
          (item.type === "FOUND" && item.status === "RETURNED"));
      if (!isAdmin && (
        (reporterId !== uid && !isRewardedFinalTransition &&
          !isAlreadyRewardedFinalStatus) ||
        (reporterId === uid && isRewardedFinalTransition)
      )) {
        throw new HttpsError(
          "permission-denied",
          "Final return confirmation must come from someone other than the reporter."
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
