/**
 * Phase 1 + Phase 2 tests.
 *
 * Covers what is easy to get wrong and expensive to get wrong: PKCE and state
 * handling (a security check), provider normalisation (silent data corruption),
 * Tier 1 fallback timing (a launcher that double-opens or never opens), tier
 * selection (the licensing boundary), and the foreground guard (the mechanism
 * that keeps provider audio out of the background).
 *
 * Run: node --experimental-strip-types connector-check.mjs
 */
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  base64UrlEncode, buildAuthorizeUrl, createCodeChallenge, createCodeVerifier,
  createPkcePair, parseCallback, randomString, safeEqual,
} from './src/auth/pkce.ts';
import { isoDurationToMs, toSahraeTrack as ytTrack } from './src/providers/youtube.ts';
import { toSahraeTrack as spTrack } from './src/providers/spotify.ts';
import { mergeTracks } from './src/providers/registry.ts';
import { launchWith } from './src/playback/tier1.ts';
import { pickArtwork, sahraeId } from './src/types/index.ts';
import {
  embedBlockedReason, embedUrlFor, isEmbeddable, resolveAction, resolveTier,
  spotifyEmbedUrl, youtubeEmbedUrl,
} from './src/playback/tierPolicy.ts';
import { checkEmbedVisible, ForegroundGuard } from './src/playback/foregroundGuard.ts';
import { backendMisconfigured } from './src/auth/config.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

// ── PKCE ───────────────────────────────────────────────────────────────────
console.log('\nPKCE');
const v = createCodeVerifier();
ok('verifier is within RFC 7636 length bounds', v.length >= 43 && v.length <= 128, String(v.length));
ok('verifier uses only unreserved characters', /^[A-Za-z0-9\-._~]+$/.test(v));
ok('short lengths are clamped up to 43', createCodeVerifier(5).length === 43);
ok('long lengths are clamped down to 128', createCodeVerifier(999).length === 128);
ok('two verifiers differ', createCodeVerifier() !== createCodeVerifier());

const challenge = await createCodeChallenge('abc123');
ok('challenge is base64url (no +/=)', /^[A-Za-z0-9\-_]+$/.test(challenge));
ok('challenge is deterministic', challenge === await createCodeChallenge('abc123'));
ok('challenge differs for a different verifier', challenge !== await createCodeChallenge('abc124'));
// RFC 7636 §A test vector.
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
ok('matches the RFC 7636 test vector', await createCodeChallenge(RFC_VERIFIER) === RFC_CHALLENGE);

ok('base64UrlEncode strips padding', !base64UrlEncode(new Uint8Array([1, 2, 3, 4, 5])).includes('='));
ok('randomString honours its length', randomString(17).length === 17);

const pair = await createPkcePair();
ok('pair carries verifier, challenge and state', !!pair.verifier && !!pair.challenge && !!pair.state);

// ── safeEqual ──
console.log('\nsafeEqual');
ok('equal strings match', safeEqual('abc', 'abc'));
ok('different strings do not', !safeEqual('abc', 'abd'));
ok('different lengths do not', !safeEqual('abc', 'abcd'));
ok('empty strings match', safeEqual('', ''));
ok('non-strings are rejected', !safeEqual(undefined, undefined));

// ── authorize URL ──
console.log('\nbuildAuthorizeUrl');
const url = buildAuthorizeUrl({
  authorizeEndpoint: 'https://accounts.spotify.com/authorize',
  clientId: 'cid', redirectUri: 'https://app.test/cb',
  scopes: ['user-library-read', 'playlist-read-private'],
  challenge: 'CH', state: 'ST',
});
const parsed = new URL(url);
ok('response_type is code', parsed.searchParams.get('response_type') === 'code');
ok('method is S256', parsed.searchParams.get('code_challenge_method') === 'S256');
ok('scopes are space-joined', parsed.searchParams.get('scope') === 'user-library-read playlist-read-private');
ok('redirect_uri round-trips exactly', parsed.searchParams.get('redirect_uri') === 'https://app.test/cb');
ok('no client_secret is ever included', !parsed.searchParams.has('client_secret'));
const withExtra = new URL(buildAuthorizeUrl({
  authorizeEndpoint: 'https://x.test/a', clientId: 'c', redirectUri: 'r',
  scopes: [], challenge: 'C', state: 'S', extra: { access_type: 'offline', prompt: 'consent' },
}));
ok('extra params are merged', withExtra.searchParams.get('access_type') === 'offline');
ok('empty scope list is omitted', !withExtra.searchParams.has('scope'));

