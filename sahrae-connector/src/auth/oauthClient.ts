import type { ProviderId } from '../types/index.ts';
import { BACKEND_URL, PROVIDERS, REDIRECT_URI, clientId } from './config.ts';
import { buildAuthorizeUrl, createPkcePair, parseCallback, safeEqual } from './pkce.ts';
import { clearToken, expiryFromSeconds, getToken, needsRefresh, setToken, type StoredToken } from './tokenStore.ts';

/**
 * Drives the PKCE authorization-code flow.
 *
 * The browser does the redirect; the BACKEND does the code exchange, because
 * both Spotify and Google require a client secret at the token endpoint and a
 * secret in a client bundle is public. So the split is:
 *
 *   here      → generate verifier, redirect the user, catch the callback
 *   backend   → swap code + verifier (+ secret) for tokens
 *   here      → store the access token, refresh it when it ages out
 */

const PENDING = 'sahrae.connector.pending';

interface Pending {
  provider: ProviderId;
  verifier: string;
  state: string;
  startedAt: number;
}

/** Authorization requests older than this are treated as abandoned. */
const PENDING_TTL_MS = 10 * 60_000;

function readPending(): Pending | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null') as Pending | null;
    if (!p || Date.now() - p.startedAt > PENDING_TTL_MS) return null;
    return p;
  } catch {
    return null;
  }
}

function writePending(p: Pending | null): void {
  try {
    if (p) sessionStorage.setItem(PENDING, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING);
  } catch { /* private mode — the flow will fail closed at the state check */ }
}

export class OAuthError extends Error {
  readonly provider?: ProviderId;
  constructor(message: string, provider?: ProviderId) {
    super(message);
    this.name = 'OAuthError';
    this.provider = provider;
  }
}

/**
 * Begin authorization. Generates the PKCE pair, stashes the verifier for the
 * return leg, and returns the URL to send the user to.
 *
 * Returns the URL rather than navigating, so the caller decides between a
 * same-tab redirect (PWA) and a system browser (native, where an in-app WebView
 * is both worse UX and, for Google, actively refused).
 */
export async function beginAuth(provider: ProviderId): Promise<string> {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new OAuthError(`Unknown provider: ${provider}`);
  if (!cfg.implemented) throw new OAuthError(`${cfg.displayName} is not wired up yet.`, provider);

  const id = clientId(provider);
  if (!id) {
    throw new OAuthError(
      `No client id configured for ${cfg.displayName}. Set VITE_${provider.toUpperCase()}_CLIENT_ID — see sahrae-connector/README.md.`,
      provider,
    );
  }

  const { verifier, challenge, state } = await createPkcePair();
  writePending({ provider, verifier, state, startedAt: Date.now() });

  return buildAuthorizeUrl({
    authorizeEndpoint: cfg.authorizeEndpoint,
    clientId: id,
    redirectUri: REDIRECT_URI,
    scopes: cfg.scopes,
    challenge,
    state,
    extra: cfg.extraAuthParams,
  });
}

/**
 * Finish authorization from the redirect URL.
 *
 * Verifies `state` against the value we stashed before redirecting — without
 * that check an attacker can feed us their own authorization code and quietly
 * connect the user's Sahrae to the attacker's provider account.
 */
