import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  subscribeToUserChats, 
  subscribeToMessages, 
  sendMessage, 
  createChat, 
  joinChat,
  markMessagesAsRead,
  leaveChat,
  type Chat,
  type Message
} from '../services/chatService';
import { createNotification } from '../services/notificationService';
import { Button, Input } from '../components/UI';

interface ChatViewProps {
  itemId?: string;
  itemTitle?: string;
  itemOwnerId?: string;
  chatId?: string; // New prop for selecting specific chat
  onClose?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ 
  itemId, 
  itemTitle, 
  itemOwnerId,
  chatId,
  onClose 
}) => {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatItemId, setNewChatItemId] = useState('');
  const [newChatItemTitle, setNewChatItemTitle] = useState('');
  const [leavingChatIds, setLeavingChatIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Use ref for leaving set to ensure subscription callback always has latest
  const leavingChatIdsRef = useRef<Set<string>>(new Set());
  
  // Track last leave operation time to prevent race conditions
  const lastLeaveTimeRef = useRef<number>(0);

  // Define handleCreateChat before useEffect that calls it
  const handleCreateChat = useCallback(async (itemId: string, itemTitle: string) => {
    if (!user) return;
    
    try {
      const chatId = await createChat(itemId, itemTitle, user.uid, user.displayName || 'Anonymous');
      
      // If there's an item owner, add them as a participant too
      if (itemOwnerId && itemOwnerId !== user.uid) {
        await joinChat(chatId, itemOwnerId, 'Item Owner');
      }
      
      // Chat will be added to list via subscription
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  }, [user, itemOwnerId]);

  // Load user's chats
  useEffect(() => {
    if (!user) return;
    
    const unsubscribe = subscribeToUserChats(user.uid, (userChats) => {
      // Always use the ref to get the latest leaving set
      const currentLeavingIds = leavingChatIdsRef.current;
      
      // Filter out chats that are currently being left
      const filteredChats = userChats.filter(chat => {
        const isLeaving = currentLeavingIds.has(chat.id!);
        if (isLeaving) {
          console.log(`Filtering out chat ${chat.id} - currently being left`);
        }
        return !isLeaving;
      });
      
      // Check if we recently left a chat (within last 5 seconds)
      const recentlyLeft = Date.now() - lastLeaveTimeRef.current < 5000;
      
      // Only update state if:
      // 1. We're not in the middle of a leave operation, OR
      // 2. The new chat list is different from current (someone else added/removed a chat)
      if (!recentlyLeft || filteredChats.length !== chats.length) {
        console.log(`Updating chats: ${filteredChats.length} chats (recentlyLeft: ${recentlyLeft})`);
        setChats(filteredChats);
      } else {
        console.log('Ignoring subscription update during leave operation');
      }
      
      // If chatId is provided (from notification), select that chat
      if (chatId) {
        const targetChat = userChats.find(c => c.id === chatId);
        if (targetChat && !currentLeavingIds.has(targetChat.id!)) {
          setActiveChat(targetChat);
        }
      }
      // If itemId is provided, find or create chat for this item
      else if (itemId && itemTitle && currentLeavingIds.size === 0) {
        const existingChat = userChats.find(c => c.itemId === itemId);
        if (existingChat && !currentLeavingIds.has(existingChat.id!)) {
          setActiveChat(existingChat);
        } else if (currentLeavingIds.size === 0) {
          handleCreateChat(itemId, itemTitle);
        }
      }
    });
    
    return () => unsubscribe();
  }, [user, itemId, itemTitle, chatId, handleCreateChat, chats.length]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChat || !user) return;
    
    const unsubscribe = subscribeToMessages(activeChat.id!, (chatMessages) => {
      setMessages(chatMessages);
      // Mark messages as read
      markMessagesAsRead(activeChat.id!, user.uid);
    });
    
    return () => unsubscribe();
  }, [activeChat, user]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || !user || !newMessage.trim()) return;
    
    setLoading(true);
    try {
      await sendMessage(
        activeChat.id!,
        user.uid,
        user.displayName || 'Anonymous',
        newMessage.trim()
      );
      
      // Notify other participants
      const participantIds = Object.keys(activeChat.participants);
      for (const participantId of participantIds) {
        if (participantId !== user.uid) {
          try {
            await createNotification({
              userId: participantId,
              title: `New message from ${user.displayName || 'Anonymous'}`,
              message: newMessage.trim().substring(0, 100),
              type: 'chat_message',
              relatedChatId: activeChat.id,
              relatedItemId: activeChat.itemId,
            });
          } catch (notifError) {
            console.error('Failed to create notification:', notifError);
          }
        }
      }
      
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'read':
        return 'done_all'; // Double checkmark for read
      case 'delivered':
        return 'done'; // Single check for delivered
      case 'sent':
      default:
        return 'check'; // Single check for sent
    }
  };

  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newChatItemId.trim() || !newChatItemTitle.trim()) return;
    
    try {
      await createChat(newChatItemId.trim(), newChatItemTitle.trim(), user.uid, user.displayName || 'Anonymous');
      setNewChatItemId('');
      setNewChatItemTitle('');
      setShowNewChat(false);
      // The new chat will appear in the list via subscription
    } catch (err) {
      console.error('Error creating chat:', err);
    }
  };

  const handleLeaveChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || leavingChatIdsRef.current.has(chatId)) return;
    
    if (!confirm('Leave this conversation? The chat will remain for other participants.')) return;
    
    console.log(`Starting leave process for chat ${chatId}`);
    
    // Record leave time to prevent race conditions
    lastLeaveTimeRef.current = Date.now();
    
    // Update the leaving set (both ref and state)
    const newSet = new Set(leavingChatIdsRef.current);
    newSet.add(chatId);
    leavingChatIdsRef.current = newSet;
    setLeavingChatIds(newSet);
    
    // OPTIMISTIC UPDATE: Remove chat from local state immediately
    setChats(prevChats => prevChats.filter(chat => chat.id !== chatId));
    
    // Clear active chat if it's the one being left
    if (activeChat?.id === chatId) {
      setActiveChat(null);
      setMessages([]);
    }
    
    try {
      await leaveChat(chatId, user.uid);
      console.log(`Successfully left chat ${chatId}`);
      
      // Keep in leaving set for 5 seconds to handle any delayed subscription updates
      setTimeout(() => {
        console.log(`Removing chat ${chatId} from leaving set`);
        const finalSet = new Set(leavingChatIdsRef.current);
        finalSet.delete(chatId);
        leavingChatIdsRef.current = finalSet;
        setLeavingChatIds(finalSet);
      }, 5000);
      
    } catch (err) {
      console.error('Error leaving chat:', err);
      alert('Failed to leave chat. Please try again.');
      
      // Reset on error
      const errorSet = new Set(leavingChatIdsRef.current);
      errorSet.delete(chatId);
      leavingChatIdsRef.current = errorSet;
      setLeavingChatIds(errorSet);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Please sign in to use chat</p>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white rounded-xl shadow-soft overflow-hidden">
      {/* Chat List Sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <span className="material-icons text-primary">chat</span>
            Messages
          </h2>

          <button
            onClick={() => setShowNewChat(!showNewChat)}
            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="Start new chat"
          >
            <span className="material-icons">add</span>
          </button>
        </div>

        {/* New Chat Form */}
        {showNewChat && (
          <div className="p-4 border-b border-gray-200 bg-blue-50">
            <form onSubmit={handleStartNewChat} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={newChatItemId}
                  onChange={(e) => setNewChatItemId(e.target.value)}
                  placeholder="Item ID (e.g., item_123)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none bg-white text-gray-900"
                  required
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newChatItemTitle}
                  onChange={(e) => setNewChatItemTitle(e.target.value)}
                  placeholder="Item name/title"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none bg-white text-gray-900"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
                >
                  Start Chat
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewChat(false)}
                  className="px-3 py-2 text-gray-600 hover:text-gray-800 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No conversations yet
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                className={`group w-full p-4 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  activeChat?.id === chat.id ? 'bg-blue-50 border-l-4 border-l-primary' : ''
                }`}
              >
                <button
                  onClick={() => setActiveChat(chat)}
                  className="w-full text-left"
                >
                  <h3 className="font-medium text-gray-800 truncate">{chat.itemTitle}</h3>
                  <p className="text-sm text-gray-500 truncate mt-1">
                    {chat.lastMessage?.content || 'No messages yet'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {chat.lastMessage?.timestamp 
                      ? formatTime(chat.lastMessage.timestamp)
                      : formatTime(chat.createdAt)
                    }
                  </p>
                </button>
                <button
                  onClick={(e) => handleLeaveChat(chat.id!, e)}
                  disabled={leavingChatIds.has(chat.id!)}
                  className={`mt-2 text-xs flex items-center gap-1 transition-opacity ${
                    leavingChatIds.has(chat.id!) 
                      ? 'text-gray-400 cursor-not-allowed' 
                      : 'text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100'
                  }`}
                  title={leavingChatIds.has(chat.id!) ? 'Leaving...' : 'Leave chat'}
                >
                  <span className="material-icons text-sm">
                    {leavingChatIds.has(chat.id!) ? 'hourglass_empty' : 'exit_to_app'}
                  </span>
                  {leavingChatIds.has(chat.id!) ? 'Leaving...' : 'Leave'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 flex flex-col">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">{activeChat.itemTitle}</h3>
                <p className="text-xs text-gray-500">
                  {Object.keys(activeChat.participants).length} participants
                </p>
              </div>
              {onClose && (
                <button 
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <span className="material-icons">close</span>
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <span className="material-icons text-4xl mb-2">chat_bubble_outline</span>
                    <p>Start the conversation!</p>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.senderId === user.uid ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                        message.senderId === user.uid
                          ? 'bg-primary text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}
                    >
                      <p className="text-xs font-medium mb-1 opacity-75">
                        {message.senderName}
                      </p>
                      <p className="text-sm">{message.content}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-xs opacity-60">
                          {formatTime(message.timestamp)}
                        </span>
                        {message.senderId === user?.uid && (
                          <span className="material-icons text-xs opacity-80">
                            {getStatusIcon(message.status)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button 
                  type="submit" 
                  disabled={loading || !newMessage.trim()}
                  className="px-4"
                >
                  {loading ? (
                    <span className="material-icons animate-spin text-sm">refresh</span>
                  ) : (
                    <span className="material-icons text-sm">send</span>
                  )}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <span className="material-icons text-6xl mb-4">chat</span>
              <p className="text-lg">Select a conversation to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
