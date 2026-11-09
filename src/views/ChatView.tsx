import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  subscribeToUserChats, 
  subscribeToMessages, 
  sendMessage, 
  createChat, 
  markMessagesAsRead,
  markChatAsRead,
  leaveChat,
  updateChatUserSettings,
  type Chat,
  type Message
} from '../services/chatService';
import { Button, Input } from '../components/UI';
import { LIMITS, sanitizeFirestoreDocId, sanitizePlainText } from '../utils/sanitize';
import { markChatNotificationsAsRead } from '../services/notificationService';
import { auth } from '../services/firebase';
import { AuthenticatedChatImage } from '../components/AuthenticatedChatImage';
import type { ImageAttachment } from '../services/chatService';

const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  chatId,
  onClose 
}) => {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [sendingImage, setSendingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaWorkerUrl = (import.meta.env.VITE_MEDIA_WORKER_URL || 'http://localhost:8787').replace(/\/$/, '');

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setImagePreviewUrl(null);
    setImageError('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleImageSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_CHAT_IMAGE_TYPES.includes(file.type)) {
      setSelectedImage(null);
      setImagePreviewUrl(null);
      setImageError('Choose a JPEG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size === 0 || file.size > MAX_CHAT_IMAGE_BYTES) {
      setSelectedImage(null);
      setImagePreviewUrl(null);
      setImageError('Images must be smaller than 8 MB.');
      event.target.value = '';
      return;
    }

    setImageError('');
    setSelectedImage(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };
  const [loading, setLoading] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showArchivedChats, setShowArchivedChats] = useState(false);
  const [openChatMenuId, setOpenChatMenuId] = useState<string | null>(null);
  const [newChatItemId, setNewChatItemId] = useState('');
  const [newChatItemTitle, setNewChatItemTitle] = useState('');
  const [leavingChatIds, setLeavingChatIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Prevent chat-list snapshots from repeatedly overriding the user's manual selection.
  const lastAutoOpenedItemIdRef = useRef<string | null>(null);
  
  // Use ref for leaving set to ensure subscription callback always has latest
  const leavingChatIdsRef = useRef<Set<string>>(new Set());
  
  // Track last leave operation time to prevent race conditions
  const lastLeaveTimeRef = useRef<number>(0);

  // Define handleCreateChat before useEffect that calls it
  const handleCreateChat = useCallback(async (itemId: string) => {
    if (!user) return;
    
    try {
      const createdChat = await createChat(itemId, user.uid, user.displayName || 'Anonymous');
      setActiveChat(createdChat);
      
      // Chat will be added to list via subscription
    } catch (error: unknown) {
      console.error('Error creating chat:', error);
      const message = error instanceof Error
        ? error.message
        : 'Unable to create chat. Check Firebase Realtime Database rules.';
      alert(message);
    }
  }, [user]);

  // Close the chat options menu when clicking anywhere outside it or pressing Escape.
  useEffect(() => {
    if (!openChatMenuId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      // Each chat row has its own menu root. A single React ref inside the
      // mapped list points only to the last row, which can close other rows'
      // menus before their action button receives its click.
      if (!(target instanceof Element) || !target.closest('[data-chat-menu-root]')) {
        setOpenChatMenuId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenChatMenuId(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openChatMenuId]);

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
      
      // A notification target takes priority and is selected when its chat appears.
      if (chatId) {
        const targetChat = userChats.find(c => c.id === chatId);
        if (targetChat && !currentLeavingIds.has(targetChat.id!) && activeChat?.id !== targetChat.id) {
          setActiveChat(targetChat);
        }
      }
      // Auto-open an item conversation only once per item. Later chat-list
      // snapshots (for example after sending a message) must not override
      // a conversation the user has manually selected.
      else if (
        itemId &&
        itemTitle &&
        currentLeavingIds.size === 0 &&
        lastAutoOpenedItemIdRef.current !== itemId
      ) {
        lastAutoOpenedItemIdRef.current = itemId;
        const existingChat = userChats.find(c => c.itemId === itemId);
        if (existingChat && !currentLeavingIds.has(existingChat.id!)) {
          setActiveChat(existingChat);
        } else {
          handleCreateChat(itemId);
        }
      }
    });
    
    return () => unsubscribe();
  }, [user, itemId, itemTitle, chatId, handleCreateChat, chats.length, activeChat?.id]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChat || !user) return;
    
    const unsubscribe = subscribeToMessages(activeChat.id!, (chatMessages) => {
      setMessages(chatMessages);
      // Mark messages as read
      markMessagesAsRead(activeChat.id!, user.uid);
      markChatAsRead(activeChat.id!, user.uid).catch((error) =>
        console.error('Unable to update chat read status:', error)
      );
      markChatNotificationsAsRead(user.uid, activeChat.id!).catch((error) =>
        console.error('Unable to mark chat notifications as read:', error)
      );
    });
    
    return () => unsubscribe();
  }, [activeChat, user]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat?.id || !user || (!newMessage.trim() && !selectedImage)) return;

    const safeContent = sanitizePlainText(newMessage, LIMITS.chatMessage, { multiline: true });
    if (!safeContent && !selectedImage) return;

    setLoading(true);
    setSendingImage(Boolean(selectedImage));
    setImageError('');

    try {
      let attachment: ImageAttachment | undefined;

      if (selectedImage) {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Your sign-in session has expired. Please sign in again.');

        const token = await currentUser.getIdToken();
        const formData = new FormData();
        formData.append('chatId', activeChat.id);
        formData.append('file', selectedImage);

        const uploadResponse = await fetch(mediaWorkerUrl + '/api/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          body: formData,
        });
        const uploadResult = await uploadResponse.json().catch(() => ({})) as Partial<ImageAttachment> & { error?: string };
        if (!uploadResponse.ok) {
          throw new Error(uploadResult.error || 'The photo could not be uploaded. Please try again.');
        }

        if (
          typeof uploadResult.publicId !== 'string' ||
          !['jpg', 'png', 'webp'].includes(uploadResult.format || '') ||
          typeof uploadResult.bytes !== 'number' ||
          typeof uploadResult.width !== 'number' ||
          typeof uploadResult.height !== 'number'
        ) {
          throw new Error('The media service returned invalid photo information.');
        }

        attachment = {
          type: 'image',
          publicId: uploadResult.publicId,
          format: uploadResult.format as ImageAttachment['format'],
          bytes: uploadResult.bytes,
          width: uploadResult.width,
          height: uploadResult.height,
        };
      }

      await sendMessage(
        activeChat.id,
        user.uid,
        user.displayName || 'Anonymous',
        safeContent || 'Photo',
        attachment
      );

      setNewMessage('');
      clearSelectedImage();
    } catch (error) {
      console.error('Error sending chat message:', error);
      setImageError(error instanceof Error ? error.message : 'Failed to send message. Please try again.');
    } finally {
      setLoading(false);
      setSendingImage(false);
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
    if (!user) return;

    const safeItemId = sanitizeFirestoreDocId(newChatItemId);
    const safeTitle = sanitizePlainText(newChatItemTitle, LIMITS.title, { multiline: false });
    if (!safeItemId || !safeTitle) return;
    
    try {
      const createdChat = await createChat(
        safeItemId,
        user.uid,
        user.displayName || 'Anonymous'
      );
      setActiveChat(createdChat);
      setNewChatItemId('');
      setNewChatItemTitle('');
      setShowNewChat(false);
      // The new chat will appear in the list via subscription
    } catch (err) {
      console.error('Error creating chat:', err);
    }
  };

  const handleChatSettingToggle = async (
    chat: Chat,
    setting: 'pinned' | 'muted' | 'archived',
    value: boolean,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!user || !chat.id) return;
    try {
      await updateChatUserSettings(chat.id, user.uid, { [setting]: value });
      // An unarchived conversation no longer belongs in the Archived filter.
      // Switch back to Active so the user can immediately see the restored chat.
      if (setting === 'archived' && value === false) {
        setShowArchivedChats(false);
      }
    } catch (error) {
      console.error(`Unable to update chat ${setting} setting:`, error);
      alert(`Unable to update this chat. Please try again.`);
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

          <div className="flex items-center gap-1">
          <button
            onClick={() => setShowArchivedChats((current) => !current)}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${showArchivedChats ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-200'}`}
            title={showArchivedChats ? 'Show active chats' : 'Show archived chats'}
          >
            {showArchivedChats ? 'Active' : 'Archived'}
          </button>
          <button
            onClick={() => setShowNewChat(!showNewChat)}
            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="Start new chat"
          >
            <span className="material-icons">add</span>
          </button>
          </div>
        </div>

        {/* New Chat Form */}
        {showNewChat && (
          <div className="p-4 border-b border-gray-200 bg-blue-50">
            <form onSubmit={handleStartNewChat} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={newChatItemId}
                  onChange={(e) => setNewChatItemId(sanitizeFirestoreDocId(e.target.value))}
                  placeholder="Item ID (e.g., item_123)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none bg-white text-gray-900"
                  required
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newChatItemTitle}
                  onChange={(e) =>
                    setNewChatItemTitle(
                      sanitizePlainText(e.target.value, LIMITS.title, { multiline: false, trim: false })
                    )
                  }
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
          {chats.filter((chat) => (chat.userSettings?.[user.uid]?.archived === true) === showArchivedChats).length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              {showArchivedChats ? 'No archived conversations' : 'No conversations yet'}
            </div>
          ) : (
            chats.filter((chat) => (chat.userSettings?.[user.uid]?.archived === true) === showArchivedChats).sort((a, b) => Number(b.userSettings?.[user.uid]?.pinned === true) - Number(a.userSettings?.[user.uid]?.pinned === true)).map((chat) => {
              const chatSettings = chat.userSettings?.[user.uid] || {};
              const isUnread = Boolean(
                chat.lastMessage &&
                chat.lastMessage.senderId !== user.uid &&
                chat.lastMessage.timestamp > (chat.lastReadAt?.[user.uid] || 0)
              );
              return (
              <div
                key={chat.id}
                className={`group w-full p-4 text-left border-b border-gray-100 transition-colors ${
                  isUnread
                    ? 'bg-sky-50 border-l-4 border-l-sky-500 hover:bg-sky-100'
                    : activeChat?.id === chat.id
                      ? 'bg-blue-50 border-l-4 border-l-primary'
                      : 'hover:bg-gray-50'
                }`}
              >
                <button
                  onClick={() => setActiveChat(chat)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <h3 className={`font-medium truncate ${isUnread ? 'text-gray-900' : 'text-gray-800'}`}>{chat.itemTitle}</h3>
                    {isUnread && <span className="w-2.5 h-2.5 rounded-full bg-sky-600 ring-4 ring-sky-100 flex-shrink-0" title="Unread message" aria-label="Unread message" />}
                    {chatSettings.pinned && <span className="material-icons text-amber-600 text-base flex-shrink-0" title="Pinned chat" aria-label="Pinned chat">push_pin</span>}
                    {chatSettings.muted && <span className="material-icons text-indigo-600 text-base flex-shrink-0" title="Muted chat" aria-label="Muted chat">notifications_off</span>}
                  </div>
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
                <div data-chat-menu-root className="relative mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenChatMenuId((current) => current === chat.id ? null : chat.id!);
                    }}
                    className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    title="Chat options"
                    aria-label={`Options for ${chat.itemTitle}`}
                    aria-haspopup="menu"
                    aria-expanded={openChatMenuId === chat.id}
                  >
                    <span className="material-icons text-xl">more_horiz</span>
                  </button>
                  {openChatMenuId === chat.id && (
                    <div
                      role="menu"
                      className="absolute right-0 top-9 z-30 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        role="menuitem"
                        onClick={(e) => {
                          void handleChatSettingToggle(chat, 'pinned', !chatSettings.pinned, e);
                          setOpenChatMenuId(null);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="material-icons text-base text-amber-600">push_pin</span>
                        {chatSettings.pinned ? 'Unpin chat' : 'Pin chat'}
                      </button>
                      <button
                        role="menuitem"
                        onClick={(e) => {
                          void handleChatSettingToggle(chat, 'muted', !chatSettings.muted, e);
                          setOpenChatMenuId(null);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="material-icons text-base text-indigo-600">{chatSettings.muted ? 'notifications' : 'notifications_off'}</span>
                        {chatSettings.muted ? 'Unmute chat' : 'Mute chat'}
                      </button>
                      <button
                        role="menuitem"
                        onClick={(e) => {
                          void handleChatSettingToggle(chat, 'archived', !chatSettings.archived, e);
                          setOpenChatMenuId(null);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="material-icons text-base"> {chatSettings.archived ? 'unarchive' : 'archive'} </span>
                        {chatSettings.archived ? 'Unarchive chat' : 'Archive chat'}
                      </button>
                    </div>
                  )}
                </div>
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
              );
            })
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
                      {message.attachment && message.id && (
                        <AuthenticatedChatImage
                          chatId={message.chatId}
                          messageId={message.id}
                          attachment={message.attachment}
                        />
                      )}
                      {message.content && (message.content !== 'Photo' || !message.attachment) && (
                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      )}
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
              {imagePreviewUrl && selectedImage && (
                <div className="mb-3 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3">
                  <img src={imagePreviewUrl} alt="Selected photo preview" className="h-20 w-20 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{selectedImage.name}</p>
                    <p className="text-xs text-gray-500">{(selectedImage.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button type="button" onClick={clearSelectedImage} disabled={loading} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600" aria-label="Remove selected photo">
                    <span className="material-icons">close</span>
                  </button>
                </div>
              )}
              {imageError && <p role="alert" className="mb-2 text-sm text-red-600">{imageError}</p>}
              <div className="flex gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageSelection}
                  className="hidden"
                  aria-label="Choose a photo"
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={loading}
                  className="rounded-lg border border-gray-300 px-3 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Attach a photo"
                  aria-label="Attach a photo"
                >
                  <span className="material-icons">image</span>
                </button>
                <Input
                  type="text"
                  value={newMessage}
                  onChange={(e) =>
                    setNewMessage(
                      sanitizePlainText(e.target.value, LIMITS.chatMessage, {
                        multiline: false,
                        trim: false,
                      })
                    )
                  }
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button 
                  type="submit" 
                  disabled={loading || (!newMessage.trim() && !selectedImage)}
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
