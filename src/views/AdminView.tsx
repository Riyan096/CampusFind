import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, where, writeBatch, serverTimestamp } from 'firebase/firestore';

import { db } from '../services/firebase';
import { Button } from '../components/UI';
import { useToast } from '../hooks/useToast';
import { ItemType } from '../types';
import { clearLocalStats } from '../services/StorageService';
import { getDefaultStreakInfo } from '../services/gamificationService';





interface UserData {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  itemsReported: number;
  itemsReturned: number;
  itemsClaimed: number;
  points: number;
}

interface ItemData {
  id: string;
  title: string;
  type: ItemType;
  status: string;
  reportedBy: string;
  createdAt: string;
  category: string;
  location?: string;
}


export const AdminView: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'items' | 'notifications'>('dashboard');
  const [users, setUsers] = useState<UserData[]>([]);
  const [items, setItems] = useState<ItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalItems: 0,
    lostItems: 0,
    foundItems: 0,
    resolvedItems: 0,
    totalPoints: 0
  });

  // Notification form state
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'info' | 'success' | 'warning'>('info');

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as UserData[];
      setUsers(usersData);

      // Fetch items from Firestore
      const itemsSnapshot = await getDocs(collection(db, 'items'));
      const itemsData = itemsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ItemData[];
      setItems(itemsData);

      // Calculate stats
      setStats({
        totalUsers: usersData.length,
        totalItems: itemsData.length,
        lostItems: itemsData.filter((i: ItemData) => i.type === ItemType.LOST).length,
        foundItems: itemsData.filter((i: ItemData) => i.type === ItemType.FOUND).length,
        resolvedItems: itemsData.filter((i: ItemData) => i.status === 'CLAIMED' || i.status === 'RESOLVED').length,
        totalPoints: usersData.reduce((sum, u) => sum + (u.points || 0), 0)
      });


    } catch (err) {
      error('Failed to load admin data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };


  const handleToggleAdmin = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isAdmin: !currentStatus
      });
      success(`Admin status ${!currentStatus ? 'granted' : 'revoked'}`);
      fetchData();
    } catch (err) {
      error('Failed to update admin status');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'items', itemId));
      success('Item deleted successfully');
      fetchData();
    } catch (err) {
      error('Failed to delete item');
      console.error(err);
    }
  };

  const handleResetAllPoints = async () => {
    if (!confirm('WARNING: This will reset ALL user points, stats, streaks, and achievements to 0. This cannot be undone. Continue?')) return;
    
    try {
      // Update all users' points and gamification data to 0
      const updatePromises = users.map(user => 
        updateDoc(doc(db, 'users', user.uid), {
          points: 0,
          itemsReported: 0,
          itemsReturned: 0,
          itemsClaimed: 0,
          streaks: getDefaultStreakInfo(),
          unlockedAchievements: []
        })
      );
      
      await Promise.all(updatePromises);
      
      // Clear localStorage stats as well
      clearLocalStats();
      
      success('All user points, stats, and achievements have been reset');
      fetchData();
    } catch (err) {

      error('Failed to reset points');
      console.error(err);
    }
  };


  const handleResetUserPoints = async (userId: string) => {
    if (!confirm('Reset this user\'s points, stats, streaks, and achievements to 0?')) return;
    
    try {
      await updateDoc(doc(db, 'users', userId), {
        points: 0,
        itemsReported: 0,
        itemsReturned: 0,
        itemsClaimed: 0,
        streaks: getDefaultStreakInfo(),
        unlockedAchievements: []
      });
      
      // Clear localStorage stats as well
      clearLocalStats();
      
      success('User points, stats, and achievements reset successfully');
      fetchData();
    } catch (err) {

      error('Failed to reset user points');
      console.error(err);
    }
  };




  const handleSendGlobalNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Create a batch to send notifications to all users
      const batch = writeBatch(db);
      
      // Get all users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      
      // Create a notification for each user
      usersSnapshot.docs.forEach(userDoc => {
        const notificationRef = doc(collection(db, 'users', userDoc.id, 'notifications'));
        batch.set(notificationRef, {
          title: notificationTitle,
          message: notificationMessage,
          type: notificationType,
          read: false,
          createdAt: serverTimestamp(),
          isGlobal: true
        });
      });
      
      // Also store in a global notifications collection for reference
      const globalNotificationRef = doc(collection(db, 'notifications'));
      batch.set(globalNotificationRef, {
        title: notificationTitle,
        message: notificationMessage,
        type: notificationType,
        recipientCount: usersSnapshot.docs.length,
        sentBy: user?.uid,
        sentByName: user?.displayName || 'Admin',
        createdAt: serverTimestamp()
      });
      
      await batch.commit();

      success(`Global notification sent to ${usersSnapshot.docs.length} users!`);
      setNotificationTitle('');
      setNotificationMessage('');
    } catch (err) {
      error('Failed to send notification');
      console.error(err);
    }
  };


  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light p-4">
        <div className="bg-white rounded-2xl shadow-soft p-8 text-center max-w-md">
          <span className="material-icons text-6xl text-red-500 mb-4">block</span>
          <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-gray-600">You need admin privileges to view this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light">
        <div className="flex items-center gap-3 text-primary">
          <span className="material-icons animate-spin text-3xl">refresh</span>
          <span className="text-lg font-medium">Loading admin data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage users, items, and system settings</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
            { id: 'users', label: 'Users', icon: 'people' },
            { id: 'items', label: 'Items', icon: 'inventory_2' },
            { id: 'notifications', label: 'Notifications', icon: 'campaign' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="material-icons text-sm">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-xl shadow-soft">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-icons text-primary text-3xl">people</span>
                <h3 className="text-lg font-semibold text-gray-600">Total Users</h3>
              </div>
              <p className="text-4xl font-bold text-primary">{stats.totalUsers}</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-soft">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-icons text-secondary text-3xl">inventory_2</span>
                <h3 className="text-lg font-semibold text-gray-600">Total Items</h3>
              </div>
              <p className="text-4xl font-bold text-secondary">{stats.totalItems}</p>
              <p className="text-sm text-gray-500 mt-1">
                {stats.lostItems} lost, {stats.foundItems} found
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-soft">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-icons text-green-600 text-3xl">check_circle</span>
                <h3 className="text-lg font-semibold text-gray-600">Resolved</h3>
              </div>
              <p className="text-4xl font-bold text-green-600">{stats.resolvedItems}</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-soft">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-icons text-yellow-600 text-3xl">stars</span>
                <h3 className="text-lg font-semibold text-gray-600">Total Points</h3>
              </div>
              <p className="text-4xl font-bold text-yellow-600">{stats.totalPoints}</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-soft md:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-icons text-red-600 text-3xl">restart_alt</span>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-600">Reset All Stats</h3>
                    <p className="text-sm text-gray-500">Reset all user points, streaks, and achievements</p>
                  </div>
                </div>

                <button
                  onClick={handleResetAllPoints}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Reset All Stats
                </button>

              </div>
            </div>
          </div>
        )}


        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-xl shadow-soft overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">User Management</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">User</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Points</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Items</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Admin</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map(user => (
                    <tr key={user.uid} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{user.displayName || 'No name'}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">{user.points || 0}</span>
                          <button
                            onClick={() => handleResetUserPoints(user.uid)}
                            className="text-xs text-red-500 hover:text-red-700 underline"
                            title="Reset user points"
                          >
                            Reset
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {user.itemsReported || 0} reported
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleAdmin(user.uid, user.isAdmin)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            user.isAdmin
                              ? 'bg-secondary text-primary-dark'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {user.isAdmin ? 'Admin' : 'User'}
                        </button>
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Items Tab */}
        {activeTab === 'items' && (
          <div className="bg-white rounded-xl shadow-soft overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Item Moderation</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {items.map(item => (
                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className={`material-icons ${
                      item.type === ItemType.LOST ? 'text-red-500' : 'text-green-500'
                    }`}>
                      {item.type === ItemType.LOST ? 'search_off' : 'check_circle'}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="text-sm text-gray-500">
                        {item.category} • {item.location || 'No location'} • {item.status}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="text-red-500 hover:text-red-700 p-2"
                  >
                    <span className="material-icons">delete</span>
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <p className="p-8 text-center text-gray-500">No items found</p>
              )}
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="bg-white rounded-xl shadow-soft p-6">
            <h3 className="text-lg font-semibold mb-4">Send Global Notification</h3>
            <form onSubmit={handleSendGlobalNotification} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={notificationTitle}
                  onChange={(e) => setNotificationTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                  placeholder="Enter notification title"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  value={notificationMessage}
                  onChange={(e) => setNotificationMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                  rows={4}
                  placeholder="Enter notification message"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={notificationType}
                  onChange={(e) => setNotificationType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                >
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                </select>
              </div>

              <Button type="submit" className="w-full py-3">
                <span className="material-icons mr-2">send</span>
                Send to All Users
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
