import type { Achievement, UserAchievement, UserStats, StreakInfo, LeaderboardEntry } from '../types';
import { db } from './firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Define all available achievements
export const ACHIEVEMENTS: Achievement[] = [
  // Bronze - Easy
  {
    id: 'first_report',
    name: 'First Steps',
    description: 'Report your first lost or found item',
    icon: 'flag',
    category: 'bronze',
    pointsBonus: 10,
    condition: { type: 'itemsReported', threshold: 1 }
  },
  {
    id: 'helper',
    name: 'Good Samaritan',
    description: 'Return 3 items to their owners',
    icon: 'volunteer_activism',
    category: 'bronze',
    pointsBonus: 25,
    condition: { type: 'itemsReturned', threshold: 3 }
  },
  {
    id: 'week_warrior',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    icon: 'local_fire_department',
    category: 'bronze',
    pointsBonus: 30,
    condition: { type: 'streak', threshold: 7 }
  },
  
  // Silver - Medium
  {
    id: 'active_reporter',
    name: 'Active Reporter',
    description: 'Report 10 items',
    icon: 'campaign',
    category: 'silver',
    pointsBonus: 50,
    condition: { type: 'itemsReported', threshold: 10 }
  },
  {
    id: 'return_champion',
    name: 'Return Champion',
    description: 'Return 10 items to their owners',
    icon: 'emoji_events',
    category: 'silver',
    pointsBonus: 75,
    condition: { type: 'itemsReturned', threshold: 10 }
  },
  {
    id: 'streak_master',
    name: 'Streak Master',
    description: 'Maintain a 30-day streak',
    icon: 'whatshot',
    category: 'silver',
    pointsBonus: 100,
    condition: { type: 'streak', threshold: 30 }
  },
  {
    id: 'point_collector',
    name: 'Point Collector',
    description: 'Earn 500 points',
    icon: 'stars',
    category: 'silver',
    pointsBonus: 50,
    condition: { type: 'points', threshold: 500 }
  },
  
  // Gold - Hard
  {
    id: 'power_reporter',
    name: 'Power Reporter',
    description: 'Report 25 items',
    icon: 'record_voice_over',
    category: 'gold',
    pointsBonus: 150,
    condition: { type: 'itemsReported', threshold: 25 }
  },
  {
    id: 'return_legend',
    name: 'Return Legend',
    description: 'Return 25 items to their owners',
    icon: 'military_tech',
    category: 'gold',
    pointsBonus: 200,
    condition: { type: 'itemsReturned', threshold: 25 }
  },
  {
    id: 'dedicated_helper',
    name: 'Dedicated Helper',
    description: 'Maintain a 60-day streak',
    icon: 'workspace_premium',
    category: 'gold',
    pointsBonus: 250,
    condition: { type: 'streak', threshold: 60 }
  },
  {
    id: 'point_hoarder',
    name: 'Point Hoarder',
    description: 'Earn 1000 points',
    icon: 'diamond',
    category: 'gold',
    pointsBonus: 100,
    condition: { type: 'points', threshold: 1000 }
  },
  
  // Platinum - Extreme
  {
    id: 'campus_hero',
    name: 'Campus Hero',
    description: 'Report 50 items and return 25',
    icon: 'castle',
    category: 'platinum',
    pointsBonus: 500,
    condition: { type: 'itemsReported', threshold: 50 }
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Maintain a 100-day streak',
    icon: 'local_fire_department',
    category: 'platinum',
    pointsBonus: 500,
    condition: { type: 'streak', threshold: 100 }
  }
];

// Get default streak info
export const getDefaultStreakInfo = (): StreakInfo => ({
  currentStreak: 0,
  longestStreak: 0,
  lastReportDate: '',
  weeklyActivity: [false, false, false, false, false, false, false]
});

