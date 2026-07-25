import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const fbAuth = getAuth(app);

// NOTE: a boot-time `getDocFromServer(doc(db,'test','connection'))` probe used to
// run here on module import. It was removed: the security rules deny that path,
// so it was a guaranteed-failing server round-trip on every cold start for every
// user — pure latency and billed Firestore traffic that told us nothing. The
// first real read reports connectivity just as well.

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  // Deliberately does NOT log email addresses or provider identities. This runs
  // inside a WebView whose console is readable by anything with adb access, and
  // an operational warning never needs the user's personal details to be useful.
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: fbAuth.currentUser?.uid,
      isAnonymous: fbAuth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
}

/**
 * Obtain the Firebase Auth identity used to scope this device's Firestore data.
 *
 * SECURITY — why this is anonymous-only now. The previous implementation signed
 * in with an account whose credentials were *derived from the user id* by a
 * formula that ships in the client bundle:
 *
 *     email    = `${uid}@sahrae.tv.internal`
 *     password = `fb_${uid}_secure_stable`
 *
 * Anyone who learned a uid could therefore authenticate as that user and read or
 * write their entire `users/{uid}` tree. The Firestore rules are written
 * correctly against `request.auth.uid`, but rules cannot help when the client
 * hands out the credential itself. It also minted a permanent Firebase Auth
 * account for every guest device, which grows without bound.
 *
 * Anonymous auth gives Firebase-managed, unguessable credentials that persist
 * locally. The trade-off is honest: this identity is per-device, so cloud watch
 * progress no longer follows a signed-in user across devices. Genuine
 * cross-device sync needs a trusted token exchange — a Supabase Edge Function
 * that verifies the Supabase JWT and mints a Firebase custom token for the same
 * uid. No purely client-side scheme can be both cross-device and unforgeable.
 *
 * Returns null when no Firebase identity is available (e.g. anonymous auth is
 * disabled in the console). Callers must treat null as "skip cloud sync" — the
 * localStorage path in useWatchProgress remains the source of truth on-device.
 */
let pendingAuth: Promise<string | null> | null = null;

export async function syncFirebaseAuth(
  _user: { uid: string; email: string | null } | null,
): Promise<string | null> {
  if (fbAuth.currentUser) return fbAuth.currentUser.uid;

  // Single-flight: useWatchProgress can call this from several effects at once,
  // and concurrent signInAnonymously calls create redundant auth round-trips.
  if (!pendingAuth) {
    pendingAuth = signInAnonymously(fbAuth)
      .then((cred) => cred.user.uid)
      .catch(() => null)
      .finally(() => {
        pendingAuth = null;
      });
  }
  return pendingAuth;
}
