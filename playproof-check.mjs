/**
 * Shared server memory (src/services/playProofRank.ts).
 *
 * Viewers reported servers that "don't have the episode". Hosts carry
 * different titles and drop them without notice, so the player starts on the
 * server other viewers just watched this exact title on, and skips one several
 * viewers saw fail on it. These pin that ranking.
 *
 * Run: node --experimental-strip-types playproof-check.mjs
 */
import { crowdChoice, nextServerRanked, titleKey, GOOD_FOR_MS, NO_CROWD } from './src/services/playProofRank.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
const ids = ['vidlink', 'vidzee', 'vidrock', 'vidsrcto', '2embed'];
const NOW = Date.parse('2026-10-20T12:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const H = 3600_000, D = 24 * H;
const row = (server_id, o) => ({ server_id, ok_count: 0, fail_count: 0, last_ok: null, last_fail: null, ...o });
const view = (c) => ({ best: c.best, good: [...c.good].sort(), bad: [...c.bad].sort() });

console.log('\ntitle keys');
eq('a film is keyed by its id alone', titleKey('movie', 27205, 1, 1), 'movie:27205');
eq('an episode by show, season and episode', titleKey('tv', 119051, 2, 1), 'tv:119051:2:1');

console.log('\nwhat the crowd says');
eq('no reports, no opinion', view(crowdChoice(ids, [], NOW)), { best: null, good: [], bad: [] });
eq('the server that most recently played it leads',
  view(crowdChoice(ids, [row('vidzee', { ok_count: 3, last_ok: ago(5 * H) }), row('vidrock', { ok_count: 1, last_ok: ago(1 * H) })], NOW)),
  { best: 2, good: ['vidrock', 'vidzee'], bad: [] });
eq('a success older than two weeks is no proof',
  view(crowdChoice(ids, [row('vidzee', { ok_count: 9, last_ok: ago(GOOD_FOR_MS + 1) })], NOW)),
  { best: null, good: [], bad: [] });
eq('one failure is not enough to skip a server (it could be one viewer\'s network)',
  view(crowdChoice(ids, [row('vidlink', { fail_count: 1, last_fail: ago(H) })], NOW)),
  { best: null, good: [], bad: [] });
eq('two failures and no success since: skipped for this title',
  view(crowdChoice(ids, [row('vidlink', { fail_count: 2, last_fail: ago(H) })], NOW)),
  { best: null, good: [], bad: ['vidlink'] });
eq('a success after failures makes it good again',
  view(crowdChoice(ids, [row('vidlink', { ok_count: 1, fail_count: 4, last_fail: ago(3 * H), last_ok: ago(H) })], NOW)),
  { best: 0, good: ['vidlink'], bad: [] });
eq('failing after its last success, with more failures than successes: bad',
  view(crowdChoice(ids, [row('vidlink', { ok_count: 1, fail_count: 3, last_ok: ago(2 * D), last_fail: ago(H) })], NOW)),
  { best: null, good: [], bad: ['vidlink'] });
eq('a server no longer in the list is ignored',
  view(crowdChoice(ids, [row('vidfast', { ok_count: 5, last_ok: ago(H) })], NOW)),
  { best: null, good: [], bad: [] });

console.log('\nwhere to go next');
const rows = [row('2embed', { ok_count: 2, last_ok: ago(2 * H) }), row('vidsrcto', { ok_count: 1, last_ok: ago(30 * 60_000) }), row('vidzee', { fail_count: 3, last_fail: ago(H) })];
const choice = crowdChoice(ids, rows, NOW);
eq('servers proven on this title come first, most recent first', nextServerRanked(ids, 0, new Set(), choice, rows), 3);
eq('a proven one already failed here is passed over for the next proven', nextServerRanked(ids, 0, new Set(['vidsrcto']), choice, rows), 4);
eq('with no proven server left, the crowd-failed one is skipped', nextServerRanked(ids, 0, new Set(['vidsrcto', '2embed']), choice, rows), 2);
eq('without crowd data it is the usual order', nextServerRanked(ids, 0, new Set(), NO_CROWD), 1);
eq('the crowd-failed server is still tried rather than give up',
  nextServerRanked(['vidlink', 'vidzee'], 0, new Set(), crowdChoice(['vidlink', 'vidzee'], [row('vidzee', { fail_count: 2, last_fail: ago(H) })], NOW)), 1);
eq('everything failed here: nowhere to go', nextServerRanked(ids, 0, new Set(ids.slice(1)), choice, rows), null);
eq('the current server is never its own fallback', nextServerRanked(['vidlink', 'vidzee'], 0, new Set(), crowdChoice(['vidlink', 'vidzee'], [row('vidlink', { ok_count: 1, last_ok: ago(H) })], NOW)), 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
