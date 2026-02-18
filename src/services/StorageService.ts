import { ItemType, ItemCategory, CampusLocation, ItemStatus } from '../types';
import type { Item, UserStats } from '../types';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getAuth } from 'firebase/auth';

const STORAGE_KEY = 'campus_find_items_v2';
const STATS_KEY = 'campus_find_stats_v2';


const MOCK_ITEMS: Item[] = [
  {
    id: '1',
    type: ItemType.FOUND,
    title: 'Honda Car Keys',
    description: 'Found a set of Honda car keys on a wooden table.',
    category: ItemCategory.KEYS,
    location: CampusLocation.UNDERGRAD_LIBRARY,
    date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    status: ItemStatus.OPEN,
    imageUrl: 'https://images.unsplash.com/photo-1623126908029-58cb08a2b272?auto=format&fit=crop&q=80&w=600',
    aiTags: ['keys', 'honda', 'black']
  },
  {
    id: '2',
    type: ItemType.LOST,
    title: 'Airpods Pro Case',
    description: 'White Apple Airpods pro case left in the locker room.',
    category: ItemCategory.ELECTRONICS,
    location: CampusLocation.FITNESS_CENTER,
    date: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
    status: ItemStatus.OPEN,
    imageUrl: 'https://images.unsplash.com/photo-1603351154351-5cf99bc5f16d?auto=format&fit=crop&q=80&w=600',
    aiTags: ['white', 'apple', 'case']
  },
  {
    id: '3',
    type: ItemType.FOUND,
    title: 'Student ID Card',
    description: 'Found a student ID card near the North Cafeteria.',
    category: ItemCategory.ID_CARDS,
    location: CampusLocation.TOWERS_CAFE,
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // Yesterday
    status: ItemStatus.OPEN,
    imageUrl: '', // Intentional no image for "Found" generic icon test
    aiTags: ['id card', 'plastic']
  },
  {
    id: '4',
    type: ItemType.LOST,
    title: 'Apple Watch Series 6',
    description: 'Black smart watch lost in Lab 204.',
    category: ItemCategory.ELECTRONICS,
    location: CampusLocation.SCIENCE_HALL,
    date: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), // Yesterday
    status: ItemStatus.OPEN,
    imageUrl: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&q=80&w=600',
    aiTags: ['watch', 'black', 'apple']
  },
  {
    id: '5',
    type: ItemType.FOUND,
    title: 'Blue Nike Sneaker (Left)',
    description: 'Single blue sneaker found on the bleachers.',
    category: ItemCategory.CLOTHING,
    location: CampusLocation.WAYNE_STATE_FIELDHOUSE,
    date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    status: ItemStatus.OPEN,
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=600',
    aiTags: ['shoe', 'blue', 'nike']
  }
];

export const getItems= (): Item[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored){
        localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_ITEMS));
        return MOCK_ITEMS;
    }
    return JSON.parse(stored);
};

export const saveItem = (item: Item): Item[] => {
    const items = getItems().map(i => i.id === item.id ? {...i, ...item} : i);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return items;
};

export const updateitemStatus = (id: string, status: ItemStatus): Item[] => {
    const items = getItems().map(i => i.id === id ? {...i, status} : i);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return items;
};

export const addItem = (item: Item): Item[] => {
    const items = [item, ...getItems()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return items;
};

export const deleteItem = (id: string): Item[] => {
    const items = getItems().filter(i => i.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return items;
};


export const getUserStats = (): UserStats => {
  const stored = localStorage.getItem(STATS_KEY);
  if (!stored) {
    return { 
      points: 0, 
      itemsReturned: 0, 
      itemsReported: 0,
      lastActive: new Date().toISOString(),
      itemsClaimed: 0,
      badges: []
    };
  }
  return JSON.parse(stored);
};


export const saveUserStats = async (stats: UserStats): Promise<UserStats> => {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  
  // Sync to Firestore if user is logged in
  const auth = getAuth();
  const user = auth.currentUser;
  if (user) {
    try {
      await setDoc(doc(db, 'users', user.uid), {
        points: stats.points,
        itemsReported: stats.itemsReported,
        itemsReturned: stats.itemsReturned,
        itemsClaimed: stats.itemsClaimed,
        lastActive: stats.lastActive
      }, { merge: true });
    } catch (err) {
      console.error('Failed to sync stats to Firestore:', err);
    }
  }
  
  return stats;
};


export const addPoints = async (amount: number): Promise<UserStats> => {
  const stats = getUserStats();
  stats.points += amount;
  stats.itemsReturned += 1;
  stats.lastActive = new Date().toISOString();
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  
  // Sync to Firestore if user is logged in
  const auth = getAuth();
  const user = auth.currentUser;
  if (user) {
    try {
      await setDoc(doc(db, 'users', user.uid), {
        points: stats.points,
        itemsReturned: stats.itemsReturned,
        lastActive: stats.lastActive
      }, { merge: true });
    } catch (err) {
      console.error('Failed to sync points to Firestore:', err);
    }
  }
  
  return stats;
};

// Sync stats from Firestore to localStorage (call this on app load)
export const syncStatsFromFirestore = async (): Promise<UserStats | null> => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      const stats: UserStats = {
        points: data.points || 0,
        itemsReported: data.itemsReported || 0,
        itemsReturned: data.itemsReturned || 0,
        itemsClaimed: data.itemsClaimed || 0,
        lastActive: data.lastActive || new Date().toISOString(),
        badges: data.badges || []
      };
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
      return stats;
    }
  } catch (err) {
    console.error('Failed to sync stats from Firestore:', err);
  }
  return null;
};

// Clear local stats (call this when admin resets points)
export const clearLocalStats = (): void => {
  localStorage.removeItem(STATS_KEY);
};
