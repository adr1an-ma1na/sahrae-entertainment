/**
 * Refresh-token custody.
 *
 * THE PROBLEM THIS SOLVES
 * A refresh token is long-lived credential material — Google's do not expire at
 * all. Keeping one in localStorage means any XSS on the app origin can read a
 * permanent grant to someone's account and walk away with it.
 *
 * THE FIX
 * The refresh token never reaches JavaScript. The server encrypts it and puts
 * it in an httpOnly cookie; the browser sends that cookie back automatically on
 * the refresh call, and the client only ever holds a short-lived access token.
 *
 * WHY A COOKIE AND NOT A DATABASE
 * The backend is stateless and serverless. An encrypted cookie is a session
 * store that needs no infrastructure: the ciphertext lives on the client, but
 * only the server holds the key, so it is opaque to the browser and to any
 * script running in it. Rotating SESSION_SECRET invalidates every session at
 * once, which is a usable revocation mechanism.
 *
 * WHAT THIS DOES NOT FIX — stated plainly
 * XSS can still CALL the refresh endpoint, because the browser attaches the
 * cookie automatically, and get a short-lived access token that way. What it can
 * no longer do is steal the long-lived grant and use it later, from elsewhere,
 * indefinitely. That is the difference between an incident you can end by
 * rotating a secret and one you cannot.
 *
 * Framework-free and WebCrypto-only, so the same code runs on Vercel functions,
 * Cloudflare Workers and Node.
 */

const COOKIE_PREFIX = 'sc_rt_';
/** Six months. Long enough not to nag, short enough to bound a leaked cookie. */
const MAX_AGE_S = 180 * 24 * 3600;

/** AES-GCM needs a 256-bit key; derive one from the configured secret. */
async function keyFrom(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const b64u = {
  encode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

/** Encrypt to `iv.ciphertext`, both base64url. A fresh IV every time — reusing
 *  one with the same key breaks GCM's guarantees completely. */
export async function seal(plaintext, secret) {
  const key = await keyFrom(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${b64u.encode(iv)}.${b64u.encode(new Uint8Array(ct))}`;
}

/** Decrypt, returning null on anything malformed or tampered with. GCM
 *  authenticates, so a modified ciphertext fails rather than yielding garbage. */
export async function unseal(sealed, secret) {
  try {
    const [ivPart, ctPart] = String(sealed).split('.');
    if (!ivPart || !ctPart) return null;
    const key = await keyFrom(secret);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64u.decode(ivPart) },
      key,
      b64u.decode(ctPart),
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export const cookieName = (provider) => `${COOKIE_PREFIX}${provider}`;

/**
 * Build the Set-Cookie header.
 *
 * HttpOnly    — the whole point: script cannot read it.
 * Secure      — never sent over plaintext.
 * SameSite=Lax— a cross-site POST will not carry it, which is CSRF cover for
 *               the refresh endpoint without needing a separate token.
 * Path=/oauth — sent only to the token endpoints, not on every asset request.
 */
export function buildCookie(provider, sealedValue, { maxAge = MAX_AGE_S } = {}) {
  return [
    `${cookieName(provider)}=${sealedValue}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/oauth',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

/** Expire the cookie. Same attributes, or the browser will not match it. */
export function clearCookie(provider) {
  return `${cookieName(provider)}=; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=0`;
}

/** Read one cookie out of a Cookie header. */
export function readCookie(header, provider) {
  if (!header) return null;
  const want = cookieName(provider);
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === want) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/**
 * Whether cookie custody is available.
 *
 * Without a secret we cannot encrypt, and inventing one per-instance would mean
 * every cold start invalidated every session. The caller falls back to returning
 * the refresh token to the client — the old, weaker behaviour — and says so in
 * the response rather than degrading silently.
 */
export function custodyAvailable(secrets) {
  const s = secrets?.SESSION_SECRET;
  return typeof s === 'string' && s.length >= 32;
}

export const CUSTODY_HINT =
  'Set SESSION_SECRET (32+ chars) to keep refresh tokens in an httpOnly cookie instead of returning them to the browser.';