// ── callback parsing ──
console.log('\nparseCallback');
ok('reads code and state from a query',
  parseCallback('https://app.test/cb?code=AAA&state=BBB').code === 'AAA');
ok('reads an error', parseCallback('https://app.test/cb?error=access_denied').error === 'access_denied');
ok('reads error_description',
  parseCallback('https://app.test/cb?error=x&error_description=nope').errorDescription === 'nope');
ok('accepts a bare query string', parseCallback('code=Z&state=Y').code === 'Z');
ok('reads a fragment', parseCallback('https://app.test/cb#code=F').code === 'F');
ok('merges query and fragment', parseCallback('https://a.test/cb?code=Q#state=S').state === 'S');
ok('missing values are undefined, not empty strings',
  parseCallback('https://app.test/cb').code === undefined);
ok('url-encoded values are decoded',
  parseCallback('https://a.test/cb?code=a%2Fb').code === 'a/b');

// ── SahraeTrack normalisation ──────────────────────────────────────────────
console.log('\nSpotify → SahraeTrack');
const SP = {
  id: '4cO', name: 'Bad Guy', duration_ms: 194000, explicit: false,
  uri: 'spotify:track:4cO', external_urls: { spotify: 'https://open.spotify.com/track/4cO' },
  external_ids: { isrc: 'USUM71900764' },
  artists: [{ name: 'Billie Eilish' }],
  album: { name: 'When We All Fall Asleep', images: [{ url: 'a.jpg', width: 640, height: 640 }, { url: 'b.jpg', width: 64, height: 64 }] },
};
const sp = spTrack(SP, '2024-01-02T03:04:05Z');
ok('id is namespaced', sp.id === 'spotify:4cO');
ok('provider is recorded', sp.provider === 'spotify');
ok('artists become an array', Array.isArray(sp.artists) && sp.artists[0] === 'Billie Eilish');
ok('duration stays in ms', sp.durationMs === 194000);
ok('isrc is carried', sp.isrc === 'USUM71900764');
ok('addedAt is parsed to epoch ms', sp.addedAt === Date.parse('2024-01-02T03:04:05Z'));
ok('advertises tier 2 (Spotify has a sanctioned embed)', sp.playback.tier === 2);
ok('deep link is the spotify uri', sp.playback.deepLink === 'spotify:track:4cO');
ok('web url is present as fallback', !!sp.playback.webUrl);
ok('NO streamUrl is ever set', sp.playback.streamUrl === undefined);
ok('carries an embed url', typeof sp.playback.embedUrl === 'string');
ok('local files are rejected', spTrack({ ...SP, is_local: true }) === null);
ok('null placeholders are rejected', spTrack(null) === null);
ok('an entry without an id is rejected', spTrack({ ...SP, id: null }) === null);
ok('missing artists fall back rather than crash',
  spTrack({ ...SP, artists: [] }).artists[0] === 'Unknown Artist');
ok('a track with no album images yields empty artwork',
  spTrack({ ...SP, album: { name: 'x' } }).artwork.length === 0);

console.log('\nYouTube → SahraeTrack');
ok('PT4M13S → 253000ms', isoDurationToMs('PT4M13S') === 253000);
ok('PT1H2M10S → 3730000ms', isoDurationToMs('PT1H2M10S') === 3730000);
ok('garbage → 0', isoDurationToMs('nope') === 0);
ok('undefined → 0', isoDurationToMs(undefined) === 0);

const yt = ytTrack('dQw4', { title: 'Never Gonna Give You Up', videoOwnerChannelTitle: 'Rick Astley - Topic', thumbnails: { high: { url: 'h.jpg', width: 480 } } }, 213000);
ok('id is namespaced', yt.id === 'youtube:dQw4');
ok('"- Topic" is stripped from the channel', yt.artists[0] === 'Rick Astley');
ok('deep link uses vnd.youtube', yt.playback.deepLink === 'vnd.youtube:dQw4');
ok('web url is the watch page', yt.playback.webUrl === 'https://www.youtube.com/watch?v=dQw4');
ok('NO streamUrl is ever set', yt.playback.streamUrl === undefined);
ok('deleted-video tombstones are rejected', ytTrack('x', { title: 'Deleted video' }) === null);
ok('private-video tombstones are rejected', ytTrack('x', { title: 'Private video' }) === null);
ok('a missing videoId is rejected', ytTrack('', { title: 'ok' }) === null);

ok('sahraeId composes provider and id', sahraeId('deezer', '99') === 'deezer:99');
ok('pickArtwork prefers the largest at or above min',
  pickArtwork([{ url: 'small', width: 64 }, { url: 'big', width: 640 }], 300) === 'big');
