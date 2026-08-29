/**
 * Vercel serverless handler tests.
 *
 * This is now the default token-exchange path, so it gets the same treatment
 * the Worker got: drive the exported handler with mock req/res shaped the way
 * Vercel shapes them, and assert on status and body. Offline throughout — every
 * case here is refused before any provider is contacted.
 *
 * Run: node api-check.mjs
 */
import handler from '../api/oauth/[provider]/[action].js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

/** Minimal stand-in for Vercel's res. */
function mockRes() {
  const r = { statusCode: 0, body: undefined, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  return r;
}

const call = async (query, body, method = 'POST', env = {}) => {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  const res = mockRes();
  try {
    await handler({ method, query, body }, res);
  } finally {
    // Restore so one case's env cannot leak into the next.
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, prev);
  }
  return res;
};

const CONFIGURED = { SPOTIFY_CLIENT_ID: 'sid', SPOTIFY_CLIENT_SECRET: 'ssec' };
const PAYLOAD = { code: 'c', codeVerifier: 'v', redirectUri: 'https://app.test/connect/callback' };

console.log('\nmethod and routing');
{
  const r = await call({ provider: 'spotify', action: 'token' }, PAYLOAD, 'GET');
  ok('GET → 405', r.statusCode === 405);
  ok('  and advertises Allow: POST', r.headers.Allow === 'POST');
}
ok('an unknown action → 404',
  (await call({ provider: 'spotify', action: 'bogus' }, PAYLOAD)).statusCode === 404);
ok('a missing action → 404',
  (await call({ provider: 'spotify' }, PAYLOAD)).statusCode === 404);
ok('an unconfigured provider (apple) → 404',
  (await call({ provider: 'apple', action: 'token' }, PAYLOAD, 'POST', CONFIGURED)).statusCode === 404);

console.log('\nvalidation');
{
  const r = await call({ provider: 'spotify', action: 'token' }, {}, 'POST', CONFIGURED);
  ok('missing params → 400', r.statusCode === 400);
  ok('  naming what is required', /code, codeVerifier and redirectUri/.test(r.body.error));
}
{
  const r = await call({ provider: 'spotify', action: 'refresh' }, {}, 'POST', CONFIGURED);
  ok('refresh without a token → 400', r.statusCode === 400);
}
{
  // Vercel hands a malformed body through as a string; it must be a 400, not a throw.
  const r = await call({ provider: 'spotify', action: 'token' }, 'not json', 'POST', CONFIGURED);
  ok('a malformed JSON body → 400', r.statusCode === 400);
  ok('  with a clear message', /Expected a JSON body/.test(r.body.error));
}
{
  // Vercel usually hands the body through already parsed, but not always — a
  // raw JSON string must be parsed rather than passed through as a string.
  //
  // The tell is WHICH 400 comes back. A string that was parsed reaches field
  // validation ("code, codeVerifier and redirectUri are all required"); one that
  // was not would have failed at the parse step instead. Deliberately using an
  // incomplete payload so this stops at validation and never reaches Spotify —
  // a complete one would make a real network call and this suite is offline.
  const r = await call(
    { provider: 'spotify', action: 'token' },
    JSON.stringify({ code: 'c' }),
    'POST', CONFIGURED,
  );
  ok('a JSON *string* body is parsed, not passed through',
    /code, codeVerifier and redirectUri/.test(r.body.error), JSON.stringify(r.body));
  ok('  and is not mistaken for a malformed body',
    !/Expected a JSON body/.test(r.body.error));
}
{
  const r = await call({ provider: 'youtube', action: 'token' }, PAYLOAD, 'POST', CONFIGURED);
  ok('a provider with no server credentials → 500', r.statusCode === 500);
  ok('  naming the variables to set', /YOUTUBE_CLIENT_ID/.test(r.body.error));
}
{
  const r = await call({ provider: 'spotify', action: 'token' }, null, 'POST', CONFIGURED);
  ok('a null body is handled, not thrown on', r.statusCode === 400);
}

console.log('\nno CORS surface — same-origin only');
{
  const r = await call({ provider: 'spotify', action: 'token' }, {}, 'POST', CONFIGURED);
  const cors = Object.keys(r.headers).filter((h) => /access-control/i.test(h));
  ok('no Access-Control headers are emitted', cors.length === 0, cors.join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
