export enum ItemType {
  LOST = 'LOST',
  FOUND = 'FOUND'
}

export enum ItemCategory {
  ELECTRONICS = 'Electronics',
  CLOTHING = 'Clothing',
  KEYS = 'Keys',
  ID_CARDS = 'ID Cards',
  BOOKS = 'Books',
  OTHER = 'Other'
}

// Status for LOST items (from owner's perspective)
export enum LostItemStatus {
  STILL_LOST = 'STILL_LOST',      // Item is still missing
  MATCH_FOUND = 'MATCH_FOUND',    // Potential match found
  CLAIMED = 'CLAIMED',            // Owner found their item
  RECOVERED = 'RECOVERED'         // Successfully returned to owner
}

// Status for FOUND items (from finder's perspective)
export enum FoundItemStatus {
  AVAILABLE = 'AVAILABLE',        // Found, waiting for owner
  PENDING_CLAIM = 'PENDING_CLAIM', // Someone claims it's theirs
  RETURNED = 'RETURNED',          // Successfully returned to owner
  UNCLAIMED = 'UNCLAIMED'         // No one claimed it after period
}

// Legacy status enum for backward compatibility
export enum ItemStatus {
  OPEN = 'OPEN',
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  RESOLVED = 'RESOLVED'
}


// CampusLocation enum REMOVED
// Now: Item.location = string (free text)
// Item.latlng?: [number,number] (cached coordinates)

// Union type for all possible item statuses
export type ItemStatusType = ItemStatus | LostItemStatus | FoundItemStatus | string;

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  description: string;
  category: ItemCategory;
  /** Free-text location (e.g. "Starbucks downtown") */
  location: string;
  /** Cached coordinates [lat, lng] from geocoding */
  latlng?: [number, number] | null;
  date: string;
  imageUrl?: string;
  status: ItemStatusType;
  userContact?: string;
  aiTags?: string[];
  reportedBy?: string;
  reporterName?: string;
  createdAt?: string;
  updatedAt?: string;
}




export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastReportDate: string;
  weeklyActivity: boolean[]; // 7 days, true if active
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'bronze' | 'silver' | 'gold' | 'platinum';
  pointsBonus: number;
  condition: {
    type: 'itemsReported' | 'itemsReturned' | 'itemsClaimed' | 'streak' | 'points';
    threshold: number;
  };
}

export interface UserAchievement {
  achievementId: string;
  unlockedAt: string;
  progress: number; // 0-100
}

export interface UserStats {
  points: number;
  itemsReported: number;
  itemsReturned: number;
  lastActive: string;
  itemsClaimed: number;
  badges: string[];
  streaks: StreakInfo;
  unlockedAchievements: UserAchievement[];
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  photoURL?: string;
  points: number;
  itemsReported: number;
  itemsReturned: number;
  rank?: number;
}
