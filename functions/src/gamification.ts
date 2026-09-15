import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

const db = getFirestore();

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

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: "reporting" | "helping" | "streak" | "points" | "special";
  pointsBonus: number;
  condition: { type: "itemsReported" | "itemsReturned" | "itemsClaimed" | "streak" | "points"; threshold: number };
}

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

export const getDefaultStreakInfo = (): StreakInfo => ({
  currentStreak: 0,
  longestStreak: 0,
  lastReportDate: "",
  weeklyActivity: [false, false, false, false, false, false, false],
});

export const getDefaultUserStats = (): UserStats => ({
  points: 0,
  itemsReturned: 0,
  itemsReported: 0,
  itemsClaimed: 0,
  lastActive: "",
  badges: [],
  streaks: getDefaultStreakInfo(),
  unlockedAchievements: [],
});

const formatDate = (date: Date): string => date.toISOString().split("T")[0];

export const updateStreak = (stats: UserStats, now: Date) => {
  const today = formatDate(now);
  const yesterday = formatDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const streaks: StreakInfo = {...getDefaultStreakInfo(), ...(stats.streaks || {})};
  if (!Array.isArray(streaks.weeklyActivity) || streaks.weeklyActivity.length !== 7) {
    streaks.weeklyActivity = [false, false, false, false, false, false, false];
  }
  if (streaks.lastReportDate === today) return {updatedStats: stats, streakIncreased: false};
  const weeklyActivity = [...streaks.weeklyActivity];
  weeklyActivity[now.getDay()] = true;
  if (streaks.lastReportDate === yesterday || !streaks.lastReportDate) streaks.currentStreak += 1;
  else streaks.currentStreak = 1;
  const streakIncreased = true;
  streaks.longestStreak = Math.max(streaks.currentStreak, streaks.longestStreak);
  streaks.lastReportDate = today;
  streaks.weeklyActivity = weeklyActivity;
  return {updatedStats: {...stats, streaks}, streakIncreased};
};

export const checkAchievements = (stats: UserStats, now: Date) => {
  const unlockedIds = new Set((stats.unlockedAchievements || []).map((achievement) => achievement.achievementId));
  const newAchievements: Achievement[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (unlockedIds.has(achievement.id)) continue;
    let unlocked = false;
    switch (achievement.condition.type) {
    case "itemsReported": unlocked = stats.itemsReported >= achievement.condition.threshold; break;
    case "itemsReturned": unlocked = stats.itemsReturned >= achievement.condition.threshold; break;
    case "itemsClaimed": unlocked = stats.itemsClaimed >= achievement.condition.threshold; break;
    case "streak": unlocked = (stats.streaks?.currentStreak || 0) >= achievement.condition.threshold; break;
    case "points": unlocked = stats.points >= achievement.condition.threshold; break;
    }
    if (unlocked) newAchievements.push(achievement);
  }
  const unlockedAt = now.toISOString();
  const newUserAchievements = newAchievements.map((achievement) => ({achievementId: achievement.id, unlockedAt, progress: 100}));
  const achievementBonus = newAchievements.reduce((total, achievement) => total + achievement.pointsBonus, 0);
  return {
    newAchievements,
    updatedStats: {
      ...stats,
      points: stats.points + achievementBonus,
      unlockedAchievements: [...(stats.unlockedAchievements || []), ...newUserAchievements],
    },
  };
};

const normalizeUserStats = (data: Partial<UserStats>): UserStats => ({
  points: typeof data.points === "number" ? data.points : 0,
  itemsReturned: typeof data.itemsReturned === "number" ? data.itemsReturned : 0,
  itemsReported: typeof data.itemsReported === "number" ? data.itemsReported : 0,
  itemsClaimed: typeof data.itemsClaimed === "number" ? data.itemsClaimed : 0,
  lastActive: typeof data.lastActive === "string" ? data.lastActive : new Date().toISOString(),
  badges: Array.isArray(data.badges) ? data.badges : [],
  streaks: {...getDefaultStreakInfo(), ...(data.streaks || {})},
  unlockedAchievements: Array.isArray(data.unlockedAchievements) ? data.unlockedAchievements : [],
});

