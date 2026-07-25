/**
 * Authentication layer with TWO backends behind one stable API:
 *
 *  • SUPABASE (cloud) — used automatically when src/supabase.ts has credentials.
 *    Real accounts that persist across reinstalls and devices.
 *  • LOCAL SHIM (fallback) — localStorage-only, used when no Supabase keys are
 *    set, so a sideloaded build still "works" without a backend.
 *
 * The exported names match what the app imports, so useAuth / AuthModal need no
 * changes regardless of which backend is active.
 */
import { supabase } from './supabase';
import type { User as SbUser } from '@supabase/supabase-js';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface StoredUser extends User {
  /** Random per-account PBKDF2 salt (hex). Absent on pre-PBKDF2 records. */
  passwordSalt?: string;
  passwordHash: string;
}

const ACCOUNTS_KEY = 'sahrae_accounts';
const SESSION_KEY = 'sahrae_session_uid';

type AuthListener = (user: User | null) => void;

function loadAccounts(): Record<string, StoredUser> {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveAccounts(accounts: Record<string, StoredUser>) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}
function toPublic(u: StoredUser): User {
  return { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL };
}
/**
 * Password verifier for the offline shim.
 *
 * This used to be djb2 folded to 32 bits. That is not a password hash: the whole
 * output space is 4 billion values, so any password collides in seconds on a
 * phone, and the digests sit in localStorage where anything with device access
 * can read them. Since people reuse passwords, a weak local digest leaks their
 * credentials for other services, not just this app.
 *
 * PBKDF2-SHA256 with a per-account random salt and 210,000 iterations (the
 * OWASP 2023 floor for PBKDF2-HMAC-SHA256). WebCrypto is always available here:
 * the app is served over https://localhost in the WebView and https on the web,
 * both secure contexts.
 */
const PBKDF2_ITERATIONS = 210_000;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function derivePasswordHash(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

/** Constant-time compare so verification cannot be timed character by character. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function genId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function findByUid(uid: string): { key: string; user: StoredUser } | null {
  const accounts = loadAccounts();
  for (const key of Object.keys(accounts)) {
    if (accounts[key].uid === uid) return { key, user: accounts[key] };
  }
  return null;
}

/** Map a Supabase user onto our app User shape. */
function mapSb(u: SbUser | null | undefined): User | null {
  if (!u) return null;
  const m = (u.user_metadata || {}) as Record<string, unknown>;
  return {
    uid: u.id,
    email: u.email ?? null,
    displayName: (m.displayName as string) || (m.full_name as string) || (m.name as string) || null,
    photoURL: (m.photoURL as string) || (m.avatar_url as string) || null,
  };
}

class LocalAuth {
  currentUser: User | null = null;
  private listeners: AuthListener[] = [];

  constructor() {
    // Only restore the local session when there's no cloud backend; with
    // Supabase the real session is hydrated from getSession() below.
    if (!supabase) {
      const uid = localStorage.getItem(SESSION_KEY);
      if (uid) {
        const found = findByUid(uid);
        if (found) this.currentUser = toPublic(found.user);
      }
    }
  }

  subscribe(cb: AuthListener): () => void {
    this.listeners.push(cb);
    cb(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  setUser(user: User | null) {
    this.currentUser = user;
    if (!supabase) {
      if (user) localStorage.setItem(SESSION_KEY, user.uid);
      else localStorage.removeItem(SESSION_KEY);
    }
    this.listeners.forEach((l) => l(user));
  }
}

export const auth = new LocalAuth();

// Hydrate + track the cloud session when Supabase is configured.
if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    auth.setUser(mapSb(data.session?.user));
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    auth.setUser(mapSb(session?.user));
  });
}

export function onAuthStateChanged(_auth: LocalAuth, cb: AuthListener): () => void {
  return auth.subscribe(cb);
}

export function getRedirectResult(_auth?: unknown): Promise<null> {
  return Promise.resolve(null);
}

export async function createUserWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const e = (email || '').trim().toLowerCase();
  if (!e) throw new Error('Please enter an email address.');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

  if (supabase) {
    const { data, error } = await supabase.auth.signUp({ email: e, password });
    if (error) throw new Error(error.message);
    const u = mapSb(data.user);
    if (u) auth.setUser(u);
    return { user: u };
  }

  const accounts = loadAccounts();
  if (accounts[e]) throw new Error('An account with this email already exists. Try signing in instead.');
  const passwordSalt = newSalt();
  const user: StoredUser = {
    uid: genId('u_'),
    email: e,
    displayName: null,
    photoURL: null,
    passwordSalt,
    passwordHash: await derivePasswordHash(password, passwordSalt),
  };
  accounts[e] = user;
  saveAccounts(accounts);
  const p = toPublic(user);
  auth.setUser(p);
  return { user: p };
}

