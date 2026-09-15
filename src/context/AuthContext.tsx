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
  updateUserPhoto: (photoURL: string) => void;
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
    const initialStats = {
      points: 0,
      itemsReported: 0,
      itemsReturned: 0,
      itemsClaimed: 0,
    };

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

  const updateUserPhoto = (photoURL: string) => {
    setUser(prev => prev ? { ...prev, photoURL } : null);
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
