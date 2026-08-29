/**
 * sahrae-connector OAuth backend — Cloudflare Worker.
 *
 * The deployment target. Identical behaviour to server.js (both delegate to
 * core.js) but on a runtime with no idle sleep, so an OAuth redirect never
 * lands on a cold start.
 *
 * Secrets are Worker secrets, set with `wrangler secret put` — they are not in
 * wrangler.toml and never in the repo:
 *
 *   wrangler secret put SPOTIFY_CLIENT_SECRET
 *   wrangler secret put YOUTUBE_CLIENT_SECRET
 *
 * Routes (same as the Express version):
 *   POST /oauth/:provider/token    { code, codeVerifier, redirectUri }
 *   POST /oauth/:provider/refresh  { refreshToken }
 *   GET  /health
 */

import { exchangeCode, healthBody, originAllowed, parseOrigins, refreshToken } from './core.js';

/** CORS headers for an allowed origin. Echoes the origin rather than using `*`,
 *  because `*` would let any site drive token exchange with our secret. */
function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = parseOrigins(env.ALLOWED_ORIGINS);

    if (!originAllowed(origin, allowed)) {
      // No CORS headers on a refusal — the browser must not be told it may read
      // this, and the 403 body is for a human reading logs.
      return new Response(JSON.stringify({ error: `Origin not allowed: ${origin}` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json(healthBody(env, allowed), 200, origin);
    }

    // /oauth/:provider/:action
    const m = /^\/oauth\/([a-z]+)\/(token|refresh)$/.exec(url.pathname);
    if (m && request.method === 'POST') {
      const [, provider, action] = m;

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'Expected a JSON body.' }, 400, origin);
      }

      const result = action === 'token'
        ? await exchangeCode(provider, env, payload || {})
        : await refreshToken(provider, env, payload || {});

      // Log the failure without the payload: it carries the code and verifier.
      if (result.status >= 400) console.error(`[${provider}] ${action} -> ${result.status}`);

      return json(result.body, result.status, origin);
    }

    return json({ error: 'Not found.' }, 404, origin);
  },
};
