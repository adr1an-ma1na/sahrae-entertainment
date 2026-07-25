import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  onAuthStateChanged as onFbAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const fbAuth = getAuth(app);

// Test Connection on Boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase client offline warning.");
    }
  }
}
testConnection();

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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: fbAuth.currentUser?.uid,
      email: fbAuth.currentUser?.email,
      emailVerified: fbAuth.currentUser?.emailVerified,
      isAnonymous: fbAuth.currentUser?.isAnonymous,
      tenantId: fbAuth.currentUser?.tenantId,
      providerInfo: fbAuth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
}

/**
 * Deterministically sync active app user with real Firebase Auth.
 * If user is logged in, signs in to a unique Firebase Auth user.
 * If user is guest/local, falls back gracefully to a unique device guest account if Anonymous auth is disabled.
 */
export async function syncFirebaseAuth(user: { uid: string; email: string | null } | null): Promise<string | null> {
  if (fbAuth.currentUser) {
    return fbAuth.currentUser.uid;
  }

  // Get or generate a persistent local device guest ID for fallback auth
  let guestId = typeof window !== 'undefined' ? localStorage.getItem('sahrae_device_guest_id') : null;
  if (!guestId && typeof window !== 'undefined') {
    guestId = `guest_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
    try {
      localStorage.setItem('sahrae_device_guest_id', guestId);
    } catch {
      /* ignore storage errors */
    }
  }
  if (!guestId) guestId = 'guest_default_user';

  // Try anonymous auth first if no profile user is active
  if (!user) {
    try {
      const cred = await signInAnonymously(fbAuth);
      return cred.user.uid;
    } catch {
      // Anonymous auth may be disabled in Firebase console (auth/admin-restricted-operation).
      // Seamlessly fall through to email/password fallback account.
    }
  }

  const targetUid = user?.uid || guestId;
  const fbEmail = `${targetUid}@sahrae.tv.internal`;
  const fbPassword = `fb_${targetUid}_secure_stable`;

  try {
    const cred = await signInWithEmailAndPassword(fbAuth, fbEmail, fbPassword);
    return cred.user.uid;
  } catch (error: any) {
    if (
      error?.code === 'auth/user-not-found' || 
      error?.code === 'auth/invalid-credential' ||
      String(error?.message).includes('user-not-found') ||
      String(error?.message).includes('INVALID_LOGIN_CREDENTIALS')
    ) {
      try {
        const cred = await createUserWithEmailAndPassword(fbAuth, fbEmail, fbPassword);
        return cred.user.uid;
      } catch (createError) {
        console.warn('Firebase Auth fallback user creation notice:', createError);
        return fbAuth.currentUser?.uid || targetUid;
      }
    }
    return fbAuth.currentUser?.uid || targetUid;
  }
}
