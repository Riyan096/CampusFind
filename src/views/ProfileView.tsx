import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Button, Input } from '../components/UI';
import { useToast } from '../hooks/useToast';
import { getUserStats } from '../services/StorageService';
import { getDefaultStreakInfo } from '../services/gamificationService';
import type { UserStats } from '../types';


export const ProfileView: React.FC = () => {
  const { user, updateUserProfile } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<UserStats>({
    points: 0,
    itemsReturned: 0,
    itemsReported: 0,
    lastActive: new Date().toISOString(),
    itemsClaimed: 0,
    badges: [],
    streaks: getDefaultStreakInfo(),
    unlockedAchievements: []
  });

  
  // Form state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [photoURL, setPhotoURL] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load user data

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
      loadUserProfile();
      setStats(getUserStats());
    }
  }, [user]);

  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setPhone(data.phone || '');
        setBio(data.bio || '');
        setPhotoURL(data.photoURL || '');
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  };


  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    try {
      // Update Firebase Auth profile
      await updateUserProfile(displayName);
      
      // Update Firestore user document
      await updateDoc(doc(db, 'users', user.uid), {
        displayName,
        phone,
        bio,
        photoURL,
        updatedAt: new Date().toISOString(),
      });

      
      success('Profile updated successfully!');
      setIsEditing(false);
    } catch (err) {
      error('Failed to update profile');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      error('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      error('Image size must be less than 2MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        
        // Compress image if too large
        let compressedPhoto = base64String;
        if (base64String.length > 500000) {
          compressedPhoto = await compressImage(base64String);
        }

        setPhotoURL(compressedPhoto);
        
        // Save to Firestore immediately
        await updateDoc(doc(db, 'users', user.uid), {
          photoURL: compressedPhoto,
          updatedAt: new Date().toISOString(),
        });
        
        success('Profile picture updated!');
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error uploading photo:', err);
      error('Failed to upload photo');
      setUploadingPhoto(false);
    }
  };

  const compressImage = (base64String: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = base64String;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64String);
          return;
        }

        // Calculate new dimensions (max 300x300)
        let width = img.width;
        let height = img.height;
        const maxSize = 300;

        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with 0.8 quality
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(base64String);
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {

    e.preventDefault();
    if (!user) return;
    
    if (newPassword !== confirmPassword) {
      error('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      error('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      // Password change would require reauthentication
      // This is a placeholder - actual implementation needs Firebase Auth reauthentication
      success('Password change feature coming soon!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      error('Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light p-4">
        <div className="bg-white rounded-2xl shadow-soft p-8 text-center max-w-md">
          <span className="material-icons text-6xl text-gray-400 mb-4">account_circle</span>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Not Signed In</h2>
          <p className="text-gray-600">Please sign in to view your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">My Profile</h1>
          <p className="text-gray-600">Manage your account settings and view your activity</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Stats & Info */}
          <div className="space-y-6">
            {/* Profile Card */}
            <div className="bg-white rounded-xl shadow-soft p-6 text-center">
              <div 
                className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary/10 border-4 border-primary flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative group"
                onClick={handlePhotoClick}
              >
                {uploadingPhoto ? (
                  <span className="material-icons text-3xl text-primary animate-spin">refresh</span>
                ) : photoURL ? (
                  <img src={photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-icons text-5xl text-primary">
                    {user.displayName ? 'person' : 'account_circle'}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="material-icons text-white text-2xl">camera_alt</span>
                </div>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoUpload}
                accept="image/*"
                className="hidden"
              />
              <p className="text-xs text-gray-500 mb-4">Click to change photo</p>

              <h2 className="text-xl font-bold text-gray-800 mb-1">
                {user.displayName || 'Anonymous User'}
              </h2>
              <p className="text-gray-500 text-sm mb-4">{user.email}</p>
              {user.isAdmin && (
                <span className="inline-block bg-secondary text-primary-dark text-xs font-bold px-3 py-1 rounded-full">
                  ADMIN
                </span>
              )}
            </div>

            {/* Stats Card */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-icons text-primary">insights</span>
                Your Activity
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="material-icons text-primary">stars</span>
                    <span className="text-gray-600">Total Points</span>
                  </div>
                  <span className="text-xl font-bold text-primary">{stats.points}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="material-icons text-green-600">check_circle</span>
                    <span className="text-gray-600">Items Reported</span>
                  </div>
                  <span className="text-xl font-bold text-green-600">{stats.itemsReported}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="material-icons text-blue-600">handshake</span>
                    <span className="text-gray-600">Items Returned</span>
                  </div>
                  <span className="text-xl font-bold text-blue-600">{stats.itemsReturned}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="material-icons text-purple-600">emoji_events</span>
                    <span className="text-gray-600">Badges</span>
                  </div>
                  <span className="text-xl font-bold text-purple-600">{stats.badges.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Edit Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Edit Form */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <span className="material-icons text-primary">edit</span>
                  Edit Profile
                </h3>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-primary hover:text-primary-dark font-medium text-sm"
                >
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name
                    </label>
                    <Input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      disabled={!isEditing || loading}
                      placeholder="Your name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <Input
                      type="email"
                      value={email}
                      disabled={true}
                      placeholder="your@email.com"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!isEditing || loading}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    disabled={!isEditing || loading}
                    placeholder="Tell us a bit about yourself..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none resize-none disabled:bg-gray-100"
                  />
                </div>

                {isEditing && (
                  <div className="flex gap-3 pt-2">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="flex-1"
                    >
                      {loading ? (
                        <>
                          <span className="material-icons animate-spin mr-2 text-sm">refresh</span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <span className="material-icons mr-2 text-sm">save</span>
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </form>
            </div>

            {/* Change Password Form */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <span className="material-icons text-primary">lock</span>
                Change Password
              </h3>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New Password
                    </label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm New Password
                    </label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                  className="w-full md:w-auto"
                >
                  <span className="material-icons mr-2 text-sm">lock_reset</span>
                  Update Password
                </Button>
              </form>
            </div>

            {/* Account Info */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-icons text-primary">info</span>
                Account Information
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">User ID</span>
                  <span className="text-gray-800 font-mono">{user.uid}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Account Type</span>
                  <span className="text-gray-800">{user.isAdmin ? 'Administrator' : 'Standard User'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Email Verified</span>
                  <span className="text-gray-800">
                    {user.emailVerified ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
