/**
 * Token exchange, framework-free.
 *
 * Shared by the Express server (local development) and the Cloudflare Worker
 * (deployment) so the two cannot drift. Everything here takes its secrets as an
 * argument rather than reading a global, because Workers has no `process.env`
 * and a module that reaches for one is a module that only runs in one place.
 *
 * Stateless by design: takes a code, returns tokens, forgets. See the note in
 * README about moving refresh-token custody here before real users.
 */

import { buildCookie, clearCookie, custodyAvailable, CUSTODY_HINT, readCookie, seal, unseal } from './session.js';

/** Per-provider token endpoints and how each wants its client credentials. */
export const PROVIDERS = {
  spotify: {
    tokenEndpoint: 'https://accounts.spotify.com/api/token',
    idKey: 'SPOTIFY_CLIENT_ID',
    secretKey: 'SPOTIFY_CLIENT_SECRET',
    // Spotify wants the credentials as HTTP Basic, not as form fields.
    auth: 'basic',
  },
  youtube: {
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    idKey: 'YOUTUBE_CLIENT_ID',
    secretKey: 'YOUTUBE_CLIENT_SECRET',
    auth: 'body',
  },
  // apple / deezer / soundcloud are stubs in the frontend and intentionally
  // absent here: an unconfigured provider must 404 rather than half-work.
};

export function getProvider(name) {
  return PROVIDERS[name] || null;
}

export function credentialsFor(provider, secrets) {
  return {
    clientId: secrets[provider.idKey],
    clientSecret: secrets[provider.secretKey],
  };
}

// Re-exported for callers that only import core.js.
export { custodyAvailable, CUSTODY_HINT };

export function isConfigured(provider, secrets) {
  const { clientId, clientSecret } = credentialsFor(provider, secrets);
  return !!clientId && !!clientSecret;
}

/** base64 that works in both Node and the Workers runtime. */
function base64(input) {
  if (typeof btoa === 'function') return btoa(input);
  return Buffer.from(input, 'utf8').toString('base64');
}

/** Never echo a provider's raw error body — it can contain request credentials. */
export function safeError(json, fallback) {
  const code = json?.error_description || json?.error?.message || json?.error || fallback;
  return typeof code === 'string' ? code.slice(0, 300) : fallback;
}

