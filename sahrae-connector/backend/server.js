/**
 * sahrae-connector OAuth backend.
 *
 * Its entire job is to hold the client secrets and perform the two calls that
 * require them: the authorization-code exchange and the refresh. The frontend
 * never sees a secret, which is the point — a secret shipped in a browser bundle
 * is a published secret.
 *
 * It is deliberately stateless: no database, no session, no token storage. It
 * takes a code, returns tokens, and forgets. See the Phase 2 note at the bottom
 * for why refresh-token custody should move here before real users.
 *
 *   POST /oauth/:provider/token    { code, codeVerifier, redirectUri }
 *   POST /oauth/:provider/refresh  { refreshToken }
 *   GET  /health
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8787;

app.use(express.json({ limit: '16kb' }));

/**
 * CORS allow-list. An open `*` here would let any site drive token exchange
 * using our client secret, so origins are explicit and the default is the local
 * dev server only.
 */
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,https://localhost')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // No Origin header: same-origin, curl, or the Capacitor WebView. Allowed —
    // there is no browser credential to protect in those cases.
    if (!origin) return cb(null, true);
    if (ALLOWED.includes(origin)) return cb(null, true);
    cb(new Error(`Origin not allowed: ${origin}`));
  },
  methods: ['POST', 'GET', 'OPTIONS'],
}));

/** Per-provider token endpoints and credentials, from the environment only. */
const PROVIDERS = {
  spotify: {
    tokenEndpoint: 'https://accounts.spotify.com/api/token',
    clientId: () => process.env.SPOTIFY_CLIENT_ID,
    clientSecret: () => process.env.SPOTIFY_CLIENT_SECRET,
    // Spotify wants the client credentials as HTTP Basic, not form fields.
    auth: 'basic',
  },
  youtube: {
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    clientId: () => process.env.YOUTUBE_CLIENT_ID,
    clientSecret: () => process.env.YOUTUBE_CLIENT_SECRET,
    auth: 'body',
  },
  // apple / deezer / soundcloud are stubs in Phase 1 and intentionally absent:
  // an unconfigured provider must 404 rather than half-work.
};

function providerOr404(req, res) {
  const p = PROVIDERS[req.params.provider];
  if (!p) {
    res.status(404).json({ error: `Unknown or unconfigured provider: ${req.params.provider}` });
    return null;
  }
  if (!p.clientId() || !p.clientSecret()) {
    res.status(500).json({
      error: `${req.params.provider} is missing credentials on the server. Set ${req.params.provider.toUpperCase()}_CLIENT_ID and _CLIENT_SECRET.`,
    });
    return null;
  }
  return p;
}

/** POST form-encoded to a token endpoint, applying the provider's auth style. */
async function postToken(provider, params) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const body = new URLSearchParams(params);

  if (provider.auth === 'basic') {
    const basic = Buffer.from(`${provider.clientId()}:${provider.clientSecret()}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
  } else {
    body.set('client_id', provider.clientId());
    body.set('client_secret', provider.clientSecret());
  }

  const res = await fetch(provider.tokenEndpoint, { method: 'POST', headers, body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, json };
}

/** Never echo a provider's raw error body — it can contain the request's secrets. */
function safeError(json, fallback) {
  const code = json?.error_description || json?.error?.message || json?.error || fallback;
  return typeof code === 'string' ? code.slice(0, 300) : fallback;
}

app.post('/oauth/:provider/token', async (req, res) => {
  const provider = providerOr404(req, res);
  if (!provider) return;

  const { code, codeVerifier, redirectUri } = req.body || {};
  if (!code || !codeVerifier || !redirectUri) {
    return res.status(400).json({ error: 'code, codeVerifier and redirectUri are all required.' });
  }

  try {
    const { ok, status, json } = await postToken(provider, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    if (!ok) {
      console.error(`[${req.params.provider}] token exchange failed:`, status, json?.error || '');
      return res.status(status).json({ error: safeError(json, 'Token exchange failed.') });
    }
    // Pass through only the fields the client needs.
    return res.json({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_in: json.expires_in,
      scope: json.scope,
      token_type: json.token_type,
    });
  } catch (err) {
    console.error(`[${req.params.provider}] token exchange threw:`, err?.message);
    return res.status(502).json({ error: 'Could not reach the provider’s token endpoint.' });
  }
});

app.post('/oauth/:provider/refresh', async (req, res) => {
  const provider = providerOr404(req, res);
  if (!provider) return;

  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required.' });

  try {
    const { ok, status, json } = await postToken(provider, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    if (!ok) {
      console.error(`[${req.params.provider}] refresh failed:`, status, json?.error || '');
      return res.status(status).json({ error: safeError(json, 'Refresh failed.') });
    }
    return res.json({
      access_token: json.access_token,
      // Providers that rotate refresh tokens return a new one; those that do not
      // omit it and the client keeps the one it has.
      refresh_token: json.refresh_token,
      expires_in: json.expires_in,
      scope: json.scope,
      token_type: json.token_type,
    });
  } catch (err) {
    console.error(`[${req.params.provider}] refresh threw:`, err?.message);
    return res.status(502).json({ error: 'Could not reach the provider’s token endpoint.' });
  }
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    providers: Object.fromEntries(
      Object.entries(PROVIDERS).map(([k, v]) => [k, { configured: !!(v.clientId() && v.clientSecret()) }]),
    ),
    allowedOrigins: ALLOWED,
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('unhandled:', err?.message);
  res.status(err?.message?.startsWith('Origin not allowed') ? 403 : 500)
    .json({ error: err?.message || 'Internal error' });
});

/**
 * PHASE 2 NOTE — refresh-token custody.
 *
 * Right now the refresh token is handed back to the client and kept in
 * localStorage. Google's refresh tokens do not expire, so that is a long-lived
 * grant sitting somewhere an XSS on the app origin could read it.
 *
 * Before real users: keep the refresh token here, keyed by a Sahrae session
 * (httpOnly, SameSite=Lax cookie), and return only the short-lived access token
 * to the client. That needs a session store, which is why it is not in Phase 1 —
 * but it should land before this is public, not after.
 */
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`sahrae-connector backend on :${PORT}`);
    for (const [name, p] of Object.entries(PROVIDERS)) {
      if (!p.clientId() || !p.clientSecret()) console.warn(`  ⚠ ${name}: credentials not set`);
    }
  });
}

export default app;
