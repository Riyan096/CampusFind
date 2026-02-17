/**
 * Chat Service
 * Handles real-time messaging between users
 */

import { 
  ref, 
  push, 
  set, 
  onValue, 
  off,
  update,
  serverTimestamp,
  query,
  orderByChild,
  get,
  remove
} from 'firebase/database';

import { realtimeDb } from './firebase';
import { emailService } from './emailService';

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
}

// Create a new chat for an item
export const createChat = async (
  itemId: string, 
  itemTitle: string, 
  userId: string, 
  userName: string
): Promise<string> => {
  const chatRef = push(ref(realtimeDb, 'chats'));
  const chatId = chatRef.key!;
  
  await set(chatRef, {
    itemId,
    itemTitle,
    participants: {
      [userId]: {
        name: userName,
        joinedAt: serverTimestamp(),
      },
    },
    createdAt: serverTimestamp(),
  });
  
  return chatId;
};

// Join an existing chat
export const joinChat = async (
  chatId: string, 
  userId: string, 
  userName: string
): Promise<void> => {
  const participantRef = ref(realtimeDb, `chats/${chatId}/participants/${userId}`);
  await set(participantRef, {
    name: userName,
    joinedAt: serverTimestamp(),
  });
};

// Send a message
export const sendMessage = async (
  chatId: string,
  senderId: string,
  senderName: string,
  content: string
): Promise<void> => {
  const messageRef = push(ref(realtimeDb, `chats/${chatId}/messages`));
  
  const messageData = {
    senderId,
    senderName,
    content,
    timestamp: serverTimestamp(),
    read: false,
    status: 'sent',
    readBy: {},
  };

  
  await set(messageRef, messageData);
  
  // Update last message in chat
  const chatRef = ref(realtimeDb, `chats/${chatId}/lastMessage`);
  await set(chatRef, {
    content: content.substring(0, 100), // Truncate long messages
    timestamp: serverTimestamp(),
    senderId,
  });

  // Send email notification to other participants
  const chat = await getChat(chatId);
  if (chat) {
    const participantIds = Object.keys(chat.participants).filter(id => id !== senderId);
    
    // Send email notification to each participant (async, don't wait)
    for (const participantId of participantIds) {
      emailService.sendNewMessageNotification(
        participantId,
        senderName,
        content,
        chatId
      ).catch(err => console.error('Failed to send email notification:', err));
    }
  }
};

// Subscribe to messages in a chat
export const subscribeToMessages = (
  chatId: string,
  callback: (messages: Message[]) => void
) => {
  const messagesRef = ref(realtimeDb, `chats/${chatId}/messages`);
  const messagesQuery = query(messagesRef, orderByChild('timestamp'));
  
  onValue(messagesQuery, (snapshot) => {
    const messages: Message[] = [];
    snapshot.forEach((childSnapshot) => {
      messages.push({
        id: childSnapshot.key!,
        chatId,
        ...childSnapshot.val(),
      });
    });
    // Sort by timestamp ascending
    messages.sort((a, b) => a.timestamp - b.timestamp);
    callback(messages);
  });
  
  // Return unsubscribe function
  return () => off(messagesRef);
};

// Subscribe to user's chats
export const subscribeToUserChats = (
  userId: string,
  callback: (chats: Chat[]) => void
) => {
  const chatsRef = ref(realtimeDb, 'chats');
  
  onValue(chatsRef, (snapshot) => {
    const chats: Chat[] = [];
    snapshot.forEach((childSnapshot) => {
      const chat = childSnapshot.val();
      // Only include chats where user is a participant
      if (chat.participants && chat.participants[userId]) {
        chats.push({
          id: childSnapshot.key!,
          ...chat,
        });
      }
    });
    // Sort by last message timestamp descending
    chats.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
    callback(chats);
  });
  
  return () => off(chatsRef);
};

// Get a single chat by ID
export const getChat = async (chatId: string): Promise<Chat | null> => {
  const chatRef = ref(realtimeDb, `chats/${chatId}`);
  const snapshot = await get(chatRef);
  if (snapshot.exists()) {
    return {
      id: chatId,
      ...snapshot.val(),
    };
  }
  return null;
};

// Mark messages as read
export const markMessagesAsRead = async (chatId: string, userId: string): Promise<void> => {
  const messagesRef = ref(realtimeDb, `chats/${chatId}/messages`);
  const snapshot = await get(messagesRef);
  
  const updates: { [key: string]: any } = {};
  snapshot.forEach((childSnapshot) => {
    const message = childSnapshot.val();
    if (message.senderId !== userId && !message.readBy?.[userId]) {
      updates[`${childSnapshot.key}/read`] = true;
      updates[`${childSnapshot.key}/status`] = 'read';
      updates[`${childSnapshot.key}/readBy/${userId}`] = serverTimestamp();
    }
  });
  
  if (Object.keys(updates).length > 0) {
    await update(messagesRef, updates);
  }
};


// Delete a chat (completely remove for all participants)
export const deleteChat = async (chatId: string): Promise<void> => {
  const chatRef = ref(realtimeDb, `chats/${chatId}`);
  await remove(chatRef);
};

// Leave a chat (remove current user from participants only)
export const leaveChat = async (chatId: string, userId: string): Promise<void> => {
  const participantRef = ref(realtimeDb, `chats/${chatId}/participants/${userId}`);
  await remove(participantRef);
};
