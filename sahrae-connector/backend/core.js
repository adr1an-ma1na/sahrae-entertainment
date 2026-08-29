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

/** Only the fields the client needs — nothing else crosses back. */
function passthrough(json) {
  return {
    access_token: json.access_token,
    // Providers that rotate refresh tokens return a new one; those that do not
    // omit it, and the client keeps the one it holds.
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
    scope: json.scope,
    token_type: json.token_type,
  };
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
    return { status: 200, body: passthrough(json) };
  } catch {
    return { status: 502, body: { error: 'Could not reach the provider’s token endpoint.' } };
  }
}

/** Refresh an access token. */
export async function refreshToken(providerName, secrets, { refreshToken: rt }) {
  const provider = getProvider(providerName);
  if (!provider) return { status: 404, body: { error: `Unknown or unconfigured provider: ${providerName}` } };
  if (!isConfigured(provider, secrets)) {
    return {
      status: 500,
      body: { error: `${providerName} is missing credentials on the server. Set ${provider.idKey} and ${provider.secretKey}.` },
    };
  }
  if (!rt) return { status: 400, body: { error: 'refreshToken is required.' } };

  try {
    const { ok, status, json } = await postToken(provider, secrets, {
      grant_type: 'refresh_token',
      refresh_token: rt,
    });
    if (!ok) return { status, body: { error: safeError(json, 'Refresh failed.') } };
    return { status: 200, body: passthrough(json) };
  } catch {
    return { status: 502, body: { error: 'Could not reach the provider’s token endpoint.' } };
  }
}

export function healthBody(secrets, allowedOrigins) {
  return {
    ok: true,
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