ok('pickArtwork falls back to the largest available',
  pickArtwork([{ url: 'small', width: 64 }], 300) === 'small');
ok('pickArtwork on an empty list is undefined', pickArtwork([]) === undefined);

// ── merge ──────────────────────────────────────────────────────────────────
console.log('\nmergeTracks');
const mk = (provider, id, addedAt, isrc) => ({
  id: `${provider}:${id}`, provider, providerId: id, title: id, artists: ['A'],
  durationMs: 1000, artwork: [], addedAt, isrc, playback: { tier: 1, webUrl: 'w' },
});
const merged = mergeTracks([
  [mk('spotify', 'a', 300), mk('spotify', 'b', 100)],
  [mk('youtube', 'c', 200)],
]);
ok('merges every provider', merged.length === 3);
ok('newest saved first', merged[0].providerId === 'a' && merged[2].providerId === 'b');

const undated = mergeTracks([[mk('spotify', 'x', undefined), mk('spotify', 'y', 500)]]);
ok('undated entries sort after dated ones', undated[0].providerId === 'y');

// The same recording on two services is two playable things by default.
const dupes = [[mk('spotify', 'a', 1, 'ISRC1')], [mk('youtube', 'b', 2, 'ISRC1')]];
ok('duplicates are kept by default', mergeTracks(dupes).length === 2);
const deduped = mergeTracks(dupes, { dedupeByIsrc: true, order: ['spotify', 'youtube'] });
ok('dedupe by isrc collapses them', deduped.length === 1);
ok('the preferred provider wins', deduped[0].provider === 'spotify');
const dedupedYt = mergeTracks(dupes, { dedupeByIsrc: true, order: ['youtube', 'spotify'] });
ok('order controls which one survives', dedupedYt[0].provider === 'youtube');
ok('tracks without an isrc are never collapsed',
  mergeTracks([[mk('spotify', 'a', 1)], [mk('youtube', 'b', 2)]], { dedupeByIsrc: true }).length === 2);
ok('an empty input yields an empty list', mergeTracks([]).length === 0);

// ── Tier 1 launcher ────────────────────────────────────────────────────────
console.log('\nTier 1 launch');
function harness({ backgroundAfter = null } = {}) {
  const calls = { navigate: [], external: [] };
  let timerFn = null;
  let bgFn = null;
  const deps = {
    isNative: false,
    navigate: (u) => {
      calls.navigate.push(u);
      // Simulate the OS switching apps.
      if (backgroundAfter === 'navigate' && bgFn) bgFn();
    },
    openExternal: (u) => calls.external.push(u),
    onBackgrounded: (fn) => { bgFn = fn; return () => { bgFn = null; }; },
    delay: (_ms, fn) => { timerFn = fn; return () => { timerFn = null; }; },
  };
  return { deps, calls, fireTimer: () => timerFn && timerFn(), isTimerLive: () => !!timerFn };
}

const DEEP = { kind: 'deeplink', deepLink: 'spotify:track:1', webUrl: 'https://open.spotify.com/track/1', provider: 'spotify' };

{
  const h = harness();
  const p = launchWith(h.deps, DEEP);
  h.fireTimer();
  const r = await p;
  ok('falls back to the web when the app never opens', r.opened === 'web');
  ok('  it navigated to the deep link first', h.calls.navigate[0] === 'spotify:track:1');
  ok('  and opened exactly one web url', h.calls.external.length === 1);
}
{
  const h = harness({ backgroundAfter: 'navigate' });
  const r = await launchWith(h.deps, DEEP);
  ok('reports the app opened when we get backgrounded', r.opened === 'app');
  ok('  and does NOT also open the web page', h.calls.external.length === 0);
  ok('  and cancels the fallback timer', !h.isTimerLive());
}
{
  const h = harness();
  const p = launchWith(h.deps, { kind: 'deeplink', webUrl: 'https://x.test/t', provider: 'deezer' });
  const r = await p;
  ok('with no deep link it goes straight to the web', r.opened === 'web');
  ok('  without attempting a scheme navigation', h.calls.navigate.length === 0);
}
{
  const h = harness();
  const r = await launchWith(h.deps, { kind: 'unavailable', reason: 'Not connected' });
  ok('an unavailable action opens nothing', r.opened === 'none');
  ok('  and reports why', r.reason === 'Not connected');
}
{
  // Phase 1 must refuse tiers it has not built rather than half-handling them.
  const h = harness();
  const r = await launchWith(h.deps, { kind: 'embed', embedUrl: 'https://e', provider: 'youtube' });
  ok('the Tier 1 launcher refuses an embed action (the player handles those)', r.opened === 'none');
  ok('  with an explicit reason', /not implemented in Phase 1/.test(r.reason));
}
{
  // A late timer after the app already opened must not double-open.
  const h = harness({ backgroundAfter: 'navigate' });
  const p = launchWith(h.deps, DEEP);
  await p;
  h.fireTimer();
  ok('a late fallback timer cannot double-open', h.calls.external.length === 0);
}

