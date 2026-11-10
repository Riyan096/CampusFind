import React, { Suspense, useState, useEffect, useRef, useCallback } from 'react';

import { useAuth } from '../context/AuthContext';
import { 
  subscribeToUserChats, 
  subscribeToMessages, 
  subscribeToTypingUsers,
  setTypingStatus,
  subscribeToBlockedUsers,
  blockUser,
  unblockUser, 
  sendMessage, 
  createChat, 
  markMessagesAsRead,
  markChatAsRead,
  leaveChat,
  updateChatUserSettings,
  setMessageReaction,
  editMessage,
  deleteMessage,
  type Chat,
  type Message,
  type StickerMessage,
   type ReplyPreview
} from '../services/chatService';
import { Button, Input } from '../components/UI';
import { LIMITS, sanitizeFirestoreDocId, sanitizePlainText } from '../utils/sanitize';
import { markChatNotificationsAsRead } from '../services/notificationService';
import { auth } from '../services/firebase';
import { AuthenticatedChatImage } from '../components/AuthenticatedChatImage';
import type { ImageAttachment } from '../services/chatService';
import { submitUserReport, type UserReportReason } from '../services/reportService';

const EmojiPicker = React.lazy(() => import('emoji-picker-react'));

const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_CHAT_REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MAX_QUICK_REACTIONS = 8;
const isValidQuickReaction = (value: unknown): value is string =>
  typeof value === 'string' && Array.from(value).length > 0 && Array.from(value).length <= 16 &&
  !/\s/u.test(value) && /[\p{Extended_Pictographic}\p{Regional_Indicator}]|[#*0-9]\uFE0F?\u20E3/u.test(value);
const CHAT_STICKERS = [
  { id: 'happy-cat', label: 'Happy Cat', emoji: '😸', category: 'Reactions', background: 'bg-amber-100' },
  { id: 'love-birds', label: 'Sending Love', emoji: '🥰', category: 'Reactions', background: 'bg-pink-100' },
  { id: 'you-got-this', label: 'You Got This', emoji: '💪', category: 'Reactions', background: 'bg-orange-100' },
  { id: 'thank-you', label: 'Thank You', emoji: '🙏', category: 'Reactions', background: 'bg-violet-100' },
  { id: 'oops', label: 'Oops!', emoji: '😅', category: 'Reactions', background: 'bg-yellow-100' },
  { id: 'thinking', label: 'Thinking', emoji: '🤔', category: 'Reactions', background: 'bg-sky-100' },
  { id: 'study-mode', label: 'Study Mode', emoji: '📚', category: 'Campus', background: 'bg-blue-100' },
  { id: 'found-it', label: 'Found It!', emoji: '🎉', category: 'Campus', background: 'bg-emerald-100' },
  { id: 'coffee-break', label: 'Coffee Break', emoji: '☕', category: 'Campus', background: 'bg-orange-100' },
  { id: 'good-luck', label: 'Good Luck', emoji: '🍀', category: 'Campus', background: 'bg-green-100' },
  { id: 'wave-hello', label: 'Hello!', emoji: '👋', category: 'Everyday', background: 'bg-cyan-100' },
  { id: 'celebrate', label: 'Celebrate', emoji: '🥳', category: 'Everyday', background: 'bg-fuchsia-100' },
] as const;
const STICKER_CATEGORIES = ['All', 'Reactions', 'Campus', 'Everyday'] as const;
const GIPHY_PAGE_SIZE = 24;
const USER_REPORT_REASONS: { value: UserReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'threats', label: 'Threats or intimidation' },
  { value: 'spam', label: 'Spam or unwanted messages' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'scam', label: 'Scam or suspicious activity' },
  { value: 'other', label: 'Something else' },
];
interface GifSearchResult { gifId: string; title: string; url: string; previewUrl: string; }

interface ChatViewProps {
  itemId?: string;
  itemTitle?: string;
  itemOwnerId?: string;
  chatId?: string; // New prop for selecting specific chat
  onClose?: () => void;
}

