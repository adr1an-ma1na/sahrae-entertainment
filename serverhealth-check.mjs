/**
 * Server choice and automatic fallback (src/services/serverHealth.ts).
 *
 * The default movie server (VidFast) played from GitHub's servers but never
 * started from a home connection in Kenya. These pin the behaviour that fixes
 * that: open on what last worked here, skip what just failed, never give up
 * before every server has been tried, and only count real playback as proof
 * that a server works.
 *
 * Run: node --experimental-strip-types serverhealth-check.mjs
 */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { startServer, nextServer, markWorking, markDown, isRecentlyDown, isPlaybackEvidence, DOWN_FOR_MS } =
  await import('./src/services/serverHealth.ts');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
const ids = ['vidfast', 'videasy', 'vidlink', 'multiembed', 'vidsrcto'];
const T = 1_800_000_000_000;
const fresh = () => store.clear();

console.log('\nwhere a play starts');
fresh();
eq('a new device starts on the first server', startServer(ids, T), 0);
fresh(); markWorking('vidlink', T - 1000);
eq('it starts on the server that last worked here', startServer(ids, T), 2);
fresh(); markWorking('vidlink', T - 5000); markWorking('videasy', T - 1000);
eq('the most recent success wins', startServer(ids, T), 1);
fresh(); markDown('vidfast', T - 1000);
eq('a server that just failed is not the starting point', startServer(ids, T), 1);
fresh(); markDown('vidfast', T - DOWN_FOR_MS - 1);
eq('a failure older than the window is forgiven', startServer(ids, T), 0);
fresh(); markWorking('vidlink', T - 9000); markDown('vidlink', T - 1000);
eq('a server that worked and then failed is skipped', startServer(ids, T), 0);
fresh(); markDown('vidlink', T - 9000); markWorking('vidlink', T - 1000);
eq('working again clears the failure', [startServer(ids, T), isRecentlyDown('vidlink', T)], [2, false]);
fresh(); ids.forEach((id) => markDown(id, T - 1000));
eq('if every server failed recently, start at the first anyway', startServer(ids, T), 0);

console.log('\nwhere it goes next');
eq('the next server in order', nextServer(ids, 0, new Set(['vidfast'])), 1);
eq('servers already failed for this title are skipped', nextServer(ids, 0, new Set(['vidfast', 'videasy'])), 2);
eq('it wraps around past the end', nextServer(ids, 4, new Set(['vidsrcto'])), 0);
eq('every server tried means stop, not loop forever', nextServer(ids, 2, new Set(ids)), null);
eq('a single server list has nowhere to go', nextServer(['vidfast'], 0, new Set(['vidfast'])), null);

console.log('\nwhat counts as proof the player has the film (real messages, 2026-10-01)');
eq('VidFast refusing to play still posts empty MEDIA_DATA: not proof',
  isPlaybackEvidence({ type: 'MEDIA_DATA', data: {} }), false);
eq('Videasy behind "Iframe Sandbox Detected" posts MEDIA_DATA naming the film: not proof',
  isPlaybackEvidence('{"type":"MEDIA_DATA","data":"{\\"movie-1492640\\":{\\"poster\\":\\"x\\"}}"}'), false);
eq('SmashyStream still searching for a source: not proof',
  isPlaybackEvidence({ source: 'anyembed', type: 'PLAYER_EVENT', data: { event: 'scraping_progress', done: 0, total: 22 } }), false);
eq('VidSrc.me announcing player_info only: not proof',
  isPlaybackEvidence({ type: 'PLAYER_EVENT', data: { player_info: { tmdb: '1377237', mediaType: 'movie' } } }), false);
eq('VidLink analytics chatter: not proof',
  isPlaybackEvidence({ data: { type: 'initToParent', counterId: 98154677 } }), false);
eq('a player reporting time passing: proof',
  isPlaybackEvidence({ type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime: 12.4, duration: 5926 } }), true);
eq('a paused player has the film loaded: proof',
  isPlaybackEvidence({ type: 'PLAYER_EVENT', data: { event: 'pause', currentTime: 0, duration: 5926 } }), true);
eq('the same event sent as a JSON string: proof',
  isPlaybackEvidence('{"type":"PLAYER_EVENT","data":{"event":"play"}}'), true);
eq('garbage and non-objects are never proof',
  [isPlaybackEvidence('not json'), isPlaybackEvidence(null), isPlaybackEvidence(42), isPlaybackEvidence({ type: 'PLAYER_EVENT' })], [false, false, false, false]);

console.log('\nstorage that refuses');
globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
eq('blocked storage still yields a server', startServer(ids, T), 0);
let threw = false; try { markDown('vidfast', T); markWorking('vidlink', T); } catch { threw = true; }
eq('and recording never throws', threw, false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
