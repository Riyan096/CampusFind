import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { deleteUserImage, uploadUserImage } from '../services/firebaseStorageService';
import { LIMITS, sanitizeEmailInput, sanitizePlainText } from '../utils/sanitize';

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAdmin: boolean;
  emailVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (displayName: string) => Promise<void>;
  updateUserPhoto: (file: File) => Promise<void>;
  removeUserPhoto: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      try {
        if (firebaseUser) {
          let userData = null;
          try {
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            userData = userDoc.data();

            if (userData) {
              const publicProfileRef = doc(db, 'publicProfiles', firebaseUser.uid);
              await setDoc(publicProfileRef, {
                uid: firebaseUser.uid,
                displayName: userData.displayName || firebaseUser.displayName || 'Anonymous',
                photoURL: userData.photoURL || firebaseUser.photoURL || null,
                points: userData.points || 0,
                itemsReported: userData.itemsReported || 0,
                itemsReturned: userData.itemsReturned || 0,
                itemsClaimed: userData.itemsClaimed || 0,
              }, { merge: true });
            }
          } catch (firestoreError) {
            console.warn('Firestore not accessible:', firestoreError);
          }

          const isAdmin = userData?.isAdmin === true;
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || userData?.displayName || null,
            photoURL: firebaseUser.photoURL || userData?.photoURL || null,
            isAdmin,
            emailVerified: firebaseUser.emailVerified,
          });
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth state error:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const safeEmail = sanitizeEmailInput(email);
    await signInWithEmailAndPassword(auth, safeEmail, password);
  };

  const signup = async (email: string, password: string, displayName: string) => {
    const safeEmail = sanitizeEmailInput(email);
    const safeName = sanitizePlainText(displayName, LIMITS.displayName, { multiline: false });
    const userCredential = await createUserWithEmailAndPassword(auth, safeEmail, password);
    await updateProfile(userCredential.user, { displayName: safeName });

    const userRef = doc(db, 'users', userCredential.user.uid);
    const publicProfileRef = doc(db, 'publicProfiles', userCredential.user.uid);
    const initialStats = { points: 0, itemsReported: 0, itemsReturned: 0, itemsClaimed: 0 };

    await setDoc(userRef, {
      uid: userCredential.user.uid,
      email: safeEmail,
      displayName: safeName,
      isAdmin: false,
      createdAt: new Date().toISOString(),
      ...initialStats,
    });

    await setDoc(publicProfileRef, {
      uid: userCredential.user.uid,
      displayName: safeName,
      photoURL: null,
      ...initialStats,
    });
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateUserProfile = async (displayName: string) => {
    if (!auth.currentUser) throw new Error('No user logged in');
    const safeName = sanitizePlainText(displayName, LIMITS.displayName, { multiline: false });
    await updateProfile(auth.currentUser, { displayName: safeName });
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const profileRef = doc(db, 'publicProfiles', auth.currentUser.uid);
    await setDoc(userRef, { displayName: safeName }, { merge: true });
    await setDoc(profileRef, { displayName: safeName }, { merge: true });
    setUser(prev => prev ? { ...prev, displayName: safeName } : null);
  };

  const updateUserPhoto = async (file: File) => {
    if (!auth.currentUser) throw new Error('No user logged in');

    const uid = auth.currentUser.uid;
    const previousUserDoc = await getDoc(doc(db, 'users', uid));
    const previousPath = previousUserDoc.data()?.profileStoragePath;
    const uploaded = await uploadUserImage(uid, file, 'profile');

    try {
      await updateProfile(auth.currentUser, { photoURL: uploaded.downloadUrl });
      await setDoc(doc(db, 'users', uid), {
        photoURL: uploaded.downloadUrl,
        profileStoragePath: uploaded.path,
      }, { merge: true });
      await setDoc(doc(db, 'publicProfiles', uid), {
        photoURL: uploaded.downloadUrl,
      }, { merge: true });

      setUser(prev => prev ? { ...prev, photoURL: uploaded.downloadUrl } : null);

      if (typeof previousPath === 'string' && previousPath !== uploaded.path) {
        try {
          await deleteUserImage(previousPath, uid);
        } catch (cleanupError) {
          console.warn('Failed to delete previous profile photo:', cleanupError);
        }
      }
    } catch (error) {
      try {
        await deleteUserImage(uploaded.path, uid);
      } catch (cleanupError) {
        console.warn('Failed to clean up uploaded profile photo:', cleanupError);
      }
      throw error;
    }
  };

  const removeUserPhoto = async () => {
    if (!auth.currentUser) throw new Error('No user logged in');

    const uid = auth.currentUser.uid;
    const userDoc = await getDoc(doc(db, 'users', uid));
    const storagePath = userDoc.data()?.profileStoragePath;

    if (typeof storagePath === 'string') {
      try {
        await deleteUserImage(storagePath, uid);
      } catch (error) {
        console.warn('Failed to delete profile photo from Storage:', error);
      }
    }

    await updateProfile(auth.currentUser, { photoURL: null });
    await setDoc(doc(db, 'users', uid), {
      photoURL: null,
      profileStoragePath: null,
    }, { merge: true });
    await setDoc(doc(db, 'publicProfiles', uid), { photoURL: null }, { merge: true });
    setUser(prev => prev ? { ...prev, photoURL: null } : null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      signup,
      logout,
      updateUserProfile,
      updateUserPhoto,
      removeUserPhoto,
      isAuthenticated: !!user,
      isAdmin: user?.isAdmin || false,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
