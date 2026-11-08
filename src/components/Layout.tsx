/**
 * Layout Component
 * Main application layout with navigation and notifications
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { UserStats } from '../types';
import { User } from 'lucide-react';

import { 
  subscribeToNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  clearAllNotifications,
  deleteNotifications,
  type Notification 
} from '../services/notificationService';
import { sanitizeSearchInput } from '../utils/sanitize';

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAdmin: boolean;
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  stats: UserStats;
  onSearch?: (query: string) => void;
  user: User | null;
  onLogout?: () => void;
  onChatSelect?: (chatId: string, itemId?: string, itemTitle?: string) => void;
}


export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, stats, onSearch, user, onLogout, onChatSelect }) => {

  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Sound is on by default; remember the user's choice on this device.
  const [audioEnabled, setAudioEnabled] = useState(() => {
    try {
      return window.localStorage.getItem('campusfind-notification-sound') !== 'off';
    } catch {
      return true;
    }
  });
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const prevUnreadCountRef = useRef(0);
  const hasReceivedInitialNotificationsRef = useRef(false);


  // A quiet two-note chime designed to feel softer than a standard alert.
  const playNotificationSound = useCallback(() => {
    if (!audioEnabled) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const playTone = (frequency: number, startAt: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + duration);
      };

      void ctx.resume().then(() => {
        playTone(659.25, ctx.currentTime, 0.42);
        playTone(783.99, ctx.currentTime + 0.13, 0.5);
        window.setTimeout(() => void ctx.close(), 800);
      }).catch((err) => console.error('Unable to start notification audio:', err));
    } catch (err) {
      console.error('Failed to play notification sound:', err);
    }
  }, [audioEnabled]);

  const navItems = [
    { id: 'home', label: 'Dashboard', icon: 'dashboard' },
    { id: 'browse', label: 'Reports', icon: 'inventory_2' },
    { id: 'chat', label: 'Messages', icon: 'chat' },
    { id: 'map', label: 'Campus Map', icon: 'map' },
    { id: 'leaderboard', label: 'Leaderboard', icon: 'emoji_events' },
    { id: 'profile', label: 'Profile', icon: 'person' },
    { id: 'info', label: 'App Info', icon: 'info' },
    ...(user?.isAdmin ? [{ id: 'admin', label: 'Admin', icon: 'admin_panel_settings' }] : []),
  ];


  useEffect(() => {
    try {
      window.localStorage.setItem('campusfind-notification-sound', audioEnabled ? 'on' : 'off');
    } catch {
      // Keep the in-memory preference if browser storage is unavailable.
    }
  }, [audioEnabled]);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user) {
      console.log('No user, skipping notification subscription');
      return;
    }
    
    console.log('Subscribing to notifications for user:', user.uid);
    
    const unsubscribe = subscribeToNotifications(user.uid, (newNotifications) => {
      console.log('Received notifications:', newNotifications.length, newNotifications);
      setNotifications(newNotifications);
      
      // Play sound for new notifications
      const currentUnread = newNotifications.filter(n => !n.read).length;
      const prevUnread = prevUnreadCountRef.current;
      
      console.log('Current unread:', currentUnread, 'Previous unread:', prevUnread, 'Audio enabled:', audioEnabled);
      
      // Treat the first snapshot as the baseline so old unread notifications
      // do not unexpectedly chime when the user opens or refreshes the app.
      if (hasReceivedInitialNotificationsRef.current && currentUnread > prevUnread && audioEnabled) {
        console.log('Playing notification sound');
        playNotificationSound();
      }

      hasReceivedInitialNotificationsRef.current = true;
      prevUnreadCountRef.current = currentUnread;
    });
    
    return () => {
      console.log('Unsubscribing from notifications');
      unsubscribe();
    };
  }, [user, audioEnabled, playNotificationSound]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (notification: Notification) => {
    if (notification.id && !notification.read) {
      await markNotificationAsRead(notification.id);
    }
    
    // Navigate to chat if it's a chat message notification
    if (notification.type === 'chat_message' && notification.relatedChatId) {
      setShowNotifications(false);
      onTabChange('chat');
      // Pass chat details to parent for chat selection
      onChatSelect?.(notification.relatedChatId, notification.relatedItemId, notification.title.replace('New message from ', ''));
    }
  };


  const handleMarkAllRead = async () => {
    if (user) {
      await markAllNotificationsAsRead(user.uid);
    }
  };

  const handleClearAll = async () => {
    if (user && confirm('Are you sure you want to clear all notifications?')) {
      await clearAllNotifications(user.uid);
    }
  };

  const toggleNotificationSelection = (notificationId: string) => {
    setSelectedNotificationIds((current) => {
      const next = new Set(current);
      if (next.has(notificationId)) next.delete(notificationId);
      else next.add(notificationId);
      return next;
    });
  };

  const handleSelectAllNotifications = () => {
    const ids = notifications.flatMap((notification) => notification.id ? [notification.id] : []);
    setSelectedNotificationIds((current) =>
      current.size === ids.length ? new Set() : new Set(ids)
    );
  };

  const handleDeleteSelectedNotifications = async () => {
    const ids = Array.from(selectedNotificationIds);
    if (!ids.length || !confirm(`Delete ${ids.length} selected notification(s)?`)) return;
    await deleteNotifications(ids);
    setSelectedNotificationIds(new Set());
  };

  const handleMarkSelectedNotificationsRead = async () => {
    const ids = Array.from(selectedNotificationIds);
    await Promise.all(ids.map((id) => markNotificationAsRead(id)));
    setSelectedNotificationIds(new Set());
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(sanitizeSearchInput(e.target.value));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const q = sanitizeSearchInput(searchQuery, true);
    if (e.key === 'Enter' && q) {
      e.preventDefault();
      onTabChange('browse');
      onSearch?.(q);
      setSearchQuery('');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background transition-colors duration-300">

      {/* Desktop Sidebar - Navigation */}
      <aside className="hidden md:flex flex-col w-64 bg-primary border-r border-primary-dark shadow-sm z-20 text-white">
        {/* Logo/Brand */}
        <div className="h-16 flex items-center px-6 border-b border-primary-dark">
          <span className="material-icons text-secondary text-3xl mr-2">travel_explore</span>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Campus<span className="text-secondary">Find</span>
          </h1>
        </div>
        
        {/* Navigation Menu */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map(item => {
            const hasUnreadChat = item.id === 'chat' && notifications.some(
              notification => notification.type === 'chat_message' && !notification.read
            );
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center px-4 py-3 rounded-lg group transition-colors text-left ${
                  hasUnreadChat
                    ? 'bg-secondary/20 ring-1 ring-secondary/40 text-white'
                    : activeTab === item.id
                      ? 'bg-primary-dark/50 border border-secondary/20 text-secondary'
                      : 'text-white/80 hover:bg-white/10 hover:text-secondary'
                }`}
              >
                <span className={`material-icons mr-3 ${activeTab === item.id || hasUnreadChat ? 'text-secondary' : 'group-hover:text-secondary'}`}>
                  {item.icon}
                </span>
                <span className="font-medium">{item.label}</span>
                {hasUnreadChat && <span className="ml-auto w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(255,255,255,0.45)]" aria-label="Unread chat messages" />}
              </button>
            );
          })}
        </nav>
        
        {/* User Profile Section */}
        <div className="p-4 border-t border-primary-dark">
          <div 
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
            onClick={() => onTabChange('profile')}
          >
            <div className="w-10 h-10 rounded-full bg-secondary/20 border-2 border-secondary flex items-center justify-center text-secondary font-bold overflow-hidden">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5" />
              )}
            </div>


            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                {user?.displayName || user?.email?.split('@')[0] || 'User'}
                {user?.isAdmin && (
                  <span className="text-xs bg-secondary text-primary-dark px-2 py-0.5 rounded-full font-bold">
                    ADMIN
                  </span>
                )}
              </p>
              <p className="text-xs text-white/70 truncate">Points: {stats.points}</p>
            </div>
          </div>

          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <span className="material-icons text-sm">logout</span>
              Sign Out
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-6 bg-surface/80 backdrop-blur-md border-b border-cream-accent z-10 sticky top-0 transition-colors duration-300">


          {/* Mobile Menu Button */}
          <button className="md:hidden mr-4 text-gray-500 hover:text-primary">
            <span className="material-icons">menu</span>
          </button>
          
          {/* Search Bar */}
          <div className="flex-1 max-w-2xl relative hidden sm:block">
            <span className="material-icons absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">search</span>
            <input 
              ref={searchRef}
              className="w-full pl-10 pr-4 py-2 bg-cream-accent border-none rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-primary/50 placeholder-gray-500 transition-all outline-none" 
              placeholder="Search for keys, ID cards, electronics..." 
              type="search"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
            />

          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-4 ml-6">
            {/* Notifications */}

            <div className="relative z-50" ref={notificationRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-500 hover:text-primary transition-colors rounded-full hover:bg-cream-accent"
              >

                <span className="material-icons">notifications</span>
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full"></span>
                )}
              </button>
              
              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h3 className="font-bold text-gray-800">Notifications</h3>





                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAudioEnabled(!audioEnabled);
                          if (!audioEnabled) {
                            playNotificationSound();
                          }
                        }}
                        className={`text-xs px-2 py-1 rounded-full transition-colors ${
                          audioEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                        title={audioEnabled ? 'Sound on' : 'Sound off - click to enable'}
                      >
                        <span className="material-icons text-sm">
                          {audioEnabled ? 'volume_up' : 'volume_off'}
                        </span>
                      </button>
                      {unreadCount > 0 && (
                        <span className="text-xs bg-primary text-white px-2.5 py-1 rounded-full font-medium">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <div 
                          key={notification.id}
                          onClick={() => handleNotificationClick(notification)}
                          className={`p-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer ${
                            !notification.read ? 'bg-blue-50/50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-2.5 h-2.5 mt-1.5 flex-shrink-0 rounded-full ${
                              !notification.read ? 'bg-primary' : 'bg-gray-300'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-relaxed ${!notification.read ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                                {notification.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">{notification.message}</p>
                              <p className="text-xs text-gray-400 mt-1">{formatTime(notification.createdAt)}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-3 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">





                    <div className="flex gap-2">
                      <button 
                        onClick={handleMarkAllRead}
                        disabled={unreadCount === 0}
                        className="text-xs text-primary hover:text-primary-dark font-medium transition-colors disabled:text-gray-400"
                      >
                        Mark all read
                      </button>
                      {notifications.length > 0 && (
                        <button 
                          onClick={handleClearAll}
                          className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowNotifications(false);
                        setShowAllNotifications(true);
                        setSelectedNotificationIds(new Set());
                      }}
                      className="text-xs text-primary hover:text-primary-dark font-medium transition-colors"
                    >
                      View all
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Report Item Button */}
            <button 
              onClick={() => onTabChange('report')}
              className="flex items-center gap-2 bg-secondary hover:bg-secondary-dark text-primary-dark font-bold px-4 py-2 rounded-lg transition-colors shadow-soft"
            >
              <span className="material-icons text-lg">add_circle</span>
              <span className="hidden sm:inline">Report Item</span>
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth bg-background transition-colors duration-300">

          {children}
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-cream-accent px-4 py-2 z-30 flex justify-around items-center">

          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const hasUnreadChat = item.id === 'chat' && notifications.some(
              notification => notification.type === 'chat_message' && !notification.read
            );
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`relative flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
                  hasUnreadChat ? 'bg-secondary/20 text-primary ring-1 ring-secondary/40' : isActive ? 'text-primary' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <span className="material-icons">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
                {hasUnreadChat && <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-primary" aria-label="Unread chat messages" />}
              </button>
            );
          })}
        </nav>
      </main>
      
      {showAllNotifications && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="notifications-title">
          <div className="w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between gap-3">
              <div>
                <h2 id="notifications-title" className="text-xl font-bold text-gray-900">Notification Center</h2>
                <p className="text-sm text-gray-500 mt-1">{notifications.length} total · {unreadCount} unread</p>
              </div>
              <button onClick={() => setShowAllNotifications(false)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close notifications">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="p-3 sm:px-5 border-b border-gray-100 flex flex-wrap items-center gap-2">
              <button onClick={handleSelectAllNotifications} disabled={notifications.length === 0} className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40">
                {selectedNotificationIds.size === notifications.length && notifications.length > 0 ? 'Deselect all' : 'Select all'}
              </button>
              <button onClick={handleMarkSelectedNotificationsRead} disabled={selectedNotificationIds.size === 0} className="px-3 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                Mark selected read
              </button>
              <button onClick={handleDeleteSelectedNotifications} disabled={selectedNotificationIds.size === 0} className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40">
                Delete selected ({selectedNotificationIds.size})
              </button>
              <button onClick={handleMarkAllRead} disabled={unreadCount === 0} className="px-3 py-2 rounded-lg text-sm text-primary hover:bg-blue-50 disabled:opacity-40">
                Mark all read
              </button>
              <button onClick={handleClearAll} disabled={notifications.length === 0} className="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 disabled:opacity-40">
                Delete all
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <span className="material-icons text-4xl mb-2">notifications_none</span>
                  <p>No notifications yet</p>
                </div>
              ) : notifications.map((notification) => (
                <div key={notification.id} className={`flex items-start gap-3 p-4 border-b border-gray-100 hover:bg-gray-50 ${!notification.read ? 'bg-blue-50/50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={Boolean(notification.id && selectedNotificationIds.has(notification.id))}
                    onChange={() => notification.id && toggleNotificationSelection(notification.id)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    aria-label={`Select notification: ${notification.title}`}
                  />
                  <button
                    onClick={() => {
                      setShowAllNotifications(false);
                      void handleNotificationClick(notification);
                    }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <span className={`w-2.5 h-2.5 mt-1.5 rounded-full flex-shrink-0 ${notification.read ? 'bg-gray-300' : 'bg-primary'}`} />
                      <div className="min-w-0">
                        <p className={`text-sm ${notification.read ? 'text-gray-600' : 'font-semibold text-gray-900'}`}>{notification.title}</p>
                        <p className="text-sm text-gray-500 mt-1">{notification.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatTime(notification.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                  {notification.id && (
                    <button onClick={() => void deleteNotifications([notification.id!])} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50" aria-label="Delete notification">
                      <span className="material-icons text-lg">delete_outline</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-200 flex justify-end">
              <button onClick={() => setShowAllNotifications(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