const GiphyChatGif: React.FC<{ gifId: string }> = ({ gifId }) => {
  const [mediaState, setMediaState] = useState<{ gifId: string; mediaUrl: string; failed: boolean }>({
    gifId,
    mediaUrl: '',
    failed: false,
  });
  const apiKey = import.meta.env.VITE_GIPHY_API_KEY || '';

  useEffect(() => {
    const controller = new AbortController();
    if (!apiKey) return () => controller.abort();

    const params = new URLSearchParams({ api_key: apiKey, rating: 'pg' });
    fetch('https://api.giphy.com/v1/gifs/' + encodeURIComponent(gifId) + '?' + params.toString(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('GIF unavailable');
        return response.json() as Promise<{ data?: { images?: { fixed_width?: { url?: string } } } }>;
      })
      .then((payload) => {
        const url = payload.data?.images?.fixed_width?.url || '';
        if (!url.startsWith('https://media') || !url.includes('.giphy.com/')) throw new Error('GIF unavailable');
        if (!controller.signal.aborted) setMediaState({ gifId, mediaUrl: url, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setMediaState({ gifId, mediaUrl: '', failed: true });
      });
    return () => controller.abort();
  }, [gifId, apiKey]);

  const currentState = mediaState.gifId === gifId
    ? mediaState
    : { gifId, mediaUrl: '', failed: !apiKey };

  if (currentState.failed || !apiKey) return <p className="my-2 text-xs opacity-70">GIF unavailable</p>;
  if (!currentState.mediaUrl) return <div className="my-2 h-28 w-40 animate-pulse rounded-xl bg-gray-200/70" aria-label="Loading GIF" />;
  return <div className="my-2 max-w-full"><img src={currentState.mediaUrl} alt="GIF from GIPHY" loading="lazy" className="max-h-64 max-w-full rounded-xl object-contain" /><p className="mt-1 text-[10px] opacity-70">GIF via GIPHY</p></div>;
};

export const ChatView: React.FC<ChatViewProps> = ({ 
  itemId, 
  itemTitle, 
  chatId,
  onClose 
}) => {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [blockMuteChat, setBlockMuteChat] = useState<Chat | null>(null);
  const [reportChat, setReportChat] = useState<Chat | null>(null);
  const [reportReason, setReportReason] = useState<UserReportReason>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [messagingUnavailableChatId, setMessagingUnavailableChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMessageDraft, setEditMessageDraft] = useState('');
  const [editMessageSaving, setEditMessageSaving] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [stickerCategory, setStickerCategory] = useState<(typeof STICKER_CATEGORIES)[number]>('All');
  const [recentStickerIds, setRecentStickerIds] = useState<string[]>([]);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifResults, setGifResults] = useState<GifSearchResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState('');
  const [gifOffset, setGifOffset] = useState(0);
  const [gifHasMore, setGifHasMore] = useState(false);
  const [selectedGif, setSelectedGif] = useState<GifSearchResult | null>(null);
  const giphyApiKey = import.meta.env.VITE_GIPHY_API_KEY || '';
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaWorkerUrl = (import.meta.env.VITE_MEDIA_WORKER_URL || 'http://localhost:8787').replace(/\/$/, '');

  useEffect(() => {
    if (!user) {
      setRecentStickerIds([]);
      return;
    }
    try {
      const stored = localStorage.getItem(`campusfind:chat-stickers:${user.uid}`);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      setRecentStickerIds(
        Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === 'string' && CHAT_STICKERS.some((sticker) => sticker.id === id)).slice(0, 8)
          : []
      );
    } catch {
      setRecentStickerIds([]);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user) {
      setQuickReactionOptions(DEFAULT_CHAT_REACTION_OPTIONS);
      return;
    }
    try {
      const stored = localStorage.getItem(`campusfind:quick-reactions:${user.uid}`);
      const parsed: unknown = stored ? JSON.parse(stored) : null;
      const validOptions = Array.isArray(parsed)
        ? parsed.filter(isValidQuickReaction).filter((emoji, index, values) => values.indexOf(emoji) === index).slice(0, MAX_QUICK_REACTIONS)
        : [];
      setQuickReactionOptions(validOptions.length ? validOptions : DEFAULT_CHAT_REACTION_OPTIONS);
    } catch {
      setQuickReactionOptions(DEFAULT_CHAT_REACTION_OPTIONS);
    }
  }, [user?.uid]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (!showGifPicker) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (!giphyApiKey) {
        setGifResults([]);
        setGifHasMore(false);
        setGifLoading(false);
        setGifError('Add your GIPHY API key to the local .env file to enable GIF search.');
        return;
      }
      setGifLoading(true);
      setGifError('');
      try {
        const endpoint = gifSearchQuery.trim()
          ? 'https://api.giphy.com/v1/gifs/search'
          : 'https://api.giphy.com/v1/gifs/trending';
        const params = new URLSearchParams({
          api_key: giphyApiKey,
          rating: 'pg',
          limit: String(GIPHY_PAGE_SIZE),
          offset: String(gifOffset),
          lang: 'en',
        });
        if (gifSearchQuery.trim()) params.set('q', gifSearchQuery.trim().slice(0, 50));
        const response = await fetch(`${endpoint}?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 429 ? 'GIPHY rate limit reached. Wait a moment and try again.' : 'GIF search is temporarily unavailable.');
        const payload = await response.json() as {
          data?: Array<{ id?: string; title?: string; images?: { fixed_width?: { url?: string }; fixed_width_small?: { url?: string } } }>;
          meta?: { status?: number; msg?: string; response_id?: string };
        };
        if (payload.meta && payload.meta.status !== 200) {
          throw new Error(payload.meta.msg || `GIPHY returned an error (HTTP ${payload.meta.status}). Check your API key and try again.`);
        }
        const isGiphyMediaUrl = (value: string) => {
          try {
            const parsed = new URL(value);
            return parsed.protocol === 'https:' &&
              /^media[0-9]*\.giphy\.com$/i.test(parsed.hostname) &&
              parsed.pathname.startsWith('/media/') &&
              /\.(gif|webp)$/i.test(parsed.pathname);
          } catch {
            return false;
          }
        };
        const results = (payload.data || []).flatMap((entry): GifSearchResult[] => {
          const url = entry.images?.fixed_width?.url || '';
          const previewUrl = entry.images?.fixed_width?.url || url;
          if (!entry.id || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.id) || !isGiphyMediaUrl(url) || !isGiphyMediaUrl(previewUrl)) return [];
          return [{ gifId: entry.id, url, title: (entry.title || 'GIF').slice(0, 200), previewUrl }];
        });
        if (payload.data?.length && results.length === 0) {
          console.warn('GIPHY returned GIFs, but CampusFind rejected their media URL format.');
        }
        setGifResults((current) => gifOffset === 0 ? results : [...current, ...results]);
        setGifHasMore((payload.data || []).length === GIPHY_PAGE_SIZE);
      } catch (error) {
        if (!controller.signal.aborted) setGifError(error instanceof Error ? error.message : 'GIF search failed. Please try again.');
      } finally {
        if (!controller.signal.aborted) setGifLoading(false);
      }
    }, gifOffset === 0 && gifSearchQuery.trim() ? 350 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [showGifPicker, gifSearchQuery, gifOffset, giphyApiKey]);

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
  const [openReactionMessageId, setOpenReactionMessageId] = useState<string | null>(null);
  const [openMessageActionMenuId, setOpenMessageActionMenuId] = useState<string | null>(null);
  const [showFullReactionPicker, setShowFullReactionPicker] = useState(false);
  const [isCustomizingReactions, setIsCustomizingReactions] = useState(false);
  const [quickReactionOptions, setQuickReactionOptions] = useState<string[]>(DEFAULT_CHAT_REACTION_OPTIONS);
  const [openChatMenuId, setOpenChatMenuId] = useState<string | null>(null);
  const [newChatItemId, setNewChatItemId] = useState('');
  const [newChatItemTitle, setNewChatItemTitle] = useState('');
  const [leavingChatIds, setLeavingChatIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);
  const lastTypingUpdateRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);
  // Prevent chat-list snapshots from repeatedly overriding the user's manual selection.
  const lastAutoOpenedItemIdRef = useRef<string | null>(null);
  
  // Use ref for leaving set to ensure subscription callback always has latest
  const leavingChatIdsRef = useRef<Set<string>>(new Set());
  
  // Track last leave operation time to prevent race conditions
  const lastLeaveTimeRef = useRef<number>(0);
  const activeOtherUserId = activeChat?.participantIds.find((participantId) => participantId !== user?.uid) || null;
  const isActiveUserBlocked = Boolean(activeOtherUserId && blockedUserIds.has(activeOtherUserId));

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

  // Close message action menus when clicking outside or pressing Escape.
  useEffect(() => {
    if (!openMessageActionMenuId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[data-message-menu-root]')) {
        setOpenMessageActionMenuId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMessageActionMenuId(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMessageActionMenuId]);

  // Subscribe only to the active conversation's other participant typing status.
  useEffect(() => {
    if (!activeChat?.id || !user) {
      setTypingNames([]);
      return;
    }
    return subscribeToTypingUsers(activeChat.id, user.uid, setTypingNames);
  }, [activeChat?.id, user?.uid]);

  // Keep the signed-in user's private block list synchronized across chats.
  useEffect(() => {
    if (!user) {
      setBlockedUserIds(new Set());
      return;
    }
    return subscribeToBlockedUsers(user.uid, (ids) => setBlockedUserIds(new Set(ids)));
  }, [user?.uid]);

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

  const isMessagingPermissionDenied = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: unknown }).code === 'permission-denied';

  useEffect(() => {
    setMessagingUnavailableChatId(null);
    setImageError('');
    setReplyingTo(null);
    setEditingMessageId(null);
    setEditMessageDraft('');
  }, [activeChat?.id]);

  const clearTypingStatus = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    if (typingActiveRef.current && activeChat?.id && user?.uid) {
      typingActiveRef.current = false;
      lastTypingUpdateRef.current = 0;
      void setTypingStatus(activeChat.id, user.uid, user.displayName || 'Anonymous', false)
        .catch((error) => console.error('Unable to clear typing status:', error));
    }
  }, [activeChat?.id, user?.uid, user?.displayName]);

  const handleComposerChange = (value: string) => {
    setNewMessage(sanitizePlainText(value, LIMITS.chatMessage, { multiline: false, trim: false }));
    if (!activeChat?.id || !user || isActiveUserBlocked || messagingUnavailableChatId === activeChat.id) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (value.trim() && (
      !typingActiveRef.current || Date.now() - lastTypingUpdateRef.current > 4000
    )) {
      typingActiveRef.current = true;
      lastTypingUpdateRef.current = Date.now();
      void setTypingStatus(activeChat.id, user.uid, user.displayName || 'Anonymous', true)
        .catch((error) => {
          typingActiveRef.current = false;
          lastTypingUpdateRef.current = 0;
          console.error('Unable to publish typing status:', error);
        });
    }
    if (!value.trim()) {
      clearTypingStatus();
      return;
    }
    typingTimeoutRef.current = setTimeout(clearTypingStatus, 1600);
  };

  useEffect(() => {
    typingActiveRef.current = false;
    lastTypingUpdateRef.current = 0;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (activeChat?.id && user?.uid) {
        void setTypingStatus(activeChat.id, user.uid, user.displayName || 'Anonymous', false)
          .catch((error) => console.error('Unable to clear typing status:', error));
      }
      typingActiveRef.current = false;
      lastTypingUpdateRef.current = 0;
    };
  }, [activeChat?.id, user?.uid]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
  }, [activeChat?.id]);

  // Auto-follow new messages only while the reader is already near the bottom.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !activeChat?.id || !shouldAutoScrollRef.current) return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      secondFrame = window.requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [activeChat?.id, messages]);

  const scrollToLatestMessage = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    shouldAutoScrollRef.current = true;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    setShowScrollToBottom(false);
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom < 100;
    shouldAutoScrollRef.current = isNearBottom;
    setShowScrollToBottom(!isNearBottom);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat?.id || !user || (!newMessage.trim() && !selectedImage && !selectedGif)) return;

    const safeContent = sanitizePlainText(newMessage, LIMITS.chatMessage, { multiline: true });
    if (!safeContent && !selectedImage && !selectedGif) return;

    setLoading(true);
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
        safeContent || (selectedImage ? 'Photo' : 'GIF'),
        attachment,
        undefined,
        selectedGif ? { type: 'gif', provider: 'giphy', gifId: selectedGif.gifId } : undefined,
        replyingTo || undefined
      );

      setNewMessage('');
      clearSelectedImage();
      setSelectedGif(null);
      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending chat message:', error);
      if (isMessagingPermissionDenied(error) && activeChat?.id) {
        setMessagingUnavailableChatId(activeChat.id);
        setImageError('');
      } else {
        setImageError(error instanceof Error ? error.message : 'Failed to send message. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditMessage = (message: Message) => {
    if (!message.id || message.senderId !== user?.uid || message.deleted || message.attachment || message.sticker || message.gif) return;
    setEditingMessageId(message.id);
    setEditMessageDraft(message.content);
  };

  const handleCancelEditMessage = () => {
    setEditingMessageId(null);
    setEditMessageDraft('');
  };

  const handleSaveEditMessage = async (message: Message) => {
    if (!activeChat?.id || !message.id || !user || editMessageSaving) return;
    const safeDraft = sanitizePlainText(editMessageDraft, LIMITS.chatMessage, { multiline: true });
    if (!safeDraft) return;
    setEditMessageSaving(true);
    try {
      await editMessage(activeChat.id, message.id, user.uid, safeDraft);
      handleCancelEditMessage();
    } catch (error) {
      console.error('Unable to edit message:', error);
      alert(error instanceof Error ? error.message : 'Unable to edit this message. Please try again.');
    } finally {
      setEditMessageSaving(false);
    }
  };

  const handleDeleteOwnMessage = async (message: Message) => {
    if (!activeChat?.id || !message.id || !user || message.senderId !== user.uid || message.deleted) return;
    if (!confirm('Delete this message? It will be replaced with a “This message was deleted” notice for everyone.')) return;
    try {
      await deleteMessage(activeChat.id, message.id, user.uid);
      if (editingMessageId === message.id) handleCancelEditMessage();
    } catch (error) {
      console.error('Unable to delete message:', error);
      alert(error instanceof Error ? error.message : 'Unable to delete this message. Please try again.');
    }
  };

  const handleSendSticker = async (sticker: (typeof CHAT_STICKERS)[number]) => {
    if (!activeChat?.id || !user || loading || selectedImage || selectedGif) return;
    setLoading(true);
    setShowStickerPicker(false);
    try {
      const stickerMessage: StickerMessage = { type: 'sticker', stickerId: sticker.id };
      await sendMessage(
        activeChat.id,
        user.uid,
        user.displayName || 'Anonymous',
        sticker.label,
        undefined,
        stickerMessage,
        undefined,
        replyingTo || undefined
      );
      const nextRecent = [sticker.id, ...recentStickerIds.filter((id) => id !== sticker.id)].slice(0, 8);
      setReplyingTo(null);
      setRecentStickerIds(nextRecent);
      try {
        localStorage.setItem(`campusfind:chat-stickers:${user.uid}`, JSON.stringify(nextRecent));
      } catch {
        // Recent stickers still work for this session if browser storage is unavailable.
      }
    } catch (error) {
      console.error('Error sending sticker:', error);
      if (isMessagingPermissionDenied(error) && activeChat?.id) {
        setMessagingUnavailableChatId(activeChat.id);
      } else {
        alert(error instanceof Error ? error.message : 'Could not send this sticker. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const saveQuickReactionOptions = (options: string[]) => {
    const nextOptions = options.filter(isValidQuickReaction).filter((emoji, index, values) => values.indexOf(emoji) === index).slice(0, MAX_QUICK_REACTIONS);
    setQuickReactionOptions(nextOptions);
    if (user) {
      try {
        localStorage.setItem(`campusfind:quick-reactions:${user.uid}`, JSON.stringify(nextOptions));
      } catch (error) {
        console.warn('Unable to save quick reaction preferences:', error);
      }
    }
  };

  const handleReaction = async (message: Message, emoji: string) => {
    if (!activeChat?.id || !message.id || !user) return;
    try {
      await setMessageReaction(activeChat.id, message.id, user.uid, emoji);
      setOpenReactionMessageId(null);
      setShowFullReactionPicker(false);
      setIsCustomizingReactions(false);
    } catch (error) {
      console.error('Unable to update message reaction:', error);
      alert('Could not update your reaction. Please try again.');
    }
  };

  const handleReactionEmojiPick = (message: Message, emoji: string) => {
    if (!isCustomizingReactions) {
      void handleReaction(message, emoji);
      return;
    }
    if (quickReactionOptions.includes(emoji)) return;
    if (quickReactionOptions.length >= MAX_QUICK_REACTIONS) {
      alert(`You can keep up to ${MAX_QUICK_REACTIONS} quick reactions.`);
      return;
    }
    saveQuickReactionOptions([...quickReactionOptions, emoji]);
  };

  const startReply = (message: Message) => {
    if (!message.id) return;
    const type: ReplyPreview['type'] = message.attachment ? 'photo'
      : message.sticker ? 'sticker'
      : message.gif ? 'gif'
      : 'text';
    setReplyingTo({
      messageId: message.id,
      senderId: message.senderId,
      senderName: message.senderName,
      content: message.content || (type === 'photo' ? 'Photo' : type === 'gif' ? 'GIF' : 'Message'),
      type,
    });
    setShowGifPicker(false);
    setShowStickerPicker(false);
  };

  const jumpToMessage = (messageId: string) => {
    const target = document.getElementById(`chat-message-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => setHighlightedMessageId((current) => current === messageId ? null : current), 1400);
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

  const handleBlockFromActionMenu = async () => {
    if (!user || !blockMuteChat || blockActionLoading) return;
    const otherUserId = blockMuteChat.participantIds.find((participantId) => participantId !== user.uid);
    if (!otherUserId) return;

    setBlockActionLoading(true);
    try {
      await blockUser(user.uid, otherUserId);
      setBlockedUserIds((current) => new Set(current).add(otherUserId));
      setBlockMuteChat(null);
    } catch (error) {
      console.error('Unable to block user:', error);
      alert(error instanceof Error ? error.message : 'Unable to block this user. Please try again.');
    } finally {
      setBlockActionLoading(false);
    }
  };

  const handleUnblockFromActionMenu = async () => {
    if (!user || !blockMuteChat || blockActionLoading) return;
    const otherUserId = blockMuteChat.participantIds.find((participantId) => participantId !== user.uid);
    if (!otherUserId) return;

    setBlockActionLoading(true);
    try {
      await unblockUser(user.uid, otherUserId);
      setBlockedUserIds((current) => {
        const next = new Set(current);
        next.delete(otherUserId);
        return next;
      });
      setBlockMuteChat(null);
    } catch (error) {
      console.error('Unable to unblock user:', error);
      alert(error instanceof Error ? error.message : 'Unable to unblock this user. Please try again.');
    } finally {
      setBlockActionLoading(false);
    }
  };

  const handleMuteFromActionMenu = async () => {
    if (!user || !blockMuteChat?.id || blockActionLoading) return;
    const currentlyMuted = blockMuteChat.userSettings?.[user.uid]?.muted === true;
    setBlockActionLoading(true);
    try {
      await updateChatUserSettings(blockMuteChat.id, user.uid, { muted: !currentlyMuted });
      setBlockMuteChat(null);
    } catch (error) {
      console.error('Unable to update chat mute setting:', error);
      alert('Unable to update this chat. Please try again.');
    } finally {
      setBlockActionLoading(false);
    }
  };

  const handleSubmitUserReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !reportChat || reportSubmitting) return;
    const reportedUserId = reportChat.participantIds.find((participantId) => participantId !== user.uid);
    if (!reportedUserId) return;

    setReportSubmitting(true);
    try {
      await submitUserReport({
        reporterId: user.uid,
        reportedUserId,
        chatId: reportChat.id || '',
        itemId: reportChat.itemId,
        reason: reportReason,
        details: reportDetails,
      });
      setReportChat(null);
      setReportReason('harassment');
      setReportDetails('');
      alert('Your report was submitted. Thank you for helping keep CampusFind safe.');
    } catch (reportError) {
      console.error('Unable to submit user report:', reportError);
      alert(reportError instanceof Error ? reportError.message : 'Unable to submit your report. Please try again.');
    } finally {
      setReportSubmitting(false);
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
                        onClick={() => {
                          setBlockMuteChat(chat);
                          setOpenChatMenuId(null);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="material-icons text-base text-indigo-600">notifications_off</span>
                        Block or mute user…
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setReportChat(chat);
                          setReportReason('harassment');
                          setReportDetails('');
                          setOpenChatMenuId(null);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                      >
                        <span className="material-icons text-base">flag</span>
                        Report user
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
                {typingNames.length > 0 && (
                  <p className="mt-1 text-xs font-medium text-primary" aria-live="polite">
                    {typingNames.length > 1 ? 'Someone is typing…' : typingNames[0] + ' is typing…'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {onClose && (
                <button 
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <span className="material-icons">close</span>
                </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="relative min-h-0 flex-1">
              <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="h-full overflow-y-auto p-4 space-y-3">
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
                    id={`chat-message-${message.id}`}
                    className={`flex scroll-mt-4 ${message.senderId === user.uid ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl transition-shadow ${highlightedMessageId === message.id ? 'ring-2 ring-amber-400 shadow-lg' : ''} ${
                        message.senderId === user.uid
                          ? 'bg-primary text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}
                    >
                      <p className="text-xs font-medium mb-1 opacity-75">
                        {message.senderName}
                      </p>
                      {message.replyTo && (
                        <button
                          type="button"
                          onClick={() => jumpToMessage(message.replyTo!.messageId)}
                          className={`mb-2 block w-full rounded-lg border-l-4 px-3 py-2 text-left text-xs transition hover:brightness-95 ${message.senderId === user.uid ? 'border-white/70 bg-white/15 text-white' : 'border-primary bg-white text-gray-700'}`}
                          aria-label={`Jump to ${message.replyTo.senderName}'s original message`}
                        >
                          <span className="block font-semibold">{message.replyTo.senderName}</span>
                          <span className="mt-0.5 block truncate opacity-80">
                            {message.replyTo.type === 'photo' ? '📷 Photo' : message.replyTo.type === 'gif' ? 'GIF' : message.replyTo.type === 'sticker' ? `Sticker · ${message.replyTo.content}` : message.replyTo.content}
                          </span>
                        </button>
                      )}
                      {message.deleted ? (
                        <p className="py-2 text-sm italic opacity-75">This message was deleted</p>
                      ) : editingMessageId === message.id ? (
                        <div className="min-w-0 space-y-2">
                          <textarea
                            value={editMessageDraft}
                            onChange={(event) => setEditMessageDraft(sanitizePlainText(event.target.value, LIMITS.chatMessage, { multiline: true, trim: false }))}
                            rows={3}
                            maxLength={LIMITS.chatMessage}
                            aria-label="Edit message"
                            className="w-full min-w-[220px] rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={handleCancelEditMessage} disabled={editMessageSaving} className="rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-black/5 disabled:opacity-50">Cancel</button>
                            <button type="button" onClick={() => void handleSaveEditMessage(message)} disabled={editMessageSaving || !editMessageDraft.trim()} className="rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 disabled:opacity-50">{editMessageSaving ? 'Saving…' : 'Save'}</button>
                          </div>
                        </div>
                      ) : <>
                      {message.sticker ? (() => {
                        const sticker = CHAT_STICKERS.find((entry) => entry.id === message.sticker?.stickerId);
                        return sticker ? (
                          <div className="my-1 flex flex-col items-center" role="img" aria-label={sticker.label}>
                            <div className={`flex h-28 w-28 items-center justify-center rounded-3xl border-2 border-white/80 shadow-sm ${sticker.background}`}>
                              <span className="text-7xl leading-none" aria-hidden="true">{sticker.emoji}</span>
                            </div>
                            <span className="mt-1 text-xs font-semibold opacity-80">{sticker.label}</span>
                          </div>
                        ) : (
                          <p className="text-sm italic opacity-75">Sticker unavailable</p>
                        );
                      })() : null}
                      {message.gif && <GiphyChatGif gifId={message.gif.gifId} />}
                      {message.attachment && message.id && (
                        <AuthenticatedChatImage
                          chatId={message.chatId}
                          messageId={message.id}
                          attachment={message.attachment}
                        />
                      )}
                      {message.content && !message.sticker && !message.gif && (message.content !== 'Photo' || !message.attachment) && (
                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      )}
                      </>}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-xs opacity-60">
                          {formatTime(message.timestamp)}{message.edited && !message.deleted ? ' · Edited' : ''}
                        </span>
                        {message.senderId === user?.uid && (
                          <span className="material-icons text-xs opacity-80">
                            {getStatusIcon(message.status)}
                          </span>
                        )}
                      </div>
                      {!message.deleted && editingMessageId !== message.id && Object.entries(
                        Object.values(message.reactions || {}).reduce<Record<string, number>>((counts, emoji) => {
                          counts[emoji] = (counts[emoji] || 0) + 1;
                          return counts;
                        }, {})
                      ).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Object.entries(
                            Object.values(message.reactions || {}).reduce<Record<string, number>>((counts, emoji) => {
                              counts[emoji] = (counts[emoji] || 0) + 1;
                              return counts;
                            }, {})
                          ).map(([emoji, count]) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => void handleReaction(message, emoji)}
                              aria-label={`${emoji} reaction, ${count} ${count === 1 ? 'person' : 'people'}`}
                              aria-pressed={message.reactions?.[user.uid] === emoji}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                                message.reactions?.[user.uid] === emoji
                                  ? 'border-blue-400 bg-blue-100 text-blue-800'
                                  : 'border-gray-300 bg-white/80 text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span>{count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!message.deleted && editingMessageId !== message.id && (
                        <div className="relative mt-1 flex justify-end" data-message-menu-root>
                          <button
                            type="button"
                            onClick={() => setOpenMessageActionMenuId((current) => current === message.id ? null : message.id || null)}
                            className="rounded-full p-1.5 text-gray-500 opacity-60 transition hover:bg-black/5 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label="Message actions"
                            aria-haspopup="menu"
                            aria-expanded={openMessageActionMenuId === message.id}
                            title="Message actions"
                          >
                            <span className="material-icons text-lg">more_horiz</span>
                          </button>
                          {openMessageActionMenuId === message.id && (
                            <div role="menu" aria-label="Message actions" className="absolute right-0 bottom-full z-30 mb-1 min-w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-gray-800 shadow-lg">
                              <button type="button" role="menuitem" onClick={() => { startReply(message); setOpenMessageActionMenuId(null); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none">
                                <span className="material-icons text-base text-gray-500">reply</span>Reply
                              </button>
                              {message.senderId === user.uid && !message.attachment && !message.sticker && !message.gif && (
                                <button type="button" role="menuitem" onClick={() => { handleStartEditMessage(message); setOpenMessageActionMenuId(null); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none">
                                  <span className="material-icons text-base text-gray-500">edit</span>Edit
                                </button>
                              )}
                              {message.senderId === user.uid && (
                                <button type="button" role="menuitem" onClick={() => { setOpenMessageActionMenuId(null); void handleDeleteOwnMessage(message); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none">
                                  <span className="material-icons text-base">delete</span>Delete
                                </button>
                              )}
                              <button type="button" role="menuitem" onClick={() => { setOpenMessageActionMenuId(null); setOpenReactionMessageId(message.id || null); setShowFullReactionPicker(false); setIsCustomizingReactions(false); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none">
                                <span className="material-icons text-base text-gray-500">add_reaction</span>React
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {!message.deleted && openReactionMessageId === message.id && (
                        <div className="relative mt-1 w-full max-w-sm rounded-xl border border-gray-200 bg-white p-2 shadow-sm" aria-label="Choose a reaction">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-gray-600">
                              {isCustomizingReactions ? 'Customize quick reactions' : 'Quick reactions'}
                            </span>
                            <div className="flex items-center gap-2">
                              {isCustomizingReactions && (
                                <button
                                  type="button"
                                  onClick={() => saveQuickReactionOptions(DEFAULT_CHAT_REACTION_OPTIONS)}
                                  className="text-xs text-gray-500 underline hover:text-gray-800"
                                >
                                  Reset
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { setIsCustomizingReactions((value) => !value); setShowFullReactionPicker(false); }}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                {isCustomizingReactions ? 'Done' : 'Customize'}
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {quickReactionOptions.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  if (isCustomizingReactions) {
                                    if (quickReactionOptions.length > 1) saveQuickReactionOptions(quickReactionOptions.filter((entry) => entry !== emoji));
                                  } else {
                                    void handleReaction(message, emoji);
                                  }
                                }}
                                className="relative rounded-lg p-1.5 text-xl transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                aria-label={isCustomizingReactions ? `Remove ${emoji} from quick reactions` : `React with ${emoji}`}
                                title={isCustomizingReactions ? 'Remove from quick reactions' : `React with ${emoji}`}
                              >
                                {emoji}
                                {isCustomizingReactions && <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white">×</span>}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setShowFullReactionPicker((value) => !value)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xl text-gray-600 transition hover:border-primary hover:bg-primary/5 hover:text-primary"
                              aria-label={isCustomizingReactions ? 'Add a quick reaction emoji' : 'Choose any emoji'}
                              title={isCustomizingReactions ? 'Add quick reaction' : 'More emojis'}
                            >
                              +
                            </button>
                          </div>
                          {isCustomizingReactions && (
                            <p className="mt-2 text-[11px] text-gray-500">
                              Select an emoji below to add it. Select a quick emoji above to remove it. Up to {MAX_QUICK_REACTIONS} favorites.
                            </p>
                          )}
                          {showFullReactionPicker && (
                            <div className="mt-2 overflow-hidden rounded-lg border border-gray-100">
                              <Suspense fallback={<div className="p-4 text-center text-sm text-gray-500">Loading emoji picker…</div>}>
                                <EmojiPicker
                                  onEmojiClick={(emojiData) => handleReactionEmojiPick(message, emojiData.emoji)}
                                  width="100%"
                                  height={340}
                                  searchPlaceholder="Search all emoji"
                                  previewConfig={{ showPreview: false }}
                                  lazyLoadEmojis
                                />
                              </Suspense>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )) 
              )}
              <div ref={messagesEndRef} />
              </div>
              {showScrollToBottom && messages.length > 0 && (
                <button
                  type="button"
                  onClick={scrollToLatestMessage}
                  className="absolute bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-lg transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Jump to latest message"
                  title="Jump to latest message"
                >
                  <span className="material-icons text-lg">keyboard_double_arrow_down</span>
                  <span>Latest</span>
                </button>
              )}
            </div>

            {/* Message Input */}
            {isActiveUserBlocked || messagingUnavailableChatId === activeChat.id ? (
              <div className="border-t border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <span className="material-icons mt-0.5 text-gray-500" aria-hidden="true">info</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Messaging unavailable</p>
                      <p className="mt-0.5 text-xs text-gray-600">You can't send messages in this conversation right now. The conversation history is still available.</p>
                    </div>
                  </div>
                  {isActiveUserBlocked && (
                    <button type="button" onClick={() => setBlockMuteChat(activeChat)} disabled={blockActionLoading} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-100 disabled:opacity-50">
                      Manage block settings
                    </button>
                  )}
                </div>
              </div>
            ) : (
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-gray-50">
              {replyingTo && (
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary/20 bg-white p-3">
                  <span className="material-icons text-primary" aria-hidden="true">reply</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800">Replying to {replyingTo.senderName}</p>
                    <p className="truncate text-xs text-gray-500">
                      {replyingTo.type === 'photo' ? '📷 Photo' : replyingTo.type === 'gif' ? 'GIF' : replyingTo.type === 'sticker' ? `Sticker · ${replyingTo.content}` : replyingTo.content}
                    </p>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} disabled={loading} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Cancel reply">
                    <span className="material-icons text-base">close</span>
                  </button>
                </div>
              )}
              {showGifPicker && (
                <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">Search GIFs</p>
                    <button type="button" onClick={() => setShowGifPicker(false)} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Close GIF picker"><span className="material-icons text-base">close</span></button>
                  </div>
                  <input type="search" value={gifSearchQuery} onChange={(event) => { setGifSearchQuery(event.target.value.slice(0, 50)); setGifOffset(0); }} placeholder="Search GIFs..." maxLength={50} className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary" aria-label="Search GIPHY GIFs" />
                  <p className="mb-2 text-[11px] font-medium text-gray-500">Powered by GIPHY · PG-rated results</p>
                  {gifError && <p role="alert" className="mb-2 text-xs text-red-600">{gifError}</p>}
                  {gifResults.length > 0 && <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {gifResults.map((gif) => <button key={gif.gifId} type="button" onClick={() => { setSelectedGif(gif); setShowGifPicker(false); setGifError(''); }} className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary" title={gif.title || 'Select GIF'} aria-label={`Preview ${gif.title || 'GIF'}`}><img src={gif.previewUrl} alt={gif.title || 'GIF result'} loading="lazy" className="h-24 w-full object-cover" /></button>)}
                  </div>}
                  {gifLoading && <p className="py-3 text-center text-xs text-gray-500">Loading GIFs...</p>}
                  {!gifLoading && !gifError && gifResults.length === 0 && <p className="py-3 text-center text-xs text-gray-500">No GIFs found. Try another search.</p>}
                  {gifHasMore && !gifLoading && <button type="button" onClick={() => setGifOffset((offset) => offset + GIPHY_PAGE_SIZE)} className="mt-3 w-full rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">Load more</button>}
                </div>
              )}
              {showStickerPicker && (
                <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">CampusFind Stickers</p>
                    <button type="button" onClick={() => setShowStickerPicker(false)} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Close sticker picker">
                      <span className="material-icons text-base">close</span>
                    </button>
                  </div>
                  {recentStickerIds.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recently used</p>
                      <div className="flex flex-wrap gap-2">
                        {recentStickerIds.map((id) => {
                          const sticker = CHAT_STICKERS.find((entry) => entry.id === id);
                          return sticker ? (
                            <button key={id} type="button" onClick={() => void handleSendSticker(sticker)} disabled={loading || Boolean(selectedImage)} className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 disabled:opacity-50" aria-label={`Send ${sticker.label} sticker`} title={sticker.label}>
                              <span className="text-3xl">{sticker.emoji}</span>
                              <span className="max-w-full truncate px-1 text-[10px] text-gray-600">{sticker.label}</span>
                            </button>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                  <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Sticker categories">
                    {STICKER_CATEGORIES.map((category) => (
                      <button key={category} type="button" role="tab" aria-selected={stickerCategory === category} onClick={() => setStickerCategory(category)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${stickerCategory === category ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {category}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {CHAT_STICKERS.filter((sticker) => stickerCategory === 'All' || sticker.category === stickerCategory).map((sticker) => (
                      <button key={sticker.id} type="button" onClick={() => void handleSendSticker(sticker)} disabled={loading || Boolean(selectedImage)} className="flex min-h-20 flex-col items-center justify-center rounded-xl border border-gray-200 p-2 transition hover:border-primary hover:bg-primary/5 disabled:opacity-50" aria-label={`Send ${sticker.label} sticker`} title={sticker.label}>
                        <span className="text-3xl">{sticker.emoji}</span>
                        <span className="mt-1 text-center text-[10px] font-medium text-gray-600">{sticker.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {selectedGif && (
                <div className="mb-3 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3">
                  <img src={selectedGif.previewUrl} alt="Selected GIF preview" className="h-20 w-24 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-800">GIF ready to send</p><p className="text-xs text-gray-500">Powered by GIPHY</p></div>
                  <button type="button" onClick={() => setSelectedGif(null)} disabled={loading} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600" aria-label="Remove selected GIF"><span className="material-icons">close</span></button>
                </div>
              )}
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
                  disabled={loading || showStickerPicker || showGifPicker || Boolean(selectedGif)}
                  className="rounded-lg border border-gray-300 px-3 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Attach a photo"
                  aria-label="Attach a photo"
                >
                  <span className="material-icons">image</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowGifPicker(false); setShowStickerPicker((open) => !open); }}
                  disabled={loading || Boolean(selectedImage) || Boolean(selectedGif) || showGifPicker}
                  className={`rounded-lg border px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${showStickerPicker ? 'border-primary bg-primary/10 text-primary' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                  title="Send a sticker"
                  aria-label="Send a sticker"
                  aria-expanded={showStickerPicker}
                >
                  <span className="material-icons">emoji_emotions</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowStickerPicker(false); if (!showGifPicker) { setGifOffset(0); setGifResults([]); } setShowGifPicker((open) => !open); }}
                  disabled={loading || Boolean(selectedImage) || Boolean(selectedGif) || showStickerPicker}
                  className={`rounded-lg border px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${showGifPicker ? 'border-primary bg-primary/10 text-primary' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                  title="Search GIFs"
                  aria-label="Search GIFs"
                  aria-expanded={showGifPicker}
                >GIF</button>
                <Input
                  type="text"
                  value={newMessage}
                  onChange={(e) => handleComposerChange(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button 
                  type="submit" 
                  disabled={loading || (!newMessage.trim() && !selectedImage && !selectedGif)}
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
            )}
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
      {reportChat && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !reportSubmitting) setReportChat(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-user-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <span className="material-icons rounded-full bg-red-50 p-2 text-red-600">flag</span>
              <div>
                <h3 id="report-user-title" className="text-lg font-semibold text-gray-900">Report user</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Tell us what happened. Your report is private and won't be shared with the reported user.
                </p>
              </div>
            </div>
            <form onSubmit={(event) => void handleSubmitUserReport(event)} className="mt-5 space-y-4">
              <div>
                <label htmlFor="user-report-reason" className="mb-1 block text-sm font-medium text-gray-700">What's the issue?</label>
                <select
                  id="user-report-reason"
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value as UserReportReason)}
                  disabled={reportSubmitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {USER_REPORT_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>{reason.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="user-report-details" className="mb-1 block text-sm font-medium text-gray-700">
                  Additional details <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="user-report-details"
                  value={reportDetails}
                  onChange={(event) => setReportDetails(sanitizePlainText(event.target.value, 1000, { multiline: true, trim: false }))}
                  disabled={reportSubmitting}
                  rows={4}
                  maxLength={1000}
                  placeholder="Share any context that could help us review this report."
                  className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-right text-xs text-gray-400">{reportDetails.length}/1000</p>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setReportChat(null)} disabled={reportSubmitting} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={reportSubmitting} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {reportSubmitting ? 'Submitting…' : 'Submit report'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {blockMuteChat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !blockActionLoading) setBlockMuteChat(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-mute-dialog-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <h3 id="block-mute-dialog-title" className="text-lg font-semibold text-gray-900">Block or mute this user?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Muting turns off notifications for this conversation. Blocking prevents both of you from sending new messages to each other. Your existing chat history will remain.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {blockMuteChat.participantIds.some((participantId) => participantId !== user?.uid && blockedUserIds.has(participantId)) ? (
                <button
                  type="button"
                  onClick={() => void handleUnblockFromActionMenu()}
                  disabled={blockActionLoading}
                  className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {blockActionLoading ? 'Please wait…' : 'Unblock user'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleBlockFromActionMenu()}
                  disabled={blockActionLoading}
                  className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {blockActionLoading ? 'Please wait…' : 'Block user'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleMuteFromActionMenu()}
                disabled={blockActionLoading}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {blockMuteChat.userSettings?.[user?.uid || '']?.muted ? 'Unmute chat' : 'Mute chat'}
              </button>
              <button
                type="button"
                onClick={() => setBlockMuteChat(null)}
                disabled={blockActionLoading}
                className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
