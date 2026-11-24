// Pure decision logic for item resolution and report points, ported from
// functions/src/index.ts (resolveItem) and functions/src/gamification.ts
// (awardPoints). No I/O: the caller reads the documents inside a Firestore
// transaction, passes them in, and commits the returned writes.

export type ActivityType = "report" | "return" | "claim";

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastReportDate: string;
  weeklyActivity: boolean[];
}

export interface UserAchievement {
  achievementId: string;
  unlockedAt: string;
  progress: number;
}

export interface UserStats {
  points: number;
  itemsReturned: number;
  itemsReported: number;
  itemsClaimed: number;
  lastActive: string;
  badges: string[];
  streaks: StreakInfo;
  unlockedAchievements: UserAchievement[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: "reporting" | "helping" | "streak" | "points" | "special";
  pointsBonus: number;
  condition: {
    type: "itemsReported" | "itemsReturned" | "itemsClaimed" | "streak" | "points";
    threshold: number;
  };
}

export type ErrorCode = "invalid-argument" | "not-found" | "failed-precondition" | "permission-denied";

export type DocData = Record<string, unknown>;

/** A write the caller must commit atomically. Paths are relative to the database root. */
export type Write =
  | { op: "update"; path: string; data: DocData }
  | { op: "merge"; path: string; data: DocData }
  | { op: "create"; path: string; data: DocData };

export type Decision<T> =
  | { ok: true; response: T; writes: Write[] }
  | { ok: false; code: ErrorCode; message: string };

export const ACTIVITY_POINTS: Record<ActivityType, number> = {
  report: 10,
  return: 50,
  claim: 0,
};

export const ACHIEVEMENTS: Achievement[] = [
  {id: "first_report", title: "First Report", description: "Report your first lost or found item", icon: "📝", category: "reporting", pointsBonus: 10, condition: {type: "itemsReported", threshold: 1}},
  {id: "helper", title: "Helpful Hand", description: "Help return 3 items", icon: "🤝", category: "helping", pointsBonus: 25, condition: {type: "itemsReturned", threshold: 3}},
  {id: "week_warrior", title: "Week Warrior", description: "Maintain a 7-day reporting streak", icon: "🔥", category: "streak", pointsBonus: 30, condition: {type: "streak", threshold: 7}},
  {id: "active_reporter", title: "Active Reporter", description: "Report 10 items", icon: "📢", category: "reporting", pointsBonus: 50, condition: {type: "itemsReported", threshold: 10}},
  {id: "return_champion", title: "Return Champion", description: "Help return 10 items", icon: "🏆", category: "helping", pointsBonus: 75, condition: {type: "itemsReturned", threshold: 10}},
  {id: "streak_master", title: "Streak Master", description: "Maintain a 30-day reporting streak", icon: "🔥", category: "streak", pointsBonus: 100, condition: {type: "streak", threshold: 30}},
  {id: "point_collector", title: "Point Collector", description: "Earn 500 points", icon: "💰", category: "points", pointsBonus: 50, condition: {type: "points", threshold: 500}},
  {id: "power_reporter", title: "Power Reporter", description: "Report 25 items", icon: "⚡", category: "reporting", pointsBonus: 150, condition: {type: "itemsReported", threshold: 25}},
  {id: "return_legend", title: "Return Legend", description: "Help return 25 items", icon: "👑", category: "helping", pointsBonus: 200, condition: {type: "itemsReturned", threshold: 25}},
  {id: "dedicated_helper", title: "Dedicated Helper", description: "Maintain a 60-day reporting streak", icon: "💪", category: "streak", pointsBonus: 250, condition: {type: "streak", threshold: 60}},
  {id: "point_hoarder", title: "Point Hoarder", description: "Earn 1,000 points", icon: "💎", category: "points", pointsBonus: 100, condition: {type: "points", threshold: 1000}},
  {id: "campus_hero", title: "Campus Hero", description: "Report 50 items and return 25", icon: "🦸", category: "special", pointsBonus: 500, condition: {type: "itemsReported", threshold: 50}},
  {id: "unstoppable", title: "Unstoppable", description: "Maintain a 100-day reporting streak", icon: "🚀", category: "streak", pointsBonus: 500, condition: {type: "streak", threshold: 100}},
];

export const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
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

const defaultStreaks = (): StreakInfo => ({
  currentStreak: 0,
  longestStreak: 0,
  lastReportDate: "",
  weeklyActivity: [false, false, false, false, false, false, false],
});

/** Type-checked stats from a stored user document; bad or missing fields fall back to defaults. */
export const normalizeStats = (data: DocData | null, now: Date): UserStats => {
  const d = data || {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    points: num(d.points),
    itemsReturned: num(d.itemsReturned),
    itemsReported: num(d.itemsReported),
    itemsClaimed: num(d.itemsClaimed),
    lastActive: typeof d.lastActive === "string" ? d.lastActive : now.toISOString(),
    badges: Array.isArray(d.badges) ? d.badges as string[] : [],
    streaks: {...defaultStreaks(), ...(d.streaks && typeof d.streaks === "object" ? d.streaks as Partial<StreakInfo> : {})},
    unlockedAchievements: Array.isArray(d.unlockedAchievements) ? d.unlockedAchievements as UserAchievement[] : [],
  };
};

const formatDate = (date: Date): string => date.toISOString().split("T")[0];

export const updateStreak = (stats: UserStats, now: Date) => {
  const today = formatDate(now);
  const yesterday = formatDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const streaks: StreakInfo = {...defaultStreaks(), ...(stats.streaks || {})};
  if (!Array.isArray(streaks.weeklyActivity) || streaks.weeklyActivity.length !== 7) {
    streaks.weeklyActivity = [false, false, false, false, false, false, false];
  }
  if (streaks.lastReportDate === today) {
    return {updatedStats: stats, streakIncreased: false};
  }
  const weeklyActivity = [...streaks.weeklyActivity];
  weeklyActivity[now.getDay()] = true;
  streaks.currentStreak = streaks.lastReportDate === yesterday || !streaks.lastReportDate ?
    streaks.currentStreak + 1 : 1;
  streaks.longestStreak = Math.max(streaks.currentStreak, streaks.longestStreak);
  streaks.lastReportDate = today;
  streaks.weeklyActivity = weeklyActivity;
  return {updatedStats: {...stats, streaks}, streakIncreased: true};
};

export const checkAchievements = (stats: UserStats, now: Date) => {
  const unlockedIds = new Set((stats.unlockedAchievements || []).map((a) => a.achievementId));
  const value = {
    itemsReported: stats.itemsReported,
    itemsReturned: stats.itemsReturned,
    itemsClaimed: stats.itemsClaimed,
    streak: stats.streaks?.currentStreak || 0,
    points: stats.points,
  };
  const newAchievements = ACHIEVEMENTS.filter((a) =>
    !unlockedIds.has(a.id) && value[a.condition.type] >= a.condition.threshold);
  const unlockedAt = now.toISOString();
  const bonus = newAchievements.reduce((total, a) => total + a.pointsBonus, 0);
  return {
    newAchievements,
    updatedStats: {
      ...stats,
      points: stats.points + bonus,
      unlockedAchievements: [
        ...(stats.unlockedAchievements || []),
        ...newAchievements.map((a) => ({achievementId: a.id, unlockedAt, progress: 100})),
      ],
    },
  };
};

const statsWrite = (uid: string, stats: UserStats): Write => ({
  op: "merge",
  path: `users/${uid}`,
  data: {
    points: stats.points,
    itemsReported: stats.itemsReported,
    itemsReturned: stats.itemsReturned,
    itemsClaimed: stats.itemsClaimed,
    streaks: stats.streaks,
    unlockedAchievements: stats.unlockedAchievements,
    lastActive: stats.lastActive,
  },
});

const publicProfileWrite = (uid: string, privateUser: DocData, stats: UserStats): Write => ({
  op: "merge",
  path: `publicProfiles/${uid}`,
  data: {
    uid,
    displayName: typeof privateUser.displayName === "string" ? privateUser.displayName : "Anonymous",
    photoURL: privateUser.photoURL ?? null,
    points: stats.points,
    itemsReported: stats.itemsReported,
    itemsReturned: stats.itemsReturned,
    itemsClaimed: stats.itemsClaimed,
  },
});

const fail = (code: ErrorCode, message: string): { ok: false; code: ErrorCode; message: string } =>
  ({ok: false, code, message});

// ---------------------------------------------------------------- resolveItem

export interface ChatSummary {
  createdBy?: unknown;
  participantIds?: unknown;
}

export interface ResolveResponse {
  item: DocData;
  newAchievements: Achievement[];
  pointsAwarded: number;
  streakIncreased?: boolean;
  alreadyResolved: boolean;
}

export interface ResolveInput {
  uid: string;
  itemId: string;
  newStatus: string;
  /** items/{itemId}, or null if missing. */
  item: DocData | null;
  /** users/{uid}, or null if missing. */
  actor: DocData | null;
  /** users/{item.reportedBy}, or null if missing. Ignored when the reporter is the actor. */
  reporter: DocData | null;
  /** chats where itemId == itemId. */
  itemChats: ChatSummary[];
  /** Whether users/{reporter}/pointAwards/{itemId}_return exists. */
  awardExists: boolean;
  now: Date;
}

/** Request shape check, done before any reads. */
export const validateResolveRequest = (body: unknown): { itemId: string; newStatus: string } | null => {
  const b = body as { itemId?: unknown; newStatus?: unknown } | null;
  if (!b || typeof b.itemId !== "string" || !b.itemId.trim() || typeof b.newStatus !== "string") return null;
  return {itemId: b.itemId, newStatus: b.newStatus};
};

export const decideResolve = (input: ResolveInput): Decision<ResolveResponse> => {
  const {uid, itemId, newStatus, item, actor, now} = input;
  if (!item) return fail("not-found", "Item not found.");
  if (!actor) return fail("failed-precondition", "User profile not found.");

  const isAdmin = actor.isAdmin === true;
  const reporterId = item.reportedBy;
  if (typeof reporterId !== "string" || !reporterId) {
    return fail("failed-precondition", "Item has no valid reporter.");
  }

  const isRewardedFinalTransition =
    (item.type === "LOST" && item.status === "MATCH_FOUND" && newStatus === "CLAIMED") ||
    (item.type === "FOUND" && item.status === "PENDING_CLAIM" && newStatus === "RETURNED");
  const isAlreadyRewardedFinalStatus = newStatus === item.status &&
    ((item.type === "LOST" && item.status === "CLAIMED") ||
      (item.type === "FOUND" && item.status === "RETURNED"));

  // A non-reporter may confirm a return only if they started a conversation
  // about this item. Being signed in must never be enough.
  if (!isAdmin && reporterId !== uid && (isRewardedFinalTransition || isAlreadyRewardedFinalStatus)) {
    const callerStartedConversation = input.itemChats.some((chat) =>
      chat.createdBy === uid && Array.isArray(chat.participantIds) && chat.participantIds.includes(uid));
    if (!callerStartedConversation) {
      return fail("permission-denied",
        "Only the item reporter or the person who started a conversation about the item can confirm its return.");
    }
  }

  if (!isAdmin && (
    (reporterId !== uid && !isRewardedFinalTransition && !isAlreadyRewardedFinalStatus) ||
    (reporterId === uid && isRewardedFinalTransition)
  )) {
    return fail("permission-denied", "Final return confirmation must come from someone other than the reporter.");
  }

  const reporterData = reporterId === uid ? actor : input.reporter;
  if (!reporterData) return fail("failed-precondition", "Reporter profile not found.");
  const reporterStats = normalizeStats(reporterData, now);

  const allowedNextStatuses = ALLOWED_TRANSITIONS[String(item.type ?? "")]?.[String(item.status ?? "")];
  if (!allowedNextStatuses) {
    return fail("failed-precondition", "The item has an invalid or unsupported current status.");
  }

  const profileOnly = [publicProfileWrite(reporterId, reporterData, reporterStats)];
  const unchanged = (alreadyResolved: boolean): Decision<ResolveResponse> => ({
    ok: true,
    response: {item: {...item, id: itemId}, newAchievements: [], pointsAwarded: 0, alreadyResolved},
    writes: profileOnly,
  });

  if (newStatus === item.status) return unchanged(true);
  if (!allowedNextStatuses.includes(newStatus)) {
    return fail("failed-precondition", `Invalid status transition from ${item.status} to ${newStatus}.`);
  }

  const itemUpdate: Write = {op: "update", path: `items/${itemId}`, data: {status: newStatus}};
  const isResolution = newStatus === "CLAIMED" || newStatus === "RETURNED";
  if (!isResolution) {
    return {
      ok: true,
      response: {item: {...item, id: itemId, status: newStatus}, newAchievements: [], pointsAwarded: 0, alreadyResolved: false},
      writes: [itemUpdate, ...profileOnly],
    };
  }
  if (input.awardExists) return unchanged(true);

  const pointsAwarded = ACTIVITY_POINTS.return;
  const reward = checkAchievements({
    ...reporterStats,
    points: reporterStats.points + pointsAwarded,
    itemsReturned: reporterStats.itemsReturned + 1,
    lastActive: now.toISOString(),
  }, now);

  return {
    ok: true,
    response: {
      item: {...item, id: itemId, status: newStatus},
      newAchievements: uid === reporterId || isAdmin ? reward.newAchievements : [],
      pointsAwarded,
      streakIncreased: false,
      alreadyResolved: false,
    },
    writes: [
      itemUpdate,
      statsWrite(reporterId, reward.updatedStats),
      publicProfileWrite(reporterId, reporterData, reward.updatedStats),
      {op: "create", path: `users/${reporterId}/pointAwards/${itemId}_return`, data: {
        activityType: "return", itemId, pointsAwarded, createdAt: now,
      }},
    ],
  };
};

// ------------------------------------------------------ awardPoints (report)

export interface ReportAwardResponse {
  stats: UserStats;
  newAchievements: Achievement[];
  pointsAwarded: number;
  streakIncreased: boolean;
  alreadyAwarded: boolean;
}

export interface ReportAwardInput {
  uid: string;
  itemId: string;
  /** users/{uid}, or null if missing. */
  user: DocData | null;
  /** items/{itemId}, or null if missing. */
  item: DocData | null;
  /** Whether users/{uid}/pointAwards/{itemId}_report exists. */
  awardExists: boolean;
  now: Date;
}

/** Only report awards can be requested directly; return awards come from decideResolve. */
export const validateReportAwardRequest = (body: unknown): { itemId: string } | { error: string } => {
  const b = body as { activityType?: unknown; itemId?: unknown } | null;
  if (!b || b.activityType !== "report") return {error: "Only report awards can be requested directly."};
  if (typeof b.itemId !== "string" || !b.itemId.trim()) return {error: "A valid item ID is required."};
  return {itemId: b.itemId};
};

export const decideReportAward = (input: ReportAwardInput): Decision<ReportAwardResponse> => {
  const {uid, itemId, user, item, now} = input;

  if (input.awardExists) {
    const stats = normalizeStats(user, now);
    return {
      ok: true,
      response: {stats, newAchievements: [], pointsAwarded: 0, streakIncreased: false, alreadyAwarded: true},
      writes: user ? [publicProfileWrite(uid, user, stats)] : [],
    };
  }
  if (!user) return fail("not-found", "User profile was not found.");
  if (!item) return fail("not-found", "Item was not found.");
  if (item.reportedBy !== uid) {
    return fail("permission-denied", "You can only receive report rewards for your own items.");
  }

  const stats = normalizeStats(user, now);
  const pointsAwarded = ACTIVITY_POINTS.report;
  const streak = updateStreak({
    ...stats,
    points: stats.points + pointsAwarded,
    itemsReported: stats.itemsReported + 1,
    lastActive: now.toISOString(),
  }, now);
  const achievements = checkAchievements(streak.updatedStats, now);
  const finalStats = achievements.updatedStats;

  return {
    ok: true,
    response: {
      stats: finalStats,
      newAchievements: achievements.newAchievements,
      pointsAwarded,
      streakIncreased: streak.streakIncreased,
      alreadyAwarded: false,
    },
    writes: [
      statsWrite(uid, finalStats),
      publicProfileWrite(uid, user, finalStats),
      {op: "create", path: `users/${uid}/pointAwards/${itemId}_report`, data: {
        activityType: "report", itemId, pointsAwarded, createdAt: now,
      }},
    ],
  };
};
