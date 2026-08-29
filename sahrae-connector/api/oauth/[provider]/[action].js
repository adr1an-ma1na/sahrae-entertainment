/**
 * Optional same-origin backend, as a Vercel serverless function.
 *
 * The Cloudflare Worker remains the default and nothing here replaces it. This
 * exists because once the frontend is on Vercel, running the token exchange on
 * the SAME origin removes CORS from the picture entirely: no allow-list to keep
 * in sync, no preflight, no cross-origin surface at all.
 *
 * It reuses backend/core.js unchanged, which is the payoff from making that
 * module framework-free — three runtimes, one implementation, one set of tests.
 *
 * To use it instead of the Worker:
 *   1. Set SPOTIFY_CLIENT_SECRET and YOUTUBE_CLIENT_SECRET (plus the two
 *      _CLIENT_IDs) in Vercel → Project → Settings → Environment Variables.
 *   2. Set VITE_CONNECTOR_BACKEND to an empty string, so requests go to
 *      /oauth/... on this origin.
 *   3. Add the rewrite in vercel.json noted below.
 *
 * Routes: POST /api/oauth/:provider/token | refresh
 */

import { exchangeCode, refreshToken } from '../../../lib/core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { provider, action } = req.query;
  if (action !== 'token' && action !== 'refresh') {
    return res.status(404).json({ error: 'Not found.' });
  }

  // Vercel parses a JSON body for us, but a malformed one arrives as a string.
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return res.status(400).json({ error: 'Expected a JSON body.' }); }
  }

  const result = action === 'token'
    ? await exchangeCode(provider, process.env, payload || {})
    : await refreshToken(provider, process.env, payload || {}, req.headers?.cookie);

  // The refresh token rides back as an encrypted httpOnly cookie when custody is
  // enabled, so it never enters JavaScript.
  if (result.setCookie) res.setHeader('Set-Cookie', result.setCookie);

  // Log the outcome without the payload: it carries the code and verifier.
  if (result.status >= 400) console.error(`[${provider}] ${action} -> ${result.status}`);

  // No CORS headers on purpose. Same-origin only — if this ever needs to serve
  // another origin, that is a deliberate decision to make explicitly, not one to
  // inherit from a permissive default.
  return res.status(result.status).json(result.body);
}
