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
          // Get additional user data from Firestore
          let userData = null;
          try {
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            userData = userDoc.data();
          } catch (firestoreError) {
            // Firestore not accessible, use Firebase Auth data only
            console.warn('Firestore not accessible:', firestoreError);
          }
          
          // Check if user is admin (by email or admin flag in Firestore)
          const isAdmin = userData?.isAdmin === true || 
                         firebaseUser.email === 'admin@campusfind.com';
          
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
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email: string, password: string, displayName: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Update profile with display name
    await updateProfile(userCredential.user, { displayName });
    
    // Create user document in Firestore
    // Check if this is the first user (make them admin) or specific admin email
    const isAdmin = email === 'admin@campusfind.com';
    
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      uid: userCredential.user.uid,
      email,
      displayName,
      isAdmin,
      createdAt: new Date().toISOString(),
      itemsReported: 0,
      itemsReturned: 0,
      itemsClaimed: 0,
      points: 0,
    });

  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateUserProfile = async (displayName: string) => {
    if (!auth.currentUser) throw new Error('No user logged in');
    await updateProfile(auth.currentUser, { displayName });
    // Update local user state
    setUser(prev => prev ? { ...prev, displayName } : null);
  };

  const updateUserPhoto = (photoURL: string) => {
    // Update local user state immediately for UI responsiveness
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
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
