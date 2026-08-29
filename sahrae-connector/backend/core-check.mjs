/**
 * Backend core tests.
 *
 * core.js is shared by the Express server and the Cloudflare Worker, so testing
 * it once covers both — which is the point of extracting it. Everything here is
 * offline: the provider token endpoints are never called.
 *
 * Run: node core-check.mjs
 */
import {
  credentialsFor, exchangeCode, getProvider, healthBody, isConfigured,
  originAllowed, parseOrigins, PROVIDERS, refreshToken, safeError,
} from './core.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const SECRETS = {
  SPOTIFY_CLIENT_ID: 'sid', SPOTIFY_CLIENT_SECRET: 'ssec',
  YOUTUBE_CLIENT_ID: 'yid', YOUTUBE_CLIENT_SECRET: 'ysec',
};

console.log('\nprovider registry');
ok('spotify is known', !!getProvider('spotify'));
ok('youtube is known', !!getProvider('youtube'));
ok('apple is NOT configured server-side', getProvider('apple') === null);
ok('deezer is NOT configured server-side', getProvider('deezer') === null);
ok('soundcloud is NOT configured server-side', getProvider('soundcloud') === null);
ok('an unknown name is null', getProvider('napster') === null);
ok('spotify uses HTTP Basic auth', PROVIDERS.spotify.auth === 'basic');
ok('youtube uses body credentials', PROVIDERS.youtube.auth === 'body');

console.log('\ncredentials');
ok('reads the configured id', credentialsFor(PROVIDERS.spotify, SECRETS).clientId === 'sid');
ok('configured when both present', isConfigured(PROVIDERS.spotify, SECRETS));
ok('not configured when the secret is missing',
  !isConfigured(PROVIDERS.spotify, { SPOTIFY_CLIENT_ID: 'sid' }));
ok('not configured when the id is missing',
  !isConfigured(PROVIDERS.spotify, { SPOTIFY_CLIENT_SECRET: 'x' }));
ok('not configured on empty strings',
  !isConfigured(PROVIDERS.spotify, { SPOTIFY_CLIENT_ID: '', SPOTIFY_CLIENT_SECRET: '' }));

console.log('\nexchangeCode — refuses before it ever calls out');
{
  const r = await exchangeCode('apple', SECRETS, { code: 'c', codeVerifier: 'v', redirectUri: 'r' });
  ok('unknown provider → 404', r.status === 404);
}
{
  const r = await exchangeCode('youtube', { SPOTIFY_CLIENT_ID: 'x' }, { code: 'c', codeVerifier: 'v', redirectUri: 'r' });
  ok('unconfigured provider → 500', r.status === 500);
  ok('  and names the variables to set', /YOUTUBE_CLIENT_ID/.test(r.body.error));
}
{
  const r = await exchangeCode('spotify', SECRETS, {});
  ok('missing params → 400', r.status === 400);
  ok('  and says which', /code, codeVerifier and redirectUri/.test(r.body.error));
}
{
  const r = await exchangeCode('spotify', SECRETS, { code: 'c', codeVerifier: 'v' });
  ok('a missing redirectUri alone → 400', r.status === 400);
}

console.log('\nrefreshToken');
{
  const r = await refreshToken('deezer', SECRETS, { refreshToken: 'r' });
  ok('unknown provider → 404', r.status === 404);
}
{
  const r = await refreshToken('spotify', SECRETS, {});
  ok('missing refreshToken → 400', r.status === 400);
}
{
  const r = await refreshToken('spotify', { }, { refreshToken: 'r' });
  ok('unconfigured → 500', r.status === 500);
}

console.log('\nsafeError — a provider error must not leak our request');
ok('prefers error_description', safeError({ error_description: 'bad code' }, 'fb') === 'bad code');
ok('reads a nested message', safeError({ error: { message: 'nope' } }, 'fb') === 'nope');
ok('reads a plain error string', safeError({ error: 'invalid_grant' }, 'fb') === 'invalid_grant');
ok('falls back when there is nothing usable', safeError({}, 'fb') === 'fb');
ok('falls back on a non-string error', safeError({ error: { code: 42 } }, 'fb') === 'fb');
ok('truncates a huge body', safeError({ error: 'x'.repeat(5000) }, 'fb').length === 300);

console.log('\nCORS allow-list');
const allowed = parseOrigins('https://a.test, https://b.test ,, ');
ok('splits and trims', allowed.length === 2 && allowed[0] === 'https://a.test');
ok('drops empty entries', !allowed.includes(''));
ok('an empty setting yields no origins', parseOrigins('').length === 0);
ok('undefined yields no origins', parseOrigins(undefined).length === 0);
ok('a listed origin is allowed', originAllowed('https://a.test', allowed));
ok('an unlisted origin is refused', !originAllowed('https://evil.test', allowed));
ok('no Origin header is allowed (curl / same-origin / WebView)', originAllowed(undefined, allowed));
ok('null origin string is treated as absent', originAllowed('', allowed));
ok('an empty allow-list still refuses a real origin',
  !originAllowed('https://evil.test', []));
// A prefix must not pass for the full origin.
ok('a prefix of a listed origin is refused', !originAllowed('https://a.test.evil.com', allowed));

console.log('\nhealth');
const h = healthBody(SECRETS, allowed);
ok('reports ok', h.ok === true);
ok('reports spotify configured', h.providers.spotify.configured === true);
ok('reports youtube configured', h.providers.youtube.configured === true);
ok('echoes the allow-list', h.allowedOrigins.length === 2);
const h2 = healthBody({}, []);
ok('reports nothing configured when secrets are absent',
  h2.providers.spotify.configured === false && h2.providers.youtube.configured === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
