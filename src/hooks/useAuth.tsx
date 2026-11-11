import React, { createContext, useContext, useEffect, useState } from 'react';
import { push } from '../services/cloudSync';
import { User, auth, onAuthStateChanged, loginWithGoogle, logout, getProfiles, saveProfiles } from '../firebase';

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
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);

  // The profile last used on this device opens by itself next time, so a
  // launch goes straight to Home. Switch Profile in Settings still offers the
  // others.
  const lastKey = (uid: string) => `sahrae.lastProfile.${uid}`;
  const setActiveProfile = (p: Profile | null) => {
    setActiveProfileState(p);
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try { if (p) localStorage.setItem(lastKey(uid), p.id); else localStorage.removeItem(lastKey(uid)); } catch { /* private mode */ }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // The account's profiles, asked for again when the line is poor: given up
        // on, a new empty profile took the place of the viewer's own.
        const ask = async () => {
          for (const wait of [0, 1500, 4000]) {
            if (wait) await new Promise((r) => setTimeout(r, wait));
            try { return await getProfiles(); } catch { /* try again */ }
          }
          throw new Error('profiles unavailable');
        };
        ask().then((ps) => {
          if (ps.length) {
            setProfiles(ps as Profile[]);
            let last: string | null = null;
            try { last = localStorage.getItem(lastKey(u.uid)); } catch { /* private mode */ }
            const again = (ps as Profile[]).find((p) => p.id === last);
            if (again) setActiveProfileState((cur) => cur ?? again);
            return;
          }
          // A new account: make its first profile from the account's name and
          // go straight in, as Netflix does, instead of an empty "Who's
          // watching?" asking them to build one before they can see anything.
          // Its id comes from the account, so making it again finds the same lists.
          const first: Profile = {
            id: `profile_${u.uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
            name: (u.displayName || (u.email || 'Me').split('@')[0]).slice(0, 20),
            avatar: 'https://api.dicebear.com/8.x/micah/svg?seed=Picasso&backgroundColor=ffdfbf',
          };
          setProfiles([first]);
          setActiveProfile(first);
          saveProfiles([first]).catch(() => {});
        }).catch(() => {
          // Still no answer: the profile this device used last, so its lists show.
          let last: string | null = null;
          try { last = localStorage.getItem(lastKey(u.uid)); } catch { /* private mode */ }
          if (last) {
            const kept: Profile = { id: last, name: (u.displayName || (u.email || 'Me').split('@')[0]).slice(0, 20), avatar: 'https://api.dicebear.com/8.x/micah/svg?seed=Picasso&backgroundColor=ffdfbf' };
            setProfiles([kept]);
            setActiveProfileState((cur) => cur ?? kept);
          } else setProfiles([]);
        })
          // Starting screen until the profiles are in, so a returning viewer
          // never sees "Who's watching?" flash before their profile opens.
          .finally(() => setLoading(false));
      } else {
        setProfiles([]);
        setActiveProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const addProfile = async (name: string, avatar: string) => {
    if (!user) return;
    if (profiles.length >= 5) throw new Error('Maximum 5 profiles allowed');
    const id = `profile_${Date.now()}`;
    const next = [...profiles, { id, name, avatar }];
    await saveProfiles(next);
    setProfiles(next);
  };

  const updateProfileData = async (id: string, name: string, avatar: string) => {
    if (!user) return;
    const next = profiles.map((p) => (p.id === id ? { id, name, avatar } : p));
    await saveProfiles(next);
    setProfiles(next);
    if (activeProfile?.id === id) setActiveProfile({ id, name, avatar });
  };

  const deleteProfile = async (id: string) => {
    if (!user) return;
    const next = profiles.filter((p) => p.id !== id);
    await saveProfiles(next);
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
        login: async () => { await loginWithGoogle(); },
        logout: async () => {
          // Continue Watching may not have been sent yet: send it, waiting at most a moment.
          await Promise.race([push().catch(() => false), new Promise((r) => setTimeout(r, 2500))]);
          await logout();
        },
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