/** POST form-encoded to a token endpoint, applying the provider's auth style. */
async function postToken(provider, secrets, params) {
  const { clientId, clientSecret } = credentialsFor(provider, secrets);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const body = new URLSearchParams(params);

  if (provider.auth === 'basic') {
    headers.Authorization = `Basic ${base64(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  const res = await fetch(provider.tokenEndpoint, { method: 'POST', headers, body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, json };
}

/**
 * Only the fields the client needs — nothing else crosses back.
 *
 * `refresh_token` is included ONLY when cookie custody is unavailable. When it
 * is available the token stays server-side in an encrypted httpOnly cookie and
 * the browser never sees it; `refresh_custody` tells the client which happened
 * so it does not sit waiting for a value that is not coming.
 */
function passthrough(json, custody) {
  const out = {
    access_token: json.access_token,
    expires_in: json.expires_in,
    scope: json.scope,
    token_type: json.token_type,
    refresh_custody: custody,
  };
  // Providers that rotate refresh tokens return a new one; those that do not
  // omit it, and whoever holds the old one keeps it.
  if (custody === 'client' && json.refresh_token) out.refresh_token = json.refresh_token;
  return out;
}

/**
 * Authorization-code exchange (PKCE).
 * Returns { status, body } ready to serialise — no framework types involved.
 */
export async function exchangeCode(providerName, secrets, { code, codeVerifier, redirectUri }) {
  const provider = getProvider(providerName);
  if (!provider) return { status: 404, body: { error: `Unknown or unconfigured provider: ${providerName}` } };
  if (!isConfigured(provider, secrets)) {
    return {
      status: 500,
      body: { error: `${providerName} is missing credentials on the server. Set ${provider.idKey} and ${provider.secretKey}.` },
    };
  }
  if (!code || !codeVerifier || !redirectUri) {
    return { status: 400, body: { error: 'code, codeVerifier and redirectUri are all required.' } };
  }

  try {
    const { ok, status, json } = await postToken(provider, secrets, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    if (!ok) return { status, body: { error: safeError(json, 'Token exchange failed.') } };

    // Keep the refresh token server-side where we can. It is the long-lived
    // credential; the access token expires in an hour and is far less valuable.
    if (custodyAvailable(secrets) && json.refresh_token) {
      const sealed = await seal(json.refresh_token, secrets.SESSION_SECRET);
      return {
        status: 200,
        body: passthrough(json, 'cookie'),
        setCookie: buildCookie(providerName, sealed),
      };
    }
    return { status: 200, body: passthrough(json, 'client') };
  } catch {
    return { status: 502, body: { error: 'Could not reach the provider’s token endpoint.' } };
  }
}

/** Refresh an access token. */
export async function refreshToken(providerName, secrets, { refreshToken: rt }, cookieHeader) {
  const provider = getProvider(providerName);
  if (!provider) return { status: 404, body: { error: `Unknown or unconfigured provider: ${providerName}` } };
  if (!isConfigured(provider, secrets)) {
    return {
      status: 500,
      body: { error: `${providerName} is missing credentials on the server. Set ${provider.idKey} and ${provider.secretKey}.` },
    };
  }
  // Prefer the cookie: if one is present, the client is not supposed to be
  // holding a refresh token at all, and trusting a body value over it would let
  // a caller substitute their own.
  let token = rt;
  let viaCookie = false;
  if (custodyAvailable(secrets)) {
    const sealed = readCookie(cookieHeader, providerName);
    if (sealed) {
      const opened = await unseal(sealed, secrets.SESSION_SECRET);
      if (opened) { token = opened; viaCookie = true; }
    }
  }

  if (!token) {
    return {
      status: 400,
      body: {
        error: custodyAvailable(secrets)
          ? 'No refresh session. Reconnect this service.'
          : 'refreshToken is required.',
      },
      // A cookie that will not open is a cookie worth removing, or the client
      // retries against it forever.
      ...(custodyAvailable(secrets) ? { setCookie: clearCookie(providerName) } : {}),
    };
  }

  try {
    const { ok, status, json } = await postToken(provider, secrets, {
      grant_type: 'refresh_token',
      refresh_token: token,
    });
    if (!ok) {
      // The grant is gone (revoked, expired, rotated away). Drop the cookie so
      // the UI shows "connect" instead of failing every call from now on.
      return {
        status,
        body: { error: safeError(json, 'Refresh failed.') },
        ...(viaCookie ? { setCookie: clearCookie(providerName) } : {}),
      };
    }

    if (viaCookie) {
      // Re-seal when the provider rotated the token; otherwise leave the
      // existing cookie alone rather than rewriting an identical one.
      const next = json.refresh_token;
      return {
        status: 200,
        body: passthrough(json, 'cookie'),
        ...(next ? { setCookie: buildCookie(providerName, await seal(next, secrets.SESSION_SECRET)) } : {}),
      };
    }
    return { status: 200, body: passthrough(json, 'client') };
  } catch {
    return { status: 502, body: { error: 'Could not reach the provider’s token endpoint.' } };
  }
}

export function healthBody(secrets, allowedOrigins) {
  return {
    ok: true,
    // Surfaced so a misconfigured deployment is visible rather than silently
    // running in the weaker mode.
    refreshCustody: custodyAvailable(secrets) ? 'cookie' : 'client',
    ...(custodyAvailable(secrets) ? {} : { hint: CUSTODY_HINT }),
    providers: Object.fromEntries(
      Object.entries(PROVIDERS).map(([name, p]) => [name, { configured: isConfigured(p, secrets) }]),
    ),
    allowedOrigins,
  };
}

/**
 * Parse the CORS allow-list. Explicit origins only — an open `*` would let any
 * site drive token exchange using our client secret.
 */
export function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Whether an Origin may call us.
 *
 * A missing Origin is allowed: that is a same-origin request, curl, or the
 * Capacitor WebView, none of which carry a browser credential to protect.
 */
export function originAllowed(origin, allowed) {
  if (!origin) return true;
  return allowed.includes(origin);
}
