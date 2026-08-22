/**
 * Failure-matrix tests for the sports stream reliability engine (§Phase 8).
 *
 * Covers: valid stream, dead stream, timeout, malformed manifest, intermittent
 * stream, multiple working streams, all unavailable, primary failure, backup
 * success, backup failure, recovery, failover loops, concurrent validation,
 * cache/TTL expiry.
 *
 * Run: node --experimental-strip-types sportsstreams-check.mjs
 */
import {
  DEFAULT_CONFIG, analyseManifest, scoreStream, rankStreams, selectableStreams,
  nextStream, markSuccess, markFailure, markUnverified, needsCheck,
  reliabilityOf, mapWithLimit, emptyMetrics, summarise,
} from './src/services/sportsStreams.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const T0 = 1_000_000;
const cfg = DEFAULT_CONFIG;

const mk = (id, over = {}) => ({
  id, eventId: 'e1', source: id + '.example.com', kind: 'server', type: 'hls',
  label: id, status: 'unknown', healthScore: 50,
  consecutiveFailures: 0, consecutiveSuccesses: 0, ...over,
});

// ─────────────────────────────── manifest analysis (the §4 requirement) ──
console.log('\n[manifest validation — 200 OK is not playable]');
ok('valid media playlist accepted',
  analyseManifest('#EXTM3U\n#EXTINF:6,\nseg1.ts\n#EXTINF:6,\nseg2.ts').ok);
ok('valid master playlist accepted',
  analyseManifest('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720\nv.m3u8').ok);
ok('master reports real quality',
  analyseManifest('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nv.m3u8').quality === '1080p');
ok('empty body → EMPTY_MANIFEST',
  analyseManifest('').failure === 'EMPTY_MANIFEST');
ok('HTML error page served as 200 → HTML_ERROR_PAGE',
  analyseManifest('<html><body>404 Not Found</body></html>').failure === 'HTML_ERROR_PAGE');
ok('html content-type → HTML_ERROR_PAGE',
  analyseManifest('not really m3u8', 'text/html; charset=utf-8').failure === 'HTML_ERROR_PAGE');
ok('garbage → INVALID_MANIFEST',
  analyseManifest('some random text').failure === 'INVALID_MANIFEST');
ok('playlist with zero segments → NO_SEGMENTS',
  analyseManifest('#EXTM3U\n#EXT-X-ENDLIST').failure === 'NO_SEGMENTS');
ok('master with no variants → INVALID_MANIFEST',
  analyseManifest('#EXTM3U\n#EXT-X-VERSION:3').failure === 'NO_SEGMENTS' ||
  analyseManifest('#EXTM3U\n#EXT-X-VERSION:3').failure === 'INVALID_MANIFEST');

// ───────────────────────────────────────────────── scoring and ranking ──
console.log('\n[scoring + deterministic ranking]');
const proven = markSuccess(mk('proven'), 300, cfg, T0);
proven.healthScore = scoreStream(proven, 0.9);
const untested = mk('untested');
untested.healthScore = scoreStream(untested, 0.5);
ok('proven stream outranks untested (§6)', proven.healthScore > untested.healthScore,
  `${proven.healthScore} vs ${untested.healthScore}`);

const slow = markSuccess(mk('slow'), 4000, cfg, T0);
ok('slow stream marked degraded', slow.status === 'degraded');
slow.healthScore = scoreStream(slow, 0.9);
ok('degraded scores below working', slow.healthScore < proven.healthScore);

const offline = markFailure(markFailure(mk('dead'), 'HTTP_ERROR', cfg, T0), 'HTTP_ERROR', cfg, T0);
ok('two failures → offline', offline.status === 'offline');
ok('offline scores 0', scoreStream(offline, 0.9) === 0);

const ranked = rankStreams([untested, offline, slow, proven]);
ok('ranking puts working first, offline last',
  ranked[0].id === 'proven' && ranked[ranked.length - 1].id === 'dead',
  ranked.map(s => s.id).join(','));
ok('ranking is deterministic (same input → same order)',
  JSON.stringify(rankStreams([untested, offline, slow, proven]).map(s => s.id)) ===
  JSON.stringify(ranked.map(s => s.id)));

// unverified must never outrank verified-working
const unver = markUnverified(mk('unverified'), T0);
unver.healthScore = scoreStream(unver, 0.9);
ok('unverified never outranks working (§23)',
  rankStreams([unver, proven])[0].id === 'proven');

// ─────────────────────────────────────────────────── failover behaviour ──
console.log('\n[failover, cooldown, loop prevention]');
const A = markSuccess(mk('A'), 300, cfg, T0); A.healthScore = scoreStream(A, 0.8);
const B = markSuccess(mk('B'), 800, cfg, T0); B.healthScore = scoreStream(B, 0.8);
const C = markSuccess(mk('C'), 900, cfg, T0); C.healthScore = scoreStream(C, 0.8);