const writePublicProfile = (
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  privateUser: FirebaseFirestore.DocumentData,
  stats: UserStats
) => {
  const profileRef = db.collection("publicProfiles").doc(uid);
  transaction.set(profileRef, {
    uid,
    displayName: typeof privateUser.displayName === "string" ? privateUser.displayName : "Anonymous",
    photoURL: privateUser.photoURL ?? null,
    points: stats.points,
    itemsReported: stats.itemsReported,
    itemsReturned: stats.itemsReturned,
    itemsClaimed: stats.itemsClaimed,
  }, {merge: true});
};

export type GamificationActivityType = ActivityType;
export interface GamificationResult {
  stats: UserStats;
  newAchievements: Achievement[];
  pointsAwarded: number;
  streakIncreased: boolean;
  alreadyAwarded?: boolean;
}

export const processGamificationActivity = async (
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  activityType: ActivityType,
  itemId: string
): Promise<GamificationResult> => {
  const now = new Date();
  const userRef = db.collection("users").doc(uid);
  const itemRef = db.collection("items").doc(itemId);
  const awardRef = userRef.collection("pointAwards").doc(`${itemId}_${activityType}`);
  const [userSnapshot, itemSnapshot, awardSnapshot] = await transaction.getAll(userRef, itemRef, awardRef);

  if (awardSnapshot.exists) {
    const existingStats = userSnapshot.exists ? normalizeUserStats(userSnapshot.data() as Partial<UserStats>) : getDefaultUserStats();
    if (userSnapshot.exists) writePublicProfile(transaction, uid, userSnapshot.data() || {}, existingStats);
    return {stats: existingStats, newAchievements: [], pointsAwarded: 0, streakIncreased: false, alreadyAwarded: true};
  }
  if (!userSnapshot.exists) throw new HttpsError("not-found", "User profile was not found.");
  if (!itemSnapshot.exists) throw new HttpsError("not-found", "Item was not found.");

  const stats = normalizeUserStats(userSnapshot.data() as Partial<UserStats>);
  const item = itemSnapshot.data() as {reportedBy?: string; type?: string; status?: string};
  if (activityType === "report" && item.reportedBy !== uid) {
    throw new HttpsError("permission-denied", "You can only receive report rewards for your own items.");
  }
  if (activityType === "return") {
    if (item.reportedBy !== uid) throw new HttpsError("permission-denied", "You can only receive return rewards for an item you reported.");
    const validReturnStatus = (item.type === "LOST" && item.status === "CLAIMED") || (item.type === "FOUND" && item.status === "RETURNED");
    if (!validReturnStatus) throw new HttpsError("failed-precondition", "The item has not been resolved.");
  }
  if (activityType === "claim" && item.reportedBy !== uid) {
    throw new HttpsError("permission-denied", "You are not allowed to claim this item.");
  }

  const pointsAwarded = ACTIVITY_POINTS[activityType];
  const updatedStats: UserStats = {
    ...stats,
    points: stats.points + pointsAwarded,
    itemsReported: activityType === "report" ? stats.itemsReported + 1 : stats.itemsReported,
    itemsReturned: activityType === "return" ? stats.itemsReturned + 1 : stats.itemsReturned,
    itemsClaimed: activityType === "claim" ? stats.itemsClaimed + 1 : stats.itemsClaimed,
    lastActive: now.toISOString(),
  };
  const streakResult = activityType === "report" ? updateStreak(updatedStats, now) : {updatedStats, streakIncreased: false};
  const achievementResult = checkAchievements(streakResult.updatedStats, now);
  const finalStats = achievementResult.updatedStats;

  transaction.set(userRef, {
    points: finalStats.points,
    itemsReported: finalStats.itemsReported,
    itemsReturned: finalStats.itemsReturned,
    itemsClaimed: finalStats.itemsClaimed,
    streaks: finalStats.streaks,
    unlockedAchievements: finalStats.unlockedAchievements,
    lastActive: finalStats.lastActive,
  }, {merge: true});
  writePublicProfile(transaction, uid, userSnapshot.data() || {}, finalStats);
  transaction.create(awardRef, {activityType, itemId, pointsAwarded, createdAt: Timestamp.now()});

  return {
    stats: finalStats,
    newAchievements: achievementResult.newAchievements,
    pointsAwarded,
    streakIncreased: streakResult.streakIncreased,
    alreadyAwarded: false,
  };
};