export async function signInWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const e = (email || '').trim().toLowerCase();

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
    if (error) throw new Error(error.message);
    const u = mapSb(data.user);
    if (u) auth.setUser(u);
    return { user: u };
  }

  const accounts = loadAccounts();
  const u = accounts[e];
  // Accounts created before salted PBKDF2 have no salt. They cannot be verified
  // any more (by design — the old digest was not a safe credential store), so
  // they are treated as unknown and the person signs up again. The shim only
  // runs when no Supabase backend is configured, so this affects offline-only
  // installs, and their data is local anyway.
  if (!u || !u.passwordSalt) {
    throw new Error('Incorrect email or password.');
  }
  const candidate = await derivePasswordHash(password, u.passwordSalt);
  if (!safeEqual(candidate, u.passwordHash)) {
    throw new Error('Incorrect email or password.');
  }
  const p = toPublic(u);
  auth.setUser(p);
  return { user: p };
}

export async function sendPasswordResetEmail(_auth: unknown, email: string) {
  if (supabase) {
    const e = (email || '').trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(e, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    if (error) throw new Error(error.message);
    return;
  }
  throw new Error('Password reset needs an online account. Please create a new account to continue.');
}

export async function updateProfile(
  user: User,
  data: { displayName?: string | null; photoURL?: string | null },
) {
  if (supabase) {
    const { data: res, error } = await supabase.auth.updateUser({
      data: { displayName: data.displayName, photoURL: data.photoURL },
    });
    if (error) throw new Error(error.message);
    const u = mapSb(res.user);
    if (u && auth.currentUser && auth.currentUser.uid === u.uid) auth.setUser(u);
    return;
  }

  const found = findByUid(user.uid);
  if (!found) return;
  const accounts = loadAccounts();
  if (data.displayName !== undefined) accounts[found.key].displayName = data.displayName;
  if (data.photoURL !== undefined) accounts[found.key].photoURL = data.photoURL;
  saveAccounts(accounts);
  if (auth.currentUser && auth.currentUser.uid === user.uid) {
    auth.setUser(toPublic(accounts[found.key]));
  }
}

export async function updatePassword(user: User, newPassword: string) {
  if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters.');

  if (supabase) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    return;
  }

  const found = findByUid(user.uid);
  if (!found) throw new Error('Account not found. Please sign in again.');
  const accounts = loadAccounts();
  const salt = newSalt();
  accounts[found.key].passwordSalt = salt;
  accounts[found.key].passwordHash = await derivePasswordHash(newPassword, salt);
  saveAccounts(accounts);
}

/** Google sign-in (cloud) or a local guest session when offline-only. */
export async function loginWithGoogle() {
  if (supabase) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) throw new Error(error.message);
    // onAuthStateChange will deliver the session when the OAuth flow returns.
    return { user: auth.currentUser };
  }

  const user: User = { uid: genId('guest_'), email: null, displayName: 'Guest', photoURL: null };
  const accounts = loadAccounts();
  // Guest sessions have no password, so no salt either — signInWithEmailAndPassword
  // rejects any record without a salt, which is the correct outcome here.
  accounts['guest:' + user.uid] = { ...user, passwordSalt: '', passwordHash: '' };
  saveAccounts(accounts);
  auth.setUser(user);
  return { user };
}

export async function logout() {
  if (supabase) {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
  }
  auth.setUser(null);
}

// ── Profiles (Netflix-style sub-profiles) ──
// Stored in the Supabase user's metadata when cloud auth is active, so they
// follow the account across reinstalls + devices. Falls back to localStorage
// (per-uid) on the local shim.
export interface StoredProfile { id: string; name: string; avatar: string }
const profilesKey = (uid: string) => `sahrae_profiles_${uid}`;

export async function getProfiles(): Promise<StoredProfile[]> {
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      const m = (data.user?.user_metadata || {}) as Record<string, unknown>;
      return Array.isArray(m.profiles) ? (m.profiles as StoredProfile[]) : [];
    } catch { return []; }
  }
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try { return JSON.parse(localStorage.getItem(profilesKey(uid)) || '[]'); } catch { return []; }
}

export async function saveProfiles(profiles: StoredProfile[]): Promise<void> {
  if (supabase) {
    try { await supabase.auth.updateUser({ data: { profiles } }); } catch { /* ignore */ }
    return;
  }
  const uid = auth.currentUser?.uid;
  if (uid) { try { localStorage.setItem(profilesKey(uid), JSON.stringify(profiles)); } catch { /* ignore */ } }
}
