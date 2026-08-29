/**
 * Worker routing tests.
 *
 * Drives the exported fetch handler with real Request objects — the same thing
 * the Workers runtime does — so routing, CORS and status mapping are verified
 * without deploying. The token endpoints are never reached: every case here is
 * refused before a network call.
 *
 * Run: node worker-check.mjs
 */
import worker from './worker.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const ENV = {
  SPOTIFY_CLIENT_ID: 'sid', SPOTIFY_CLIENT_SECRET: 'ssec',
  ALLOWED_ORIGINS: 'https://adr1an-ma1na.github.io,https://localhost',
};

const call = (path, { method = 'GET', origin, body } = {}) => worker.fetch(
  new Request(`https://w.test${path}`, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }),
  ENV,
);

console.log('\nrouting');
{
  const r = await call('/health');
  ok('GET /health → 200', r.status === 200);
  const j = await r.json();
  ok('  reports spotify configured', j.providers.spotify.configured === true);
  ok('  reports youtube unconfigured', j.providers.youtube.configured === false);
}
ok('GET / → 404', (await call('/')).status === 404);
ok('GET /oauth/spotify/token → 404 (POST only)', (await call('/oauth/spotify/token')).status === 404);
ok('POST /oauth/napster/token → 404',
  (await call('/oauth/napster/token', { method: 'POST', body: { code: 'c', codeVerifier: 'v', redirectUri: 'r' } })).status === 404);
ok('POST /oauth/spotify/bogus → 404',
  (await call('/oauth/spotify/bogus', { method: 'POST', body: {} })).status === 404);

console.log('\nrequest validation');
ok('missing params → 400',
  (await call('/oauth/spotify/token', { method: 'POST', body: {} })).status === 400);
ok('missing refreshToken → 400',
  (await call('/oauth/spotify/refresh', { method: 'POST', body: {} })).status === 400);
{
  // A body that is not JSON must be a 400, not a 500 stack trace.
  const r = await worker.fetch(
    new Request('https://w.test/oauth/spotify/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json',
    }), ENV);
  ok('a malformed JSON body → 400', r.status === 400);
}
{
  const r = await call('/oauth/youtube/token', { method: 'POST', body: { code: 'c', codeVerifier: 'v', redirectUri: 'r' } });
  ok('unconfigured provider → 500', r.status === 500);
  ok('  naming the variables to set', /YOUTUBE_CLIENT_ID/.test((await r.json()).error));
}

console.log('\nCORS');
{
  const r = await call('/health', { origin: 'https://adr1an-ma1na.github.io' });
  ok('an allowed origin is echoed back',
    r.headers.get('Access-Control-Allow-Origin') === 'https://adr1an-ma1na.github.io');
  ok('  never a wildcard', r.headers.get('Access-Control-Allow-Origin') !== '*');
  ok('  and Vary: Origin is set for caches', /Origin/.test(r.headers.get('Vary') || ''));
}
{
  const r = await call('/health', { origin: 'https://evil.test' });
  ok('a disallowed origin → 403', r.status === 403);
  ok('  with no CORS header granting access', !r.headers.get('Access-Control-Allow-Origin'));
}
{
  const r = await call('/oauth/spotify/token', { method: 'OPTIONS', origin: 'https://localhost' });
  ok('preflight → 204', r.status === 204);
  ok('  allows POST', /POST/.test(r.headers.get('Access-Control-Allow-Methods') || ''));
  ok('  allows Content-Type', /Content-Type/.test(r.headers.get('Access-Control-Allow-Headers') || ''));
}
ok('no Origin header is allowed (curl / WebView)', (await call('/health')).status === 200);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
