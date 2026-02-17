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
import type { Item, ItemStatus } from '../types';
import { ItemType, ItemCategory, ItemStatus as StatusEnum } from '../types';

const ITEMS_COLLECTION = 'items';

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
  const docRef = await addDoc(collection(db, ITEMS_COLLECTION), {
    ...item,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

// Update an item
export const updateItemInFirestore = async (id: string, updates: Partial<Item>): Promise<void> => {
  const itemRef = doc(db, ITEMS_COLLECTION, id);
  await updateDoc(itemRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

// Update item status
export const updateItemStatusInFirestore = async (id: string, status: ItemStatus): Promise<void> => {
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
export const getItemsByStatus = async (status: ItemStatus): Promise<Item[]> => {
  const allItems = await getAllItems();
  return allItems.filter(item => item.status === status);
};

// Search items
export const searchItems = async (query: string): Promise<Item[]> => {
  const allItems = await getAllItems();
  const lowerQuery = query.toLowerCase();
  
  return allItems.filter(item => 
    item.title.toLowerCase().includes(lowerQuery) ||
    item.description.toLowerCase().includes(lowerQuery) ||
    item.category.toLowerCase().includes(lowerQuery) ||
    item.location.toLowerCase().includes(lowerQuery)
  );
};
