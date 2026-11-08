/**
 * Firestore-backed chat service.
 * This keeps chat available on Firebase Spark without Cloud Functions.
 */

import {
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from './firebase';
import { LIMITS, sanitizeFirestoreDocId, sanitizePlainText } from '../utils/sanitize';

export interface Message {
  id?: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  read: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  readBy?: { [userId: string]: number };
}

export interface Chat {
  id?: string;
  itemId: string;
  itemTitle: string;
  createdBy: string;
  participantIds: string[];
  participants: {
    [userId: string]: {
      name: string;
      joinedAt: number;
    };
  };
  createdAt: number;
  lastMessage?: {
    content: string;
    timestamp: number;
    senderId: string;
  };
  lastReadAt?: { [userId: string]: number };
}

type FirestoreTimestamp = { toMillis?: () => number; seconds?: number } | number | null | undefined;

const toMillis = (value: FirestoreTimestamp): number => {
  if (typeof value === 'number') return value;
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const normalizeChat = (id: string, data: Record<string, any>): Chat => {
  const participants: Chat['participants'] = {};
  Object.entries(data.participants || {}).forEach(([uid, participant]) => {
    const value = participant as Record<string, any>;
    participants[uid] = {
      name: typeof value.name === 'string' ? value.name : 'Anonymous',
      joinedAt: toMillis(value.joinedAt),
    };
  });

  const lastMessage = data.lastMessage
    ? {
        content: typeof data.lastMessage.content === 'string' ? data.lastMessage.content : '',
        timestamp: toMillis(data.lastMessage.timestamp),
        senderId: typeof data.lastMessage.senderId === 'string' ? data.lastMessage.senderId : '',
      }
    : undefined;

  const lastReadAt: Record<string, number> = {};
  Object.entries(data.lastReadAt || {}).forEach(([uid, timestamp]) => {
    lastReadAt[uid] = toMillis(timestamp as FirestoreTimestamp);
  });

  return {
    id,
    itemId: data.itemId,
    itemTitle: data.itemTitle,
    createdBy: data.createdBy,
    participantIds: Array.isArray(data.participantIds) ? data.participantIds : [],
    participants,
    createdAt: toMillis(data.createdAt),
    ...(lastMessage ? { lastMessage } : {}),
    lastReadAt,
  };
};

const normalizeMessage = (id: string, chatId: string, data: Record<string, any>): Message => {
  const readBy: Record<string, number> = {};
  Object.entries(data.readBy || {}).forEach(([uid, timestamp]) => {
    readBy[uid] = toMillis(timestamp as FirestoreTimestamp);
  });

  return {
    id,
    chatId,
    senderId: data.senderId,
    senderName: data.senderName,
    content: data.content,
    timestamp: toMillis(data.timestamp),
    read: data.read === true,
    status: data.status,
    readBy,
  };
};

/**
 * Create or return the signed-in user's conversation for an item.
 * The actual item owner is read from Firestore; security rules independently
 * verify that owner when accepting the chat document.
 */
export const createChat = async (
  itemId: string,
  userId: string,
  userName: string
): Promise<Chat> => {
  const safeItemId = sanitizeFirestoreDocId(itemId);
  if (!safeItemId) throw new Error('A valid item ID is required.');

  const itemSnapshot = await getDoc(doc(db, 'items', safeItemId));
  if (!itemSnapshot.exists()) throw new Error('That item could not be found.');

  const item = itemSnapshot.data();
  const ownerId = item.reportedBy;
  if (typeof ownerId !== 'string' || !ownerId) {
    throw new Error('This item does not have a valid owner.');
  }
  if (ownerId === userId) {
    throw new Error('You cannot start a conversation about your own item.');
  }

  const existingQuery = query(
    collection(db, 'chats'),
    where('participantIds', 'array-contains', userId)
  );
  const existingSnapshot = await getDocs(existingQuery);
  const existing = existingSnapshot.docs.find((entry) => entry.data().itemId === safeItemId);
  if (existing) return normalizeChat(existing.id, existing.data());

  const ownerProfile = await getDoc(doc(db, 'publicProfiles', ownerId));
  const ownerName = ownerProfile.exists() && typeof ownerProfile.data().displayName === 'string'
    ? ownerProfile.data().displayName
    : 'Item owner';
  const safeUserName = sanitizePlainText(userName, LIMITS.displayName, { multiline: false });
  const safeOwnerName = sanitizePlainText(ownerName, LIMITS.displayName, { multiline: false });
  const safeTitle = sanitizePlainText(
    typeof item.title === 'string' ? item.title : 'Untitled item',
    LIMITS.title,
    { multiline: false }
  );

  const chatRef = await addDoc(collection(db, 'chats'), {
    itemId: safeItemId,
    itemTitle: safeTitle,
    createdBy: userId,
    participantIds: [userId, ownerId],
    participants: {
      [userId]: { name: safeUserName || 'Anonymous', joinedAt: serverTimestamp() },
      [ownerId]: { name: safeOwnerName || 'Item owner', joinedAt: serverTimestamp() },
    },
    createdAt: serverTimestamp(),
  });

  const now = Date.now();
  return {
    id: chatRef.id,
    itemId: safeItemId,
    itemTitle: safeTitle,
    createdBy: userId,
    participantIds: [userId, ownerId],
    participants: {
      [userId]: { name: safeUserName || 'Anonymous', joinedAt: now },
      [ownerId]: { name: safeOwnerName || 'Item owner', joinedAt: now },
    },
    createdAt: now,
  };
};

/** Subscribe to every conversation in which this user is a participant. */
export const subscribeToUserChats = (
  userId: string,
  callback: (chats: Chat[]) => void
) => {
  const chatsQuery = query(
    collection(db, 'chats'),
    where('participantIds', 'array-contains', userId)
  );

  return onSnapshot(
    chatsQuery,
    (snapshot) => {
      // Estimate pending server timestamps locally so a newly sent message
      // doesn't temporarily sort its conversation to the bottom of the list.
      const chats = snapshot.docs.map((entry) =>
        normalizeChat(entry.id, entry.data({ serverTimestamps: 'estimate' }))
      );
      chats.sort((a, b) =>
        (b.lastMessage?.timestamp || b.createdAt) - (a.lastMessage?.timestamp || a.createdAt)
      );
      callback(chats);
    },
    (error) => console.error('Unable to load conversations:', error)
  );
};

/** Subscribe to real-time messages in a conversation. */
export const subscribeToMessages = (
  chatId: string,
  callback: (messages: Message[]) => void
) => {
  const messagesQuery = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('timestamp', 'asc')
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => callback(
      snapshot.docs.map((entry) => normalizeMessage(entry.id, chatId, entry.data()))
    ),
    (error) => console.error('Unable to load chat messages:', error)
  );
};

/** Add a message and update the conversation preview atomically. */
export const sendMessage = async (
  chatId: string,
  senderId: string,
  senderName: string,
  content: string
): Promise<string> => {
  const safeName = sanitizePlainText(senderName, LIMITS.displayName, { multiline: false });
  const safeContent = sanitizePlainText(content, LIMITS.chatMessage, { multiline: true });
  if (!safeContent) throw new Error('Message cannot be empty.');

  const chatRef = doc(db, 'chats', chatId);
  const chatSnapshot = await getDoc(chatRef);
  if (!chatSnapshot.exists()) throw new Error('This conversation no longer exists.');

  const chatData = chatSnapshot.data();
  if (!Array.isArray(chatData.participantIds) || !chatData.participantIds.includes(senderId)) {
    throw new Error('You are no longer a participant in this conversation.');
  }

  const recipientId = chatData.participantIds.find((participantId: string) => participantId !== senderId);
  const messageRef = doc(collection(chatRef, 'messages'));
  const batch = writeBatch(db);

  batch.set(messageRef, {
    senderId,
    senderName: safeName || 'Anonymous',
    content: safeContent,
    timestamp: serverTimestamp(),
    read: false,
    status: 'sent',
    readBy: {},
  });
  batch.update(chatRef, {
    lastMessage: {
      content: safeContent.substring(0, 100),
      timestamp: serverTimestamp(),
      senderId,
    },
  });

  await batch.commit();

  // Notification delivery is best-effort and must never make a successfully
  // sent chat message appear to have failed.
  if (recipientId && typeof chatData.itemId === 'string') {
    try {
      const notificationRef = doc(collection(db, 'notifications'));
      await setDoc(notificationRef, {
        userId: recipientId,
        title: `New message from ${safeName || 'Anonymous'}`,
        message: safeContent.substring(0, 120),
        type: 'chat_message',
        read: false,
        createdAt: serverTimestamp(),
        relatedItemId: chatData.itemId,
        relatedChatId: chatId,
        relatedMessageId: messageRef.id,
      });
    } catch (notificationError) {
      console.error('Message sent, but notification creation failed:', notificationError);
    }
  }

  return messageRef.id;
};

/** Mark messages from other participants as read by the current user. */
export const markMessagesAsRead = async (chatId: string, userId: string): Promise<void> => {
  const snapshot = await getDocs(collection(db, 'chats', chatId, 'messages'));
  const updates = snapshot.docs
    .filter((entry) => {
      const message = entry.data();
      return message.senderId !== userId && !message.readBy?.[userId];
    })
    .map((entry) => updateDoc(entry.ref, {
      read: true,
      status: 'read',
      [`readBy.${userId}`]: serverTimestamp(),
    }));

  await Promise.all(updates);
};

/** Record that the current participant has viewed the latest message in this chat. */
export const markChatAsRead = async (chatId: string, userId: string): Promise<void> => {
  await updateDoc(doc(db, 'chats', chatId), {
    [`lastReadAt.${userId}`]: serverTimestamp(),
  });
};

/** Leave a conversation without deleting it for the other participant. */
export const leaveChat = async (chatId: string, userId: string): Promise<void> => {
  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, {
    participantIds: arrayRemove(userId),
    [`participants.${userId}`]: deleteField(),
  });
};

/** Delete a conversation. Firestore rules restrict this to its creator. */
export const deleteChat = async (chatId: string): Promise<void> => {
  await deleteDoc(doc(db, 'chats', chatId));
};