export async function completeFromUrl(url: string): Promise<ProviderId> {
  const { code, state, error, errorDescription } = parseCallback(url);
  const pending = readPending();

  if (error) {
    writePending(null);
    throw new OAuthError(errorDescription || error, pending?.provider);
  }
  if (!pending) throw new OAuthError('No authorization was in progress, or it timed out. Try connecting again.');
  if (!code) throw new OAuthError('The provider did not return an authorization code.', pending.provider);
  if (!state || !safeEqual(state, pending.state)) {
    writePending(null);
    throw new OAuthError('Authorization state did not match. The request was discarded.', pending.provider);
  }

  const res = await fetch(`${BACKEND_URL}/oauth/${pending.provider}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Required for the server's httpOnly refresh cookie to be stored.
    credentials: 'include',
    body: JSON.stringify({ code, codeVerifier: pending.verifier, redirectUri: REDIRECT_URI }),
  });

  writePending(null);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new OAuthError(body?.error || `Token exchange failed (${res.status}).`, pending.provider);
  }

  const t = await res.json();
  if (!t?.access_token) throw new OAuthError('The backend returned no access token.', pending.provider);

  setToken(pending.provider, {
    accessToken: t.access_token,
    expiresAt: expiryFromSeconds(Number(t.expires_in) || 3600),
    // Absent under cookie custody: the server kept it, encrypted and httpOnly,
    // so it never enters JavaScript and XSS cannot walk off with a permanent
    // grant. `refresh_custody` records which mode this session is in.
    refreshToken: t.refresh_token,
    custody: t.refresh_custody === 'cookie' ? 'cookie' : 'client',
    scope: t.scope,
    tokenType: t.token_type,
  });
  return pending.provider;
}

// One refresh per provider at a time. Without this, a screen that fires several
// requests on mount would start several refreshes, and every one but the winner
// would be spending a refresh token that the provider may have already rotated.
const inflight = new Map<ProviderId, Promise<StoredToken | null>>();

async function doRefresh(provider: ProviderId): Promise<StoredToken | null> {
  const current = getToken(provider);
  if (!current) return null;
  // Under cookie custody there is nothing local to send — the browser attaches
  // the httpOnly cookie and the server reads the token out of it.
  if (current.custody !== 'cookie' && !current.refreshToken) return null;

  const res = await fetch(`${BACKEND_URL}/oauth/${provider}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(
      current.custody === 'cookie' ? {} : { refreshToken: current.refreshToken },
    ),
  });
  if (!res.ok) {
    // The grant is gone (revoked, expired, rotated away). Clearing is the honest
    // outcome — the UI shows "connect" again instead of failing every call.
    clearToken(provider);
    return null;
  }
  const t = await res.json();
  if (!t?.access_token) { clearToken(provider); return null; }

  const next: StoredToken = {
    accessToken: t.access_token,
    expiresAt: expiryFromSeconds(Number(t.expires_in) || 3600),
    // Providers that rotate refresh tokens return a new one; those that don't
    // omit it, and the existing one stays valid. Under cookie custody neither
    // is ever present here — the server re-seals its own cookie.
    refreshToken: t.refresh_custody === 'cookie' ? undefined : (t.refresh_token || current.refreshToken),
    custody: t.refresh_custody === 'cookie' ? 'cookie' : 'client',
    scope: t.scope || current.scope,
    tokenType: t.token_type || current.tokenType,
  };
  setToken(provider, next);
  return next;
}

export function refresh(provider: ProviderId): Promise<StoredToken | null> {
  const existing = inflight.get(provider);
  if (existing) return existing;
  const p = doRefresh(provider).finally(() => inflight.delete(provider));
  inflight.set(provider, p);
  return p;
}

/** A valid access token, refreshing first if it has aged out. */
export async function getAccessToken(provider: ProviderId): Promise<string | null> {
  const t = getToken(provider);
  if (!t) return null;
  if (!needsRefresh(provider)) return t.accessToken;
  const next = await refresh(provider);
  return next?.accessToken || null;
}

export function disconnect(provider: ProviderId): void {
  clearToken(provider);
}

/**
 * Authorized fetch against a provider's API.
 *
 * Retries exactly once on a 401 after forcing a refresh: a token can expire
 * between our expiry check and the request arriving, and the provider is the
 * authority on that, not our clock.
 */
export async function providerFetch(provider: ProviderId, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken(provider);
  if (!token) throw new OAuthError(`Not connected to ${PROVIDERS[provider].displayName}.`, provider);

  const call = (bearer: string) =>
    fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${bearer}` } });

  let res = await call(token);
  if (res.status === 401) {
    const next = await refresh(provider);
    if (next?.accessToken) res = await call(next.accessToken);
  }
  return res;
}
