/**
 * OAuth 2.0 PKCE primitives (RFC 7636).
 *
 * Pure and dependency-free so they can be tested directly. Everything here uses
 * WebCrypto, which is available in the browser and in the Android WebView.
 *
 * PKCE is what makes it safe to start an authorization flow from a client we do
 * not control: the client commits to a secret (the verifier) by sending only its
 * hash (the challenge). An attacker who intercepts the redirected authorization
 * code cannot exchange it without the verifier. The code exchange itself still
 * happens on our backend, because these providers also require a client secret,
 * and a secret shipped to a browser is not a secret.
 */

const VERIFIER_MIN = 43; // RFC 7636 §4.1
const VERIFIER_MAX = 128;

/** URL-safe base64 with padding stripped — base64url per RFC 7636 §A. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Cryptographically random string of `length` chars from the RFC's alphabet. */
export function randomString(length = 64): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  // Modulo over a 66-char alphabet from 256 values is very slightly biased.
  // That bias is irrelevant here: the verifier's job is unguessability within a
  // single short-lived flow, and 64 chars leaves an enormous margin.
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** A PKCE code verifier: 43–128 chars of the unreserved set. */
export function createCodeVerifier(length = 64): string {
  const n = Math.min(Math.max(length, VERIFIER_MIN), VERIFIER_MAX);
  return randomString(n);
}

/** S256 challenge — the SHA-256 of the verifier, base64url encoded. */
export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Opaque value echoed back by the provider; guards against CSRF on redirect. */
export function createState(): string {
  return randomString(32);
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  state: string;
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = createCodeVerifier();
  return { verifier, challenge: await createCodeChallenge(verifier), state: createState() };
}

/**
 * Build an authorization URL.
 *
 * `scopes` is joined with spaces, which is what both Spotify and Google expect;
 * the URLSearchParams encoding turns that into `%20`/`+` correctly.
 */
export function buildAuthorizeUrl(opts: {
  authorizeEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  challenge: string;
  state: string;
  extra?: Record<string, string>;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    response_type: 'code',
    redirect_uri: opts.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: opts.challenge,
    state: opts.state,
    ...(opts.scopes.length ? { scope: opts.scopes.join(' ') } : {}),
    ...(opts.extra || {}),
  });
  return `${opts.authorizeEndpoint}?${p.toString()}`;
}

export interface CallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

/**
 * Read an OAuth redirect. Accepts a full URL or a bare query/fragment string.
 * Providers put the result in the query for the code flow, but reading the
 * fragment too costs nothing and avoids a silent failure if one ever differs.
 */
export function parseCallback(input: string): CallbackParams {
  let qs = input;
  const q = input.indexOf('?');
  const h = input.indexOf('#');
  if (q >= 0 || h >= 0) {
    const start = q >= 0 ? q : h;
    qs = input.slice(start + 1);
    // A fragment after a query (…?a=1#b=2) — merge both halves.
    if (q >= 0 && h > q) qs = `${input.slice(q + 1, h)}&${input.slice(h + 1)}`;
  }
  const p = new URLSearchParams(qs);
  return {
    code: p.get('code') || undefined,
    state: p.get('state') || undefined,
    error: p.get('error') || undefined,
    errorDescription: p.get('error_description') || undefined,
  };
}

/**
 * Constant-time-ish string compare for the state check.
 *
 * The timing risk here is remote, but the cost of not leaking is one loop, and
 * an early-return compare on a security check is the kind of thing that gets
 * flagged later and rewritten under time pressure.
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
