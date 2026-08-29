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
  refreshToken?: string;
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

/** True when we have a token that has expired but can be refreshed. */
export function isRefreshable(id: ProviderId): boolean {
  const t = getToken(id);
  return !!t && !!t.refreshToken;
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
 * A refresh token is long-lived credential material. Google's, in particular,
 * does not expire — so keeping one in localStorage means a persistent grant
 * sitting in a place any XSS on this origin can read.
 *
 * Phase 1 keeps it client-side because there is no session backend yet to hold
 * it against. Before this ships to real users, the refresh token should stay on
 * the backend, bound to a Sahrae session cookie, with the client only ever
 * holding the short-lived access token. Flagged here rather than buried in the
 * README because this is the file where the mistake would be made.
 */
export const persistRefresh = true;
