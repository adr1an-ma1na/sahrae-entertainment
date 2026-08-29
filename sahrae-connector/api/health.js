/**
 * Deployment health.
 *
 * Exists so a misconfigured deployment is visible without guessing: which
 * providers have server-side credentials, and — the one that matters — whether
 * refresh tokens are being kept in an httpOnly cookie or handed to the browser.
 *
 * Reports configuration state only. No secret, no token, and no value that
 * could be replayed appears in the response.
 */

import { healthBody } from '../lib/core.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  // Same-origin, so the allow-list this reports on is empty by design: there is
  // no cross-origin surface to allow.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ...healthBody(process.env, []), origin: 'same-origin' });
}