ok('primary failure → picks next healthiest backup',
  nextStream([A, B, C], 'A', new Set(['A']), T0)?.id === 'B');

ok('backup failure → moves to third, never back to A (§17)',
  nextStream([A, B, C], 'B', new Set(['A', 'B']), T0)?.id === 'C');

ok('all tried → does not loop forever',
  (() => {
    const failed = new Set(['A', 'B', 'C']);
    const n = nextStream([A, B, C], 'C', failed, T0);
    // may return a retryable one for a second pass, but must not return current
    return n === null || n.id !== 'C';
  })());

const cooling = markFailure(mk('cool'), 'TIMEOUT', cfg, T0);
ok('failed stream enters cooldown', (cooling.cooldownUntil || 0) > T0);
ok('cooling stream excluded from selection',
  !selectableStreams([cooling, A], T0 + 1000).some(s => s.id === 'cool'));
ok('cooldown expires → selectable again (§18 recovery)',
  selectableStreams([cooling, A], T0 + cfg.maxFailureCooldownMs + 1).some(s => s.id === 'cool'));

ok('non-retryable failure is not retried (CORS)',
  markFailure(mk('x'), 'CORS_BLOCKED', cfg, T0).lastFailure.retryable === false);
ok('timeout is retryable',
  markFailure(mk('x'), 'TIMEOUT', cfg, T0).lastFailure.retryable === true);

ok('all streams unavailable → returns null, no crash',
  nextStream([offline], 'A', new Set(['A']), T0) === null);

// ──────────────────────────────────────────────── intermittent + recovery ──
console.log('\n[intermittent stream + recovery]');
let flaky = mk('flaky');
flaky = markFailure(flaky, 'TIMEOUT', cfg, T0);
ok('single retryable failure only degrades (live sources flap)', flaky.status === 'degraded');
flaky = markSuccess(flaky, 400, cfg, T0 + 1000);
ok('recovers to working after a good check', flaky.status === 'working');
ok('recovery clears failure counters', flaky.consecutiveFailures === 0 && !flaky.cooldownUntil);

// ───────────────────────────────────────────────────────── TTL / caching ──
console.log('\n[health TTL / cache expiry]');
const checked = markSuccess(mk('ttl'), 300, cfg, T0);
ok('fresh check is not re-run', needsCheck(checked, cfg, T0 + 1000) === false);
ok('stale check is re-run (no indefinitely stale state §13)',
  needsCheck(checked, cfg, T0 + cfg.healthTtlMs + 1) === true);
ok('never-checked stream needs a check', needsCheck(mk('new'), cfg, T0) === true);
ok('cooling stream is not re-checked early',
  needsCheck(markFailure(mk('c2'), 'TIMEOUT', cfg, T0), cfg, T0 + 100) === false);

// ─────────────────────────────────────────────────── source reliability ──
console.log('\n[source reliability learning §22]');
ok('unknown source is neutral, not punished', reliabilityOf(undefined) === 0.5);
ok('reliable source scores high', reliabilityOf({ ok: 50, fail: 1 }) > 0.9);
ok('unreliable source scores low', reliabilityOf({ ok: 1, fail: 50 }) < 0.1);
ok('small samples stay near neutral', Math.abs(reliabilityOf({ ok: 1, fail: 0 }) - 0.5) < 0.2);

// ─────────────────────────────────────────────────── concurrency control ──
console.log('\n[bounded parallel validation §14]');
{
  let inFlight = 0, peak = 0;
  const items = Array.from({ length: 12 }, (_, i) => i);
  const res = await mapWithLimit(items, 4, async (n) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(r => setTimeout(r, 5));
    inFlight--;
    return n * 2;
  });
  ok('respects the concurrency limit', peak <= 4, 'peak=' + peak);
  ok('validates in parallel, not serially', peak > 1, 'peak=' + peak);
  ok('preserves input order', JSON.stringify(res) === JSON.stringify(items.map(n => n * 2)));
  ok('empty input is safe', (await mapWithLimit([], 4, async () => 1)).length === 0);
}

// ─────────────────────────────────────────────────────────── metrics ──
console.log('\n[observability §21]');
{
  const m = emptyMetrics();
  m.validations = 10; m.validationsOk = 8; m.validationsFailed = 2;
  m.totalLatencyMs = 4000; m.failovers = 4; m.failoversSucceeded = 3;
  const s = summarise(m);
  ok('success rate computed', s.successRate === 0.8);
  ok('avg latency computed', s.avgLatencyMs === 500);
  ok('failover success rate computed', s.failoverSuccessRate === 0.75);
  ok('no divide-by-zero on empty metrics', summarise(emptyMetrics()).successRate === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
