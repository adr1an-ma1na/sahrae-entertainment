import type { ProviderId } from '../types/index.ts';

/**
 * Where access tokens live on the device.
 *
 * localStorage, deliberately and with eyes open: these are user-scoped
 * read-only tokens on the user's own device, and any JS that could read
 * localStorage on this origin could equally read an in-memory token. It is NOT
 * suitable for the refresh tokens of a provider that issues long-lived ones —
 * see `persistRefresh` below.
 */

export interface StoredToken {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  /**
   * Present only under 'client' custody. Under 'cookie' custody the refresh
   * token lives server-side in an encrypted httpOnly cookie and never reaches
   * this object — which is the entire point of that mode.
   */
  refreshToken?: string;
  /** Which side holds the refresh token for this session. */
  custody?: 'cookie' | 'client';
  scope?: string;
  tokenType?: string;
}

const KEY = (id: ProviderId) => `sahrae.connector.token.${id}`;

/** Refresh 60s early, so a token never expires mid-request. */
const SKEW_MS = 60_000;

const listeners = new Set<() => void>();
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() { listeners.forEach((l) => { try { l(); } catch { /* a bad listener must not break the store */ } }); }

export function getToken(id: ProviderId): StoredToken | null {
  try {
    const raw = localStorage.getItem(KEY(id));
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    return t && typeof t.accessToken === 'string' ? t : null;
  } catch {
    return null;
  }
}

export function setToken(id: ProviderId, t: StoredToken): void {
  try { localStorage.setItem(KEY(id), JSON.stringify(t)); } catch { /* private mode */ }
  emit();
}

export function clearToken(id: ProviderId): void {
  try { localStorage.removeItem(KEY(id)); } catch { /* ignore */ }
  emit();
}

/** True when a usable, unexpired token exists. */
export function isConnected(id: ProviderId): boolean {
  const t = getToken(id);
  return !!t && t.expiresAt - SKEW_MS > Date.now();
}

/** True when we have a token that has expired but can be refreshed. Under
 *  cookie custody there is no local refresh token, and that is not a reason to
 *  say no — the browser holds the cookie. */
export function isRefreshable(id: ProviderId): boolean {
  const t = getToken(id);
  return !!t && (t.custody === 'cookie' || !!t.refreshToken);
}

export function needsRefresh(id: ProviderId): boolean {
  const t = getToken(id);
  return !!t && t.expiresAt - SKEW_MS <= Date.now();
}

/** Convert a provider's `expires_in` (seconds) into our absolute expiry. */
export function expiryFromSeconds(seconds: number): number {
  return Date.now() + Math.max(0, seconds) * 1000;
}

/**
 * Refresh-token custody.
 *
 * When the backend has SESSION_SECRET set, the refresh token never arrives
 * here: the server seals it into an encrypted httpOnly cookie, so a script on
 * this origin cannot read the long-lived grant. Only the short-lived access
 * token is stored below.
 *
 * Without SESSION_SECRET the server falls back to returning it, and it is kept
 * here — the older, weaker behaviour, reported by /health as
 * refreshCustody: "client" rather than degrading silently.
 *
 * REMAINING GAP, stated honestly: under cookie custody, XSS on this origin can
 * still CALL the refresh endpoint, because the browser attaches the cookie
 * automatically, and obtain an access token that way. What it can no longer do
 * is take the permanent grant and use it later from somewhere else. On native,
 * where the backend is necessarily cross-origin, this should move to secure
 * platform storage (Keychain / EncryptedSharedPreferences) rather than
 * localStorage.
 */
export function custodyOf(id: ProviderId): 'cookie' | 'client' | 'none' {
  const t = getToken(id);
  if (!t) return 'none';
  return t.custody === 'cookie' ? 'cookie' : 'client';
}