// Check and update streaks
export const updateStreak = (stats: UserStats): { updatedStats: UserStats; streakIncreased: boolean } => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  let streakIncreased = false;
  const streaks = { ...stats.streaks };
  
  // Initialize if missing
  if (!streaks.weeklyActivity) {
    streaks.weeklyActivity = [false, false, false, false, false, false, false];
  }
  
  // Check if already reported today
  if (streaks.lastReportDate === today) {
    return { updatedStats: stats, streakIncreased: false };
  }
  
  // Update weekly activity (shift array)
  const dayOfWeek = new Date().getDay();
  const newWeeklyActivity = [...streaks.weeklyActivity];
  newWeeklyActivity[dayOfWeek] = true;
  
  // Check streak continuity
  if (streaks.lastReportDate === yesterday || !streaks.lastReportDate) {
    streaks.currentStreak += 1;
    streakIncreased = true;
    if (streaks.currentStreak > streaks.longestStreak) {
      streaks.longestStreak = streaks.currentStreak;
    }
  } else if (streaks.lastReportDate !== today) {
    // Streak broken
    streaks.currentStreak = 1;
    streakIncreased = true;
  }
  
  streaks.lastReportDate = today;
  streaks.weeklyActivity = newWeeklyActivity;
  
  return {
    updatedStats: {
      ...stats,
      streaks
    },
    streakIncreased
  };
};

// Check for new achievements
export const checkAchievements = (stats: UserStats): { newAchievements: Achievement[]; updatedStats: UserStats } => {
  const unlockedIds = new Set(stats.unlockedAchievements?.map(ua => ua.achievementId) || []);
  const newAchievements: Achievement[] = [];
  
  for (const achievement of ACHIEVEMENTS) {
    if (unlockedIds.has(achievement.id)) continue;
    
    let progress = 0;
    let unlocked = false;
    
    switch (achievement.condition.type) {
      case 'itemsReported':
        progress = Math.min(100, (stats.itemsReported / achievement.condition.threshold) * 100);
        unlocked = stats.itemsReported >= achievement.condition.threshold;
        break;
      case 'itemsReturned':
        progress = Math.min(100, (stats.itemsReturned / achievement.condition.threshold) * 100);
        unlocked = stats.itemsReturned >= achievement.condition.threshold;
        break;
      case 'itemsClaimed':
        progress = Math.min(100, (stats.itemsClaimed / achievement.condition.threshold) * 100);
        unlocked = stats.itemsClaimed >= achievement.condition.threshold;
        break;
      case 'streak':
        progress = Math.min(100, ((stats.streaks?.currentStreak || 0) / achievement.condition.threshold) * 100);
        unlocked = (stats.streaks?.currentStreak || 0) >= achievement.condition.threshold;
        break;
      case 'points':
        progress = Math.min(100, (stats.points / achievement.condition.threshold) * 100);
        unlocked = stats.points >= achievement.condition.threshold;
        break;
    }
    
    if (unlocked) {
      newAchievements.push(achievement);
    }
  }
  
  // Add new achievements to user stats
  const newUserAchievements: UserAchievement[] = newAchievements.map(ach => ({
    achievementId: ach.id,
    unlockedAt: new Date().toISOString(),
    progress: 100
  }));
  
  const updatedStats: UserStats = {
    ...stats,
    unlockedAchievements: [...(stats.unlockedAchievements || []), ...newUserAchievements],
    points: stats.points + newAchievements.reduce((sum, ach) => sum + ach.pointsBonus, 0)
  };
  
  return { newAchievements, updatedStats };
};

// Get achievement progress for a user
export const getAchievementProgress = (stats: UserStats): (Achievement & { progress: number; unlocked: boolean; unlockedAt?: string })[] => {
  const unlockedMap = new Map(
    stats.unlockedAchievements?.map(ua => [ua.achievementId, ua]) || []
  );
  
  return ACHIEVEMENTS.map(achievement => {
    const userAch = unlockedMap.get(achievement.id);
    let progress = 0;
    
    if (userAch) {
      progress = 100;
    } else {
      switch (achievement.condition.type) {
        case 'itemsReported':
          progress = Math.min(100, (stats.itemsReported / achievement.condition.threshold) * 100);
          break;
        case 'itemsReturned':
          progress = Math.min(100, (stats.itemsReturned / achievement.condition.threshold) * 100);
          break;
        case 'itemsClaimed':
          progress = Math.min(100, (stats.itemsClaimed / achievement.condition.threshold) * 100);
          break;
        case 'streak':
          progress = Math.min(100, ((stats.streaks?.currentStreak || 0) / achievement.condition.threshold) * 100);
          break;
        case 'points':
          progress = Math.min(100, (stats.points / achievement.condition.threshold) * 100);
          break;
      }
    }
    
    return {
      ...achievement,
      progress,
      unlocked: !!userAch,
      unlockedAt: userAch?.unlockedAt
    };
  });
};

