/**
 * sahrae-connector OAuth backend — Express, for local development.
 *
 * The deployment target is worker.js (Cloudflare Workers). Both delegate to
 * core.js so their behaviour cannot drift; this file exists because running
 * Express locally is simpler than running Wrangler, and because a plain Node
 * process is easier to attach a debugger to.
 *
 *   POST /oauth/:provider/token    { code, codeVerifier, redirectUri }
 *   POST /oauth/:provider/refresh  { refreshToken }
 *   GET  /health
 *
 * Its entire job is to hold the client secrets and perform the two calls that
 * need them. The frontend never sees a secret — a secret shipped in a browser
 * bundle is a published secret.
 */

import express from 'express';
import cors from 'cors';
import {
  exchangeCode, healthBody, isConfigured, parseOrigins, PROVIDERS, refreshToken,
} from './core.js';

const app = express();
const PORT = process.env.PORT || 8787;

app.use(express.json({ limit: '16kb' }));

const ALLOWED = parseOrigins(
  process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,https://localhost',
);

app.use(cors({
  origin(origin, cb) {
    // No Origin header: same-origin, curl, or the Capacitor WebView. Allowed —
    // there is no browser credential to protect in those cases.
    if (!origin) return cb(null, true);
    if (ALLOWED.includes(origin)) return cb(null, true);
    cb(new Error(`Origin not allowed: ${origin}`));
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  // The refresh cookie must travel on cross-origin dev setups.
  credentials: true,
}));

app.post('/oauth/:provider/token', async (req, res) => {
  const r = await exchangeCode(req.params.provider, process.env, req.body || {});
  if (r.status >= 400) console.error(`[${req.params.provider}] token -> ${r.status}`);
  if (r.setCookie) res.setHeader('Set-Cookie', r.setCookie);
  res.status(r.status).json(r.body);
});

app.post('/oauth/:provider/refresh', async (req, res) => {
  const r = await refreshToken(req.params.provider, process.env, req.body || {}, req.headers.cookie);
  if (r.status >= 400) console.error(`[${req.params.provider}] refresh -> ${r.status}`);
  if (r.setCookie) res.setHeader('Set-Cookie', r.setCookie);
  res.status(r.status).json(r.body);
});

app.get('/health', (_req, res) => res.json(healthBody(process.env, ALLOWED)));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('unhandled:', err?.message);
  res.status(err?.message?.startsWith('Origin not allowed') ? 403 : 500)
    .json({ error: err?.message || 'Internal error' });
});

/**
 * NOTE — refresh-token custody.
 *
 * The refresh token is currently handed back to the client and kept in
 * localStorage. Google's refresh tokens do not expire, so that is a long-lived
 * grant sitting somewhere an XSS on the app origin could read.
 *
 * Before real users: keep it here (or in Workers KV), keyed by a Sahrae session
 * in an httpOnly SameSite=Lax cookie, and return only the short-lived access
 * token. That needs a session store, which is why it is not done yet — but it
 * should land before this is public.
 */
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`sahrae-connector backend on :${PORT}`);
    for (const [name, p] of Object.entries(PROVIDERS)) {
      if (!isConfigured(p, process.env)) console.warn(`  ⚠ ${name}: credentials not set`);
    }
  });
}

export default app;
