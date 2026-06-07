/**
 * On-device authentication — NO Firebase, NO network.
 *
 * Accounts, the active session and password changes all live in localStorage,
 * so signing in works reliably on a sideloaded APK (TV / phone / laptop)
 * without any backend that could be misconfigured or unreachable.
 *
 * The exported names match what the app previously imported from Firebase, so
 * the rest of the codebase needs no churn.
 */

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface StoredUser extends User {
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
function hashPassword(s: string): string {
  // djb2 — not cryptographic, just so the raw password isn't stored verbatim.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
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

class LocalAuth {
  currentUser: User | null = null;
  private listeners: AuthListener[] = [];

  constructor() {
    const uid = localStorage.getItem(SESSION_KEY);
    if (uid) {
      const found = findByUid(uid);
      if (found) this.currentUser = toPublic(found.user);
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
    if (user) localStorage.setItem(SESSION_KEY, user.uid);
    else localStorage.removeItem(SESSION_KEY);
    this.listeners.forEach((l) => l(user));
  }
}

export const auth = new LocalAuth();

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
  const accounts = loadAccounts();
  if (accounts[e]) throw new Error('An account with this email already exists. Try signing in instead.');
  const user: StoredUser = {
    uid: genId('u_'),
    email: e,
    displayName: null,
    photoURL: null,
    passwordHash: hashPassword(password),
  };
  accounts[e] = user;
  saveAccounts(accounts);
  const p = toPublic(user);
  auth.setUser(p);
  return { user: p };
}

export async function signInWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const e = (email || '').trim().toLowerCase();
  const accounts = loadAccounts();
  const u = accounts[e];
  if (!u || u.passwordHash !== hashPassword(password)) {
    throw new Error('Incorrect email or password.');
  }
  const p = toPublic(u);
  auth.setUser(p);
  return { user: p };
}

export async function sendPasswordResetEmail(_auth: unknown, _email: string) {
  throw new Error('Password reset needs an online account. Please create a new account to continue.');
}

export async function updateProfile(
  user: User,
  data: { displayName?: string | null; photoURL?: string | null },
) {
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
  const found = findByUid(user.uid);
  if (!found) throw new Error('Account not found. Please sign in again.');
  const accounts = loadAccounts();
  accounts[found.key].passwordHash = hashPassword(newPassword);
  saveAccounts(accounts);
}

/** No Google offline — start a local guest session so the user gets straight in. */
export async function loginWithGoogle() {
  const user: User = { uid: genId('guest_'), email: null, displayName: 'Guest', photoURL: null };
  const accounts = loadAccounts();
  accounts['guest:' + user.uid] = { ...user, passwordHash: '' };
  saveAccounts(accounts);
  auth.setUser(user);
  return { user };
}

export async function logout() {
  auth.setUser(null);
}
