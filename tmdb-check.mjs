/**
 * TMDB request-layer tests.
 *
 * The app showed "Network Error — we had trouble connecting to the movie
 * database" and became completely unusable, because every TMDB call was a bare
 * fetch() with no timeout and no retry. A bare fetch waits indefinitely, so one
 * stalled connection hung forever; and with no retry, one dropped packet was
 * permanent.
 *
 * What is tested here is the distinction that makes a retry useful rather than
 * merely slow: transient failures get another attempt, permanent ones do not.
 * Retrying a 401 three times just makes the viewer wait three times as long for
 * the same answer.
 *
 * Run: node --experimental-strip-types tmdb-check.mjs
 */

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const realFetch = globalThis.fetch;
/** Stand in for fetch, scripted per attempt, counting calls. */
function scriptFetch(steps) {
  const calls = { n: 0, signals: [] };
  globalThis.fetch = async (url, init) => {
    const i = calls.n++;
    calls.signals.push(init?.signal);
    const step = steps[Math.min(i, steps.length - 1)];
    if (step instanceof Error) throw step;
    if (step === 'hang') return new Promise(() => {}); // never settles
    return { status: step, ok: step < 400, url };
  };
  return calls;
}

const load = async () => (await import('./src/services/tmdb.ts?t=' + Math.random())).tmdbFetch;

console.log('\nthe happy path');
{
  const calls = scriptFetch([200]);
  const tmdbFetch = await load();
  const res = await tmdbFetch('https://api.themoviedb.org/3/x');
  ok('a 200 returns immediately', res.status === 200);
  ok('  with exactly one request', calls.n === 1, `made ${calls.n}`);
  ok('  and an abort signal attached', calls.signals[0] instanceof AbortSignal);
}

console.log('\ntransient failures are retried');
{
  const calls = scriptFetch([500, 500, 200]);
  const tmdbFetch = await load();
  const res = await tmdbFetch('https://api.themoviedb.org/3/x');
  ok('a 5xx is retried and eventually succeeds', res.status === 200);
  ok('  taking three attempts', calls.n === 3, `made ${calls.n}`);
}
{
  const calls = scriptFetch([429, 200]);
  const tmdbFetch = await load();
  const res = await tmdbFetch('https://api.themoviedb.org/3/x');
  ok('a 429 rate limit is retried', res.status === 200 && calls.n === 2, `made ${calls.n}`);
}
{
  const calls = scriptFetch([new TypeError('Failed to fetch'), 200]);
  const tmdbFetch = await load();
  const res = await tmdbFetch('https://api.themoviedb.org/3/x');
  ok('a dropped connection is retried', res.status === 200 && calls.n === 2, `made ${calls.n}`);
}

console.log('\npermanent failures are NOT retried — retrying them only wastes time');
{
  const calls = scriptFetch([401]);
  const tmdbFetch = await load();
  const res = await tmdbFetch('https://api.themoviedb.org/3/x');
  ok('a 401 returns straight away', res.status === 401);
  ok('  with no second attempt', calls.n === 1, `made ${calls.n}`);
}
{
  const calls = scriptFetch([404]);
  const tmdbFetch = await load();
  const res = await tmdbFetch('https://api.themoviedb.org/3/x');
  ok('a 404 is returned, not retried', res.status === 404 && calls.n === 1, `made ${calls.n}`);
}

console.log('\ngiving up');
{
  const calls = scriptFetch([new TypeError('Failed to fetch')]);
  const tmdbFetch = await load();
  let threw = null;
  try { await tmdbFetch('https://api.themoviedb.org/3/x'); } catch (e) { threw = e; }
  ok('a persistent network failure eventually throws', threw !== null);
  ok('  after a bounded number of attempts', calls.n === 3, `made ${calls.n}`);
  ok('  and the error is a real Error', threw instanceof Error);
}
{
  const calls = scriptFetch([500]);
  const tmdbFetch = await load();
  const res = await tmdbFetch('https://api.themoviedb.org/3/x');
  ok('a server erroring every time returns the last response rather than hanging',
    res.status === 500 && calls.n === 3, `made ${calls.n}`);
}

console.log('\nthe hang that started all this');
{
  // A request that never settles must be aborted by our own timeout rather than
  // waited on forever, which is what a bare fetch does.
  const calls = scriptFetch(['hang']);
  const tmdbFetch = await load();
  void tmdbFetch('https://api.themoviedb.org/3/x').catch(() => {});
  await new Promise((r) => setTimeout(r, 50));
  const sig = calls.signals[0];
  ok('a stalled request carries a live abort signal', sig instanceof AbortSignal && !sig.aborted);
}
{
  // Each attempt needs its OWN controller. Reusing one would leave every retry
  // pre-aborted after the first timeout, so the retry would be a no-op that
  // only looked like resilience.
  const calls = scriptFetch([new TypeError('Failed to fetch'), 200]);
  const tmdbFetch = await load();
  await tmdbFetch('https://api.themoviedb.org/3/x');
  ok('each attempt gets a fresh AbortSignal', calls.signals[0] !== calls.signals[1]);
  ok('  and neither is aborted on success',
    calls.signals[1] instanceof AbortSignal && !calls.signals[1].aborted);
}

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
