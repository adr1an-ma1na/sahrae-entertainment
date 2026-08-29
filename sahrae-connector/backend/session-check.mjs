/**
 * Refresh-token custody tests.
 *
 * This is the security-relevant half of the backend, so it gets tested as such:
 * that ciphertext is opaque and non-repeating, that tampering is rejected rather
 * than silently accepted, that the cookie carries the attributes the protection
 * actually depends on, and that a refresh token never appears in a response body
 * when custody is on.
 *
 * Run: node session-check.mjs
 */
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  buildCookie, clearCookie, cookieName, custodyAvailable, readCookie, seal, unseal,
} from './session.js';
import { exchangeCode, healthBody, refreshToken } from './core.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const SECRET = 'x'.repeat(48);

console.log('\nseal / unseal');
const sealed = await seal('refresh-token-value', SECRET);
ok('round-trips', await unseal(sealed, SECRET) === 'refresh-token-value');
ok('ciphertext does not contain the plaintext', !sealed.includes('refresh-token-value'));
ok('output is iv.ciphertext', sealed.split('.').length === 2);
ok('output is base64url only', /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(sealed));

const again = await seal('refresh-token-value', SECRET);
ok('same input seals differently each time (fresh IV)', sealed !== again);
ok('  and both still open', await unseal(again, SECRET) === 'refresh-token-value');

ok('a different secret cannot open it', await unseal(sealed, 'y'.repeat(48)) === null);
ok('tampered ciphertext is rejected, not garbled',
  await unseal(sealed.slice(0, -2) + 'AB', SECRET) === null);
ok('tampered IV is rejected', await unseal('AAAAAAAAAAAAAAAA.' + sealed.split('.')[1], SECRET) === null);
ok('malformed input is rejected', await unseal('nonsense', SECRET) === null);
ok('empty input is rejected', await unseal('', SECRET) === null);
ok('null input is rejected', await unseal(null, SECRET) === null);
ok('an empty string round-trips', await unseal(await seal('', SECRET), SECRET) === '');
const long = 'z'.repeat(4000);
ok('a long token round-trips', await unseal(await seal(long, SECRET), SECRET) === long);

console.log('\ncookie attributes — the protection lives here');
const c = buildCookie('spotify', sealed);
ok('names the provider', c.startsWith(cookieName('spotify') + '='));
ok('HttpOnly — script cannot read it', /(^|;\s*)HttpOnly(;|$)/.test(c));
ok('Secure — never sent in the clear', /(^|;\s*)Secure(;|$)/.test(c));
ok('SameSite=Lax — a cross-site POST will not carry it', /SameSite=Lax/.test(c));
ok('Path=/oauth — not attached to every asset request', /Path=\/oauth/.test(c));
ok('has a bounded Max-Age', /Max-Age=\d+/.test(c));
ok('the sealed value is present', c.includes(sealed));

const cleared = clearCookie('spotify');
ok('clearing expires immediately', /Max-Age=0/.test(cleared));
ok('clearing keeps Path so the browser matches it', /Path=\/oauth/.test(cleared));
ok('clearing keeps HttpOnly', /HttpOnly/.test(cleared));

console.log('\nreadCookie');
ok('reads its own cookie', readCookie(`${cookieName('spotify')}=abc`, 'spotify') === 'abc');
ok('picks the right one among several',
  readCookie(`a=1; ${cookieName('youtube')}=yt; ${cookieName('spotify')}=sp`, 'spotify') === 'sp');
ok('tolerates surrounding whitespace',
  readCookie(`  ${cookieName('spotify')}=v  `, 'spotify') === 'v');
ok('is not fooled by a similar name',
  readCookie(`x${cookieName('spotify')}=nope`, 'spotify') === null);
ok('absent cookie → null', readCookie('other=1', 'spotify') === null);
ok('no header → null', readCookie(undefined, 'spotify') === null);
ok('empty value → null', readCookie(`${cookieName('spotify')}=`, 'spotify') === null);

console.log('\ncustodyAvailable');
ok('on with a long secret', custodyAvailable({ SESSION_SECRET: SECRET }));
ok('off with no secret', !custodyAvailable({}));
ok('off with a short secret — a weak key is worse than an honest fallback',
  !custodyAvailable({ SESSION_SECRET: 'short' }));
ok('off with a non-string', !custodyAvailable({ SESSION_SECRET: 12345 }));

console.log('\nhealth reports the mode');
ok('reports cookie custody', healthBody({ SESSION_SECRET: SECRET }, []).refreshCustody === 'cookie');
ok('reports client custody', healthBody({}, []).refreshCustody === 'client');
ok('  and hints how to fix it', typeof healthBody({}, []).hint === 'string');
ok('no hint when correctly configured', healthBody({ SESSION_SECRET: SECRET }, []).hint === undefined);

console.log('\nrefresh without a session');
{
  const env = { SPOTIFY_CLIENT_ID: 'i', SPOTIFY_CLIENT_SECRET: 's', SESSION_SECRET: SECRET };
  const r = await refreshToken('spotify', env, {}, undefined);
  ok('no cookie and no body token → 400', r.status === 400);
  ok('  with an actionable message', /Reconnect/.test(r.body.error));
  ok('  and clears any stale cookie', /Max-Age=0/.test(r.setCookie || ''));
}
{
  // A cookie sealed with a different secret is exactly what a rotated
  // SESSION_SECRET looks like: it must fail closed and be discarded.
  const env = { SPOTIFY_CLIENT_ID: 'i', SPOTIFY_CLIENT_SECRET: 's', SESSION_SECRET: SECRET };
  const foreign = await seal('someone-elses-token', 'q'.repeat(48));
  const r = await refreshToken('spotify', env, {}, `${cookieName('spotify')}=${foreign}`);
  ok('an unopenable cookie is refused, not passed through', r.status === 400);
  ok('  and is cleared', /Max-Age=0/.test(r.setCookie || ''));
}

console.log('\nthe refresh token must not appear in a response body');
{
  const env = { SPOTIFY_CLIENT_ID: 'i', SPOTIFY_CLIENT_SECRET: 's', SESSION_SECRET: SECRET };
  const r = await exchangeCode('spotify', env, {});
  ok('a refused exchange carries no token at all', !('refresh_token' in (r.body || {})));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
