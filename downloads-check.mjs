/**
 * Download state tests.
 *
 * The Downloads screen is the one place in the app where being wrong is
 * expensive in a specific way: a viewer downloads a film precisely because they
 * are about to lose connectivity, and they find out whether it worked on a
 * plane. Every case here is one where the OLD code was silently wrong.
 *
 * Run: node --experimental-strip-types downloads-check.mjs
 */

globalThis.window = globalThis;
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };

const {
  progressOf, statusLabel, formatBytes, groupKey,
} = await import('./src/services/videoDownloads.ts');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

/** A download row, with the fields under test overridden. */
const D = (o = {}) => ({
  id: '1', title: 'Fight Club', file: '/f.mp4', mime: 'video/mp4', timestamp: 1,
  state: 'running', bytes: 0, total: 0, done: false, ...o,
});

console.log('\nprogress');
ok('a finished download is complete even with no size recorded',
  progressOf(D({ state: 'done', bytes: 0, total: 0 })) === 1);
ok('progress before a size is known is 0, never NaN',
  progressOf(D({ bytes: 500, total: 0 })) === 0);
ok('half a file reads as half', progressOf(D({ bytes: 50, total: 100 })) === 0.5);
ok('progress cannot exceed 1 even if bytes overshoot',
  progressOf(D({ bytes: 150, total: 100 })) === 1);
ok('negative or absent bytes cannot produce negative progress',
  progressOf(D({ bytes: -5, total: 100 })) === 0);

console.log('\nsizes read as sizes');
ok('gigabytes', formatBytes(2.4e9) === '2.4 GB');
ok('megabytes', formatBytes(734e6) === '734 MB');
ok('small files do not round to "0 KB"', formatBytes(400) === '1 KB');
ok('zero is stated, not blank', formatBytes(0) === '0 MB');

console.log('\nstatus lines — a viewer must never be misled about state');
ok('a failure states its reason rather than "Downloading"',
  statusLabel(D({ state: 'failed', reason: 'Not enough storage space' })) === 'Not enough storage space');
ok('a failure with no reason still says it failed',
  statusLabel(D({ state: 'failed' })) === 'Download failed');
ok('a job parked for Wi-Fi says so, instead of pretending to progress',
  statusLabel(D({ state: 'paused', reason: 'Waiting for Wi-Fi' })) === 'Waiting for Wi-Fi');
ok('a running download reports percent and both sizes',
  statusLabel(D({ state: 'running', bytes: 50e6, total: 100e6 })) === '50% · 50 MB of 100 MB');
ok('a running download with no size yet says "Starting", not "0%"',
  statusLabel(D({ state: 'running', bytes: 0, total: 0 })) === 'Starting…');
ok('a finished download shows what it cost on disk',
  statusLabel(D({ state: 'done', total: 1.5e9 })) === 'Saved · 1.5 GB');
ok('queued is distinct from running', statusLabel(D({ state: 'queued' })) === 'Waiting to start');

console.log('\ngrouping — a season must not bury everything else');
const ep1 = D({ id: 'a', type: 'tv', tmdbId: 1396, season: 1, episode: 1, show: 'Breaking Bad' });
const ep2 = D({ id: 'b', type: 'tv', tmdbId: 1396, season: 1, episode: 2, show: 'Breaking Bad' });
const other = D({ id: 'c', type: 'tv', tmdbId: 1399, season: 1, episode: 1, show: 'Thrones' });
const film = D({ id: 'd', type: 'movie', tmdbId: 550 });
ok('two episodes of one show share a group', groupKey(ep1) === groupKey(ep2));
ok('a different show is a different group', groupKey(ep1) !== groupKey(other));
ok('a film is never grouped with another film', groupKey(film) !== groupKey(D({ id: 'e', type: 'movie', tmdbId: 551 })));
ok('an episode with no series identity is not grouped with other orphans',
  groupKey(D({ id: 'x', type: 'tv' })) !== groupKey(D({ id: 'y', type: 'tv' })));

console.log('\nlegacy rows from an older native build must still render');
const { videoDownloads } = await import('./src/services/videoDownloads.ts');
ok('the web build reports no downloads rather than throwing',
  Array.isArray(await videoDownloads.list()) && (await videoDownloads.list()).length === 0);
ok('stats on the web are zeroed, not undefined',
  (await videoDownloads.stats()).used === 0);
ok('localSrc refuses a file that is not finished',
  videoDownloads.localSrc(D({ state: 'running' })) === null);
ok('localSrc refuses a finished row with no path',
  videoDownloads.localSrc(D({ state: 'done', file: '' })) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
