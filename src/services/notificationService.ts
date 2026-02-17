import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
  deleteDoc,
  writeBatch,
  Timestamp 
} from 'firebase/firestore';

import { db } from './firebase';

export interface Notification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  type: 'item_match' | 'chat_message' | 'status_update' | 'system';
  read: boolean;
  createdAt: string;
  relatedItemId?: string;
  relatedChatId?: string;
}

// Create a new notification
export const createNotification = async (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>): Promise<string> => {
  const docRef = await addDoc(collection(db, 'notifications'), {
    ...notification,
    read: false,
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
};

// Get real-time notifications for a user
export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: Notification[]) => void
) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const notifications: Notification[] = [];
    snapshot.forEach((doc) => {
      notifications.push({
        id: doc.id,
        ...doc.data(),
      } as Notification);
    });
    callback(notifications);
  });
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  await updateDoc(doc(db, 'notifications', notificationId), {
    read: true,
  });
};

// Mark all notifications as read for a user
export const markAllNotificationsAsRead = async (userId: string): Promise<void> => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  
  const snapshot = await getDocs(q);
  const batch: Promise<void>[] = [];
  
  snapshot.forEach((document) => {

    batch.push(updateDoc(doc(db, 'notifications', document.id), { read: true }));
  });
  
  await Promise.all(batch);
};

// Get unread count
export const getUnreadCount = async (userId: string): Promise<number> => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.size;
};

// Clear all notifications for a user
export const clearAllNotifications = async (userId: string): Promise<void> => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId)
  );
  
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  
  snapshot.forEach((document) => {
    batch.delete(doc(db, 'notifications', document.id));
  });
  
  await batch.commit();
};
