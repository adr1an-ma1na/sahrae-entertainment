import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, loginWithGoogle, logout, db } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

export interface Profile {
  id: string;
  name: string;
  avatar: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  profiles: Profile[];
  activeProfile: Profile | null;
  setActiveProfile: (profile: Profile | null) => void;
  addProfile: (name: string, avatar: string) => Promise<void>;
  updateProfileData: (id: string, name: string, avatar: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  reloadUser: async () => {},
  profiles: [],
  activeProfile: null,
  setActiveProfile: () => {},
  addProfile: async () => {},
  updateProfileData: async () => {},
  deleteProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (!user) {
        setProfiles([]);
        setActiveProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(collection(db, `users/${user.uid}/profiles`), (snapshot) => {
        const loadedProfiles = snapshot.docs.map(doc => doc.data() as Profile);
        setProfiles(loadedProfiles);
      });
      return () => unsubscribe();
    }
  }, [user]);

  const addProfile = async (name: string, avatar: string) => {
    if (!user) return;
    if (profiles.length >= 5) throw new Error("Maximum 5 profiles allowed");
    
    const id = `profile_${Date.now()}`;
    await setDoc(doc(db, `users/${user.uid}/profiles`, id), {
      id,
      name,
      avatar
    });
  };

  const updateProfileData = async (id: string, name: string, avatar: string) => {
    if (!user) return;
    await setDoc(doc(db, `users/${user.uid}/profiles`, id), {
      id,
      name,
      avatar
    }, { merge: true });
    
    if (activeProfile?.id === id) {
      setActiveProfile({ id, name, avatar });
    }
  };

  const deleteProfile = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, `users/${user.uid}/profiles`, id));
    if (activeProfile?.id === id) {
      setActiveProfile(null);
    }
  };

  const reloadUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUser({ ...auth.currentUser } as User);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login: loginWithGoogle, 
      logout, 
      reloadUser,
      profiles,
      activeProfile,
      setActiveProfile,
      addProfile,
      updateProfileData,
      deleteProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};