// ══ PHASE 2 — Tier 2 embedded playback ════════════════════════════════════

console.log('\nresolveTier / resolveAction');

const ENV = { canEmbed: true, preferEmbed: true, hidden: false };
const t2 = (over = {}) => ({
  id: 'spotify:x', provider: 'spotify', providerId: 'x', title: 't', artists: ['a'],
  durationMs: 1000, artwork: [],
  playback: {
    tier: 2, deepLink: 'spotify:track:x', webUrl: 'https://open.spotify.com/track/x',
    embedUrl: 'https://open.spotify.com/embed/track/x', ...over,
  },
});

ok('embeddable + allowed → tier 2', resolveTier(t2(), ENV) === 2);
ok('no embedUrl → tier 1', resolveTier(t2({ embedUrl: undefined }), ENV) === 1);
ok('no DOM to embed into → tier 1', resolveTier(t2(), { ...ENV, canEmbed: false }) === 1);
ok('listener prefers hand-off → tier 1', resolveTier(t2(), { ...ENV, preferEmbed: false }) === 1);
ok('page hidden → tier 1; never start an embed in the background',
  resolveTier(t2(), { ...ENV, hidden: true }) === 1);
ok('provider with no sanctioned embed → tier 1',
  resolveTier({ ...t2(), provider: 'deezer' }, ENV) === 1);

ok('isEmbeddable: spotify', isEmbeddable('spotify'));
ok('isEmbeddable: youtube', isEmbeddable('youtube'));
ok('isEmbeddable: not apple', !isEmbeddable('apple'));
ok('isEmbeddable: not deezer', !isEmbeddable('deezer'));
ok('isEmbeddable: not soundcloud', !isEmbeddable('soundcloud'));

// Tier 3 is Phase 3. It must be unreachable without a Sahrae-owned stream.
ok('a tier-3 claim WITHOUT a streamUrl does not get tier 3',
  resolveTier(t2({ tier: 3, streamUrl: undefined }), ENV) !== 3);
ok('tier 3 needs a real streamUrl (Sahrae-owned catalog only)',
  resolveTier(t2({ tier: 3, streamUrl: 'https://cdn.sahrae/x.m4a' }), ENV) === 3);

const act2 = resolveAction(t2(), ENV);
ok('action is an embed at tier 2', act2.kind === 'embed');
ok('  carrying the embed url', act2.embedUrl === 'https://open.spotify.com/embed/track/x');
const act1 = resolveAction(t2(), { ...ENV, preferEmbed: false });
ok('action is a deeplink at tier 1', act1.kind === 'deeplink');
ok('  still carrying the web fallback', act1.webUrl.startsWith('https://'));
ok('action is native at tier 3',
  resolveAction(t2({ tier: 3, streamUrl: 'https://cdn.sahrae/x.m4a' }), ENV).kind === 'native');

console.log('\nembed URLs');
ok('spotify embed url shape', spotifyEmbedUrl('abc') === 'https://open.spotify.com/embed/track/abc');
ok('spotify ids are url-encoded', spotifyEmbedUrl('a/b').includes('a%2Fb'));
const ytU = youtubeEmbedUrl('vid1', 'https://app.test');
ok('youtube embed enables the js api', ytU.includes('enablejsapi=1'));
ok('youtube embed passes origin', ytU.includes('origin=https%3A%2F%2Fapp.test'));
ok('youtube embed sets playsinline', ytU.includes('playsinline=1'));
ok('youtube embed omits origin when unknown', !youtubeEmbedUrl('v').includes('origin='));
ok('embedUrlFor picks spotify', embedUrlFor(t2()).includes('open.spotify.com/embed'));
ok('embedUrlFor picks youtube',
  embedUrlFor({ ...t2(), provider: 'youtube', providerId: 'v9' }).includes('youtube.com/embed/v9'));
ok('embedUrlFor is undefined for a stub provider',
  embedUrlFor({ ...t2(), provider: 'apple' }) === undefined);