// Get leaderboard from Firestore
export const getLeaderboard = async (limit_count: number = 10): Promise<LeaderboardEntry[]> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('points', 'desc'), limit(limit_count));
    const snapshot = await getDocs(q);
    
    const entries: LeaderboardEntry[] = [];
    let rank = 1;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      entries.push({
        userId: doc.id,
        displayName: data.displayName || 'Anonymous',
        photoURL: data.photoURL,
        points: data.points || 0,
        itemsReported: data.itemsReported || 0,
        itemsReturned: data.itemsReturned || 0,
        rank: rank++
      });
    });
    
    return entries;
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    return [];
  }
};

// Get current user's rank
export const getUserRank = async (userId: string): Promise<number> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('points', 'desc'));
    const snapshot = await getDocs(q);
    
    let rank = 1;
    for (const doc of snapshot.docs) {
      if (doc.id === userId) {
        return rank;
      }
      rank++;
    }
    
    return 0;
  } catch (err) {
    console.error('Error getting user rank:', err);
    return 0;
  }
};

// Sync gamification data to Firestore
export const syncGamificationToFirestore = async (stats: UserStats): Promise<void> => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      points: stats.points,
      itemsReported: stats.itemsReported,
      itemsReturned: stats.itemsReturned,
      itemsClaimed: stats.itemsClaimed,
      streaks: stats.streaks,
      unlockedAchievements: stats.unlockedAchievements,
      lastActive: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('Failed to sync gamification data:', err);
  }
};

// Award points and check achievements in one call
export const awardPointsAndCheckAchievements = async (
  currentStats: UserStats, 
  pointsToAdd: number,
  activityType: 'report' | 'return' | 'claim'
): Promise<{ stats: UserStats; newAchievements: Achievement[]; leveledUp: boolean }> => {
  // Update points
  let stats: UserStats = {
    ...currentStats,
    points: currentStats.points + pointsToAdd
  };
  
  // Update activity counters
  if (activityType === 'report') {
    stats.itemsReported += 1;
  } else if (activityType === 'return') {
    stats.itemsReturned += 1;
  } else if (activityType === 'claim') {
    stats.itemsClaimed += 1;
  }
  
  // Update streak
  const { updatedStats, streakIncreased } = updateStreak(stats);
  stats = updatedStats;
  
  // Check for new achievements
  const { newAchievements, updatedStats: finalStats } = checkAchievements(stats);
  stats = finalStats;
  
  // Save to localStorage
  localStorage.setItem('campus_find_stats_v2', JSON.stringify(stats));
  
  // Sync to Firestore
  await syncGamificationToFirestore(stats);
  
  return {
    stats,
    newAchievements,
    leveledUp: newAchievements.length > 0 || streakIncreased
  };
};

// Get category color
export const getAchievementColor = (category: Achievement['category']): string => {
  switch (category) {
    case 'bronze': return '#CD7F32';
    case 'silver': return '#C0C0C0';
    case 'gold': return '#FFD700';
    case 'platinum': return '#E5E4E2';
    default: return '#CD7F32';
  }
};

// Get category label
export const getCategoryLabel = (category: Achievement['category']): string => {
  switch (category) {
    case 'bronze': return 'Bronze';
    case 'silver': return 'Silver';
    case 'gold': return 'Gold';
    case 'platinum': return 'Platinum';
    default: return 'Bronze';
  }
};
