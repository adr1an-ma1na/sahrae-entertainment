import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, auth, onAuthStateChanged, loginWithGoogle, logout } from '../firebase';

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

const profilesKey = (uid: string) => `sahrae_profiles_${uid}`;

function loadProfiles(uid: string): Profile[] {
  try {
    return JSON.parse(localStorage.getItem(profilesKey(uid)) || '[]');
  } catch {
    return [];
  }
}
function persistProfiles(uid: string, profiles: Profile[]) {
  localStorage.setItem(profilesKey(uid), JSON.stringify(profiles));
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setProfiles(loadProfiles(u.uid));
      } else {
        setProfiles([]);
        setActiveProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const addProfile = async (name: string, avatar: string) => {
    if (!user) return;
    if (profiles.length >= 5) throw new Error('Maximum 5 profiles allowed');
    const id = `profile_${Date.now()}`;
    const next = [...profiles, { id, name, avatar }];
    persistProfiles(user.uid, next);
    setProfiles(next);
  };

  const updateProfileData = async (id: string, name: string, avatar: string) => {
    if (!user) return;
    const next = profiles.map((p) => (p.id === id ? { id, name, avatar } : p));
    persistProfiles(user.uid, next);
    setProfiles(next);
    if (activeProfile?.id === id) setActiveProfile({ id, name, avatar });
  };

  const deleteProfile = async (id: string) => {
    if (!user) return;
    const next = profiles.filter((p) => p.id !== id);
    persistProfiles(user.uid, next);
    setProfiles(next);
    if (activeProfile?.id === id) setActiveProfile(null);
  };

  const reloadUser = async () => {
    setUser(auth.currentUser ? { ...auth.currentUser } : null);
  };

  return (
    <AuthContext.Provider
      value={{
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
        deleteProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