console.log('\nadapter descriptors advertise tier 2, never a stream');
const spE = spTrack(SP);
ok('spotify advertises tier 2', spE.playback.tier === 2);
ok('spotify carries an embed url', !!spE.playback.embedUrl);
ok('spotify keeps its tier 1 fallback', !!spE.playback.webUrl && !!spE.playback.deepLink);
ok('spotify NEVER carries a streamUrl', spE.playback.streamUrl === undefined);
const ytE = ytTrack('vid2', { title: 'x', channelTitle: 'c' }, 1000);
ok('youtube advertises tier 2', ytE.playback.tier === 2);
ok('youtube carries an embed url', !!ytE.playback.embedUrl);
ok('youtube keeps its tier 1 fallback', !!ytE.playback.webUrl && !!ytE.playback.deepLink);
ok('youtube NEVER carries a streamUrl', ytE.playback.streamUrl === undefined);

console.log('\nembedBlockedReason');
ok('null when it will embed', embedBlockedReason(t2(), ENV) === null);
ok('explains a hidden page', /on screen/.test(embedBlockedReason(t2(), { ...ENV, hidden: true })));
ok('explains an unsupported provider',
  /no in-app player/i.test(embedBlockedReason({ ...t2(), provider: 'deezer' }, ENV)));
ok('explains the preference being off',
  /switched off/i.test(embedBlockedReason(t2(), { ...ENV, preferEmbed: false })));

console.log('\nForegroundGuard — background playback is refused, not merely discouraged');
function guardHarness() {
  const events = [];
  const g = new ForegroundGuard({
    onMustPause: () => events.push('pause'),
    onMayResume: () => events.push('resume'),
  });
  return { g, events };
}
{
  const { g, events } = guardHarness();
  g.playbackStarted();
  g.handle('hidden');
  ok('backgrounding pauses playback', events.join() === 'pause');
  ok('  and the guard records it was responsible', g.wasPausedByGuard);
}
{
  const { g, events } = guardHarness();
  g.playbackStarted();
  g.handle('hidden'); g.handle('hidden'); g.handle('hidden');
  ok('repeated hidden events pause once, not three times',
    events.filter((e) => e === 'pause').length === 1);
}
{
  const { g, events } = guardHarness();
  g.handle('hidden');
  ok('backgrounding while idle does nothing', events.length === 0);
}
{
  const { g, events } = guardHarness();
  g.playbackStarted();
  g.handle('hidden');
  g.handle('visible');
  ok('returning offers a resume rather than auto-playing', events.join() === 'pause,resume');
  ok('  and clears the guard flag', !g.wasPausedByGuard);
}
{
  const { g, events } = guardHarness();
  g.playbackStarted();
  g.handle('visible');
  ok('returning without having paused does nothing', events.length === 0);
}
{
  const { g, events } = guardHarness();
  g.playbackStarted();
  g.playbackStopped();
  g.handle('hidden');
  ok('after playback stops, backgrounding does not pause', events.length === 0);
}

console.log('\ncheckEmbedVisible');
ok('an unmounted element is reported', /not mounted/.test(checkEmbedVisible(null)));
ok('no-ops safely without a DOM', checkEmbedVisible({}) === null);

// ── The guard is wired, not decorative ────────────────────────────────────
// backendMisconfigured() shipped once as dead code: defined, exported by
// nothing, called by nothing, while the README claimed it caught the problem at
// startup. These assert the behaviour so it cannot quietly rot again.
console.log('\nbackendMisconfigured');
{
  const g = globalThis;
  const hadWindow = 'window' in g;
  const prevWindow = g.window;

  // Web with the same-origin default: correct, so no complaint.
  g.window = {};
  ok('web + empty backend -> no error', backendMisconfigured() === null);

  // Native with the same-origin default: the broken case.
  g.window = { Capacitor: { isNativePlatform: () => true } };
  const msg = backendMisconfigured();
  ok('native + empty backend -> reports the problem', typeof msg === 'string' && msg.length > 0);
  ok('  naming the variable to set', /VITE_CONNECTOR_BACKEND/.test(msg || ''));
  ok('  and explaining why (https://localhost)', /localhost/.test(msg || ''));

  // A Capacitor build reporting non-native must not be flagged.
  g.window = { Capacitor: { isNativePlatform: () => false } };
  ok('capacitor present but not native -> no error', backendMisconfigured() === null);

  // Absent window (SSR / plain node) must not throw.
  delete g.window;
  ok('no window -> no error and no throw', backendMisconfigured() === null);

  if (hadWindow) g.window = prevWindow; else delete g.window;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
