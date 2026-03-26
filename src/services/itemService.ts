import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import type { Item, ItemStatusType } from '../types';
import { ItemType, ItemCategory } from '../types';
import {
  LIMITS,
  sanitizeImageUrlField,
  sanitizePlainText,
  sanitizeSearchInput,
} from '../utils/sanitize';


const ITEMS_COLLECTION = 'items';

function sanitizeItemWrite<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data } as Record<string, unknown>;
  if (typeof out.title === 'string') {
    out.title = sanitizePlainText(out.title, LIMITS.title, { multiline: false });
  }
  if (typeof out.description === 'string') {
    out.description = sanitizePlainText(out.description, LIMITS.description, { multiline: true });
  }
  if (typeof out.reporterName === 'string') {
    out.reporterName = sanitizePlainText(out.reporterName, LIMITS.reporterName, {
      multiline: false,
    });
  }
  if (Array.isArray(out.aiTags)) {
    out.aiTags = (out.aiTags as unknown[])
      .map((t) =>
        typeof t === 'string' ? sanitizePlainText(t, LIMITS.aiTag, { multiline: false }) : t
      )
      .filter((t) => typeof t === 'string' && t.length > 0);
  }
  if (typeof out.imageUrl === 'string') {
    out.imageUrl = sanitizeImageUrlField(out.imageUrl);
  }
  return out as T;
}

// Convert Firestore timestamp to ISO string
const convertTimestamps = (data: any): any => {
  const result = { ...data };
  for (const key in result) {
    if (result[key] instanceof Timestamp) {
      result[key] = result[key].toDate().toISOString();
    }
  }
  return result;
};

// Get all items (real-time)
export const subscribeToItems = (callback: (items: Item[]) => void) => {
  const itemsQuery = query(collection(db, ITEMS_COLLECTION), orderBy('createdAt', 'desc'));
  
  return onSnapshot(itemsQuery, (snapshot) => {
    const items: Item[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        ...convertTimestamps(data),
      } as Item);
    });
    callback(items);
  });
};

// Get all items once
export const getAllItems = async (): Promise<Item[]> => {
  const itemsQuery = query(collection(db, ITEMS_COLLECTION), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(itemsQuery);
  
  const items: Item[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    items.push({
      id: doc.id,
      ...convertTimestamps(data),
    } as Item);
  });
  
  return items;
};

// Add a new item
export const addItemToFirestore = async (item: Omit<Item, 'id'>): Promise<string> => {
  const safe = sanitizeItemWrite({ ...item } as Record<string, unknown>) as Omit<Item, 'id'>;
  const docRef = await addDoc(collection(db, ITEMS_COLLECTION), {
    ...safe,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

// Update an item
export const updateItemInFirestore = async (id: string, updates: Partial<Item>): Promise<void> => {
  const safe = sanitizeItemWrite({ ...updates } as Record<string, unknown>) as Partial<Item>;
  const itemRef = doc(db, ITEMS_COLLECTION, id);
  await updateDoc(itemRef, {
    ...safe,
    updatedAt: serverTimestamp(),
  });
};

// Update item status
export const updateItemStatusInFirestore = async (id: string, status: ItemStatusType): Promise<void> => {
  const itemRef = doc(db, ITEMS_COLLECTION, id);
  await updateDoc(itemRef, {
    status,
    updatedAt: serverTimestamp(),
  });
};


// Delete an item
export const deleteItemFromFirestore = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, ITEMS_COLLECTION, id));
};

// Get items by user
export const getItemsByUser = async (userId: string): Promise<Item[]> => {
  const allItems = await getAllItems();
  return allItems.filter(item => item.reportedBy === userId);
};

// Get items by type (lost/found)
export const getItemsByType = async (type: ItemType): Promise<Item[]> => {
  const allItems = await getAllItems();
  return allItems.filter(item => item.type === type);
};

// Get items by status
export const getItemsByStatus = async (status: ItemStatusType): Promise<Item[]> => {
  const allItems = await getAllItems();
  return allItems.filter(item => item.status === status);
};


// Search items
export const searchItems = async (query: string): Promise<Item[]> => {
  const allItems = await getAllItems();
  const lowerQuery = sanitizeSearchInput(query, true).toLowerCase();
  if (!lowerQuery) return allItems;
  
  return allItems.filter(item => 
    item.title.toLowerCase().includes(lowerQuery) ||
    item.description.toLowerCase().includes(lowerQuery) ||
    item.category.toLowerCase().includes(lowerQuery) ||
    item.location.toLowerCase().includes(lowerQuery)
  );
};
