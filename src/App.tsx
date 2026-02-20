import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { HomeView } from './views/HomeView';
import { ReportView } from './views/ReportView';
import { BrowseView } from './views/BrowseView';
import { MapView } from './views/MapView';
import { AppInfo } from './views/AppInfo';
import { LoginView } from './views/LoginView';
import { ChatView } from './views/ChatView';
import { AdminView } from './views/AdminView';
import { ProfileView } from './views/ProfileView';
import { LeaderboardView } from './views/LeaderboardView';

import { ToastContainer } from './components/Toast';
import { useToast } from './hooks/useToast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

import { getItems, getUserStats, syncStatsFromFirestore } from './services/StorageService';
import { subscribeToItems } from './services/itemService';
import type { Item, UserStats } from './types';

const AppContent: React.FC = () => {
    const [activeTab, setActiveTab] = useState('home');
    const [items, setItems] = useState<Item[]>([]);
    const [stats, setStats] = useState<UserStats>({
        points: 0,
        itemsReturned: 0,
        itemsReported: 0,
        lastActive: new Date().toISOString(),
        itemsClaimed: 0,
        badges: [],
        streaks: {
            currentStreak: 0,
            longestStreak: 0,
            lastReportDate: new Date().toISOString(),
            weeklyActivity: [false, false, false, false, false, false, false]
        },

        unlockedAchievements: []
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeChatItem, setActiveChatItem] = useState<{ itemId: string; itemTitle: string; itemOwnerId?: string; chatId?: string } | null>(null);

    const { toasts, removeToast, success, error } = useToast();
    const { user, loading, isAuthenticated, logout } = useAuth();

    // Load initial data from Firestore
    useEffect(() => {
        if (!isAuthenticated) return;
        
        // Subscribe to real-time items updates
        const unsubscribe = subscribeToItems((firestoreItems) => {
            setItems(firestoreItems);
        });
        
        // Sync user stats from Firestore to localStorage, then load
        const loadStats = async () => {
            try {
                // First try to sync from Firestore
                const syncedStats = await syncStatsFromFirestore();
                if (syncedStats) {
                    setStats(syncedStats);
                } else {
                    // Fall back to localStorage
                    setStats(getUserStats());
                }
            } catch (err) {
                console.error('Error loading user stats:', err);
                setStats(getUserStats());
            }
        };
        
        loadStats();
        
        return () => unsubscribe();
    }, [isAuthenticated]);

    const refreshData = useCallback(() => {
        try {
            // Items are now loaded via Firestore subscription
            // Just refresh user stats from localStorage
            setStats(getUserStats());
        } catch (err) {
            error('Failed to load data');
            console.error(err);
        }
    }, [error]);

    const handleReportSuccess = useCallback(() => {
        refreshData();
        setActiveTab('browse');
        success('Item reported successfully!');
    }, [refreshData, success]);

    const handleItemsChange = useCallback(() => {
        refreshData();
        success('Item deleted successfully');
    }, [refreshData, success]);

    const handleStatusChange = useCallback(() => {
        refreshData();
        success('Status updated successfully');
    }, [refreshData, success]);

    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        setActiveTab('browse');
    }, []);

    const handleStartChat = useCallback((itemId: string, itemTitle: string, itemOwnerId: string) => {
        setActiveChatItem({ itemId, itemTitle, itemOwnerId });
        setActiveTab('chat');
    }, []);

    const handleChatSelect = useCallback((chatId: string, itemId?: string, itemTitle?: string) => {
        setActiveChatItem({ 
            itemId: itemId || '', 
            itemTitle: itemTitle || 'Chat', 
            itemOwnerId: undefined,
            chatId: chatId
        });
        setActiveTab('chat');
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'home':
                return <HomeView items={items} stats={stats} onChangeTab={setActiveTab} />;
            case 'report':
                return <ReportView onSuccess={handleReportSuccess} />;
            case 'browse':
                return <BrowseView items={items} onItemClick={refreshData} onItemsChange={handleItemsChange} onStatusChange={handleStatusChange} searchQuery={searchQuery} onStartChat={handleStartChat} />;
            case 'chat':
                return <ChatView itemId={activeChatItem?.itemId} itemTitle={activeChatItem?.itemTitle} itemOwnerId={activeChatItem?.itemOwnerId} chatId={activeChatItem?.chatId} />;
            case 'map':
                return <MapView items={items} />;
            case 'info':
                return <AppInfo />;
            case 'admin':
                return <AdminView />;
            case 'profile':
                return <ProfileView />;
            case 'leaderboard':
                return <LeaderboardView />;
            default:
                return <HomeView items={items} stats={stats} onChangeTab={setActiveTab} />;
        }
    };

    // Show loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background-light">
                <div className="flex items-center gap-3 text-primary">
                    <span className="material-icons animate-spin text-3xl">refresh</span>
                    <span className="text-lg font-medium">Loading...</span>
                </div>
            </div>
        );
    }

    // Show login view if not authenticated
    if (!isAuthenticated) {
        return (
            <>
                <LoginView />
                <ToastContainer toasts={toasts} onClose={removeToast} />
            </>
        );
    }

    return (
        <>
            <Layout activeTab={activeTab} onTabChange={setActiveTab} stats={stats} onSearch={handleSearch} user={user} onLogout={logout} onChatSelect={handleChatSelect}>
                {renderContent()}
            </Layout>
            <ToastContainer toasts={toasts} onClose={removeToast} />
        </>
    );
};

const App: React.FC = () => {
    return (
        <ThemeProvider>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </ThemeProvider>
    );
};

export default App;
