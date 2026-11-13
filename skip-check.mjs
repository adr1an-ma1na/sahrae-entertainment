// node --experimental-strip-types skip-check.mjs
// Skip Intro timings, removing from Jump back in across devices, and carrying a subtitle language over.
import { parseIntroDb, parseAniSkip, segmentAt, skipTarget, skipLabel, loadSegments } from './src/services/skipSegments.ts';
import { mergeScoped, trimProgress } from './src/services/syncKeys.ts';
import { trackFor, readTrackPrefs, saveTrackPrefs, subsWanted, langCode, withSubs } from './src/services/trackPrefs.ts';
import { languageLabel, isOriginal, subsList } from './src/services/playerChoices.ts';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};

console.log('\nTheIntroDB, as it answered on 2026-11-12');
// Jujutsu Kaisen S1E2 and Frieren S1E3, verbatim.
const jjk = parseIntroDb({ tmdb_id: 95479, type: 'tv', season: 1, episode: 2, intro: [{ start_ms: 345555, end_ms: 434864 }], credits: [{ start_ms: 1335378, end_ms: 1424935 }], preview: [{ start_ms: 1424959, end_ms: null }] });
eq('seconds, in order', jjk.map((s) => [s.kind, s.start, s.end]), [['intro', 345.555, 434.864], ['credits', 1335.378, 1424.935], ['preview', 1424.959, null]]);
const frieren = parseIntroDb({ intro: [{ start_ms: null, end_ms: 90044 }] });
eq('an intro with no start opens the episode', frieren[0].start, 0);
eq('credits with no start are dropped', parseIntroDb({ credits: [{ start_ms: null, end_ms: 5000 }] }), []);
eq('a part shorter than 3 s is not worth a button', parseIntroDb({ intro: [{ start_ms: 1000, end_ms: 2500 }] }), []);
eq('junk', [parseIntroDb(null), parseIntroDb('x'), parseIntroDb({ intro: 'x' }), parseIntroDb({ intro: [{ start_ms: -5, end_ms: 'a' }] }).length], [[], [], [], 1]);

console.log('\nAniSkip');
const op = parseAniSkip({ found: true, results: [{ interval: { startTime: 344.705, endTime: 435.055 }, skipType: 'op' }, { interval: { startTime: 1334.676, endTime: 1424.926 }, skipType: 'ed' }, { interval: { startTime: 1, endTime: 2 }, skipType: 'op' }, { interval: { startTime: 1, endTime: 50 }, skipType: 'weird' }] });
eq('op is the intro, ed the credits', op.map((s) => s.kind), ['intro', 'credits']);
eq('not found', parseAniSkip({ found: false, results: [] }), []);

console.log('\nthe button');
eq('nothing before the intro', segmentAt(jjk, 100), null);
eq('Skip Intro during it', skipLabel(segmentAt(jjk, 400), true), 'Skip Intro');
eq('gone in its last second', segmentAt(jjk, 434.2), null);
eq('lands at its end', skipTarget(segmentAt(jjk, 400)), 434.864);
eq('credits of an episode with one after: Next Episode', skipLabel(segmentAt(jjk, 1340), true), 'Next Episode');
eq('credits of the last episode or a film: no button', skipLabel(segmentAt(jjk, 1340), false), null);
eq('an open end runs to the length', segmentAt(jjk, 1430, 1440)?.kind, 'preview');
eq('...and not after it', segmentAt(jjk, 1439.5, 1440), null);
eq('open end with no known length: the end is unknown', skipTarget({ kind: 'credits', start: 10, end: null }), null);
eq('open end with a length: just before it', skipTarget({ kind: 'credits', start: 10, end: null }, 1440), 1439.5);
eq('Skip Recap', skipLabel({ kind: 'recap', start: 0, end: 60 }, false), 'Skip Recap');
eq('no clock, no button', segmentAt(jjk, NaN), null);

console.log('\nlookups never break the player');
{
  const real = globalThis.fetch;
  let asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); throw new Error('offline'); };
  eq('offline: nothing to skip', await loadSegments({ tmdbId: 1, type: 'tv', season: 1, episode: 1, anime: true }), []);
  eq('asked TheIntroDB with the episode', asked[0], 'https://api.theintrodb.org/v3/media?tmdb_id=1&season=1&episode=1');
  asked = [];
  globalThis.fetch = async (u) => {
    asked.push(String(u));
    const url = String(u);
    const body = url.includes('theintrodb') ? { error: 'not found' }
      : url.includes('haglund') ? [{ myanimelist: 40748, 'themoviedb-season': 1 }, { myanimelist: 51009, 'themoviedb-season': 2 }]
      : { found: true, results: [{ interval: { startTime: 10, endTime: 100 }, skipType: 'op' }] };
    return { ok: !url.includes('theintrodb'), json: async () => body };
  };
  const got = await loadSegments({ tmdbId: 95479, type: 'tv', season: 2, episode: 3, anime: true });
  eq('anime TheIntroDB lacks: AniSkip, for that season', [got[0]?.kind, asked.some((u) => u.includes('/skip-times/51009/3?'))], ['intro', true]);
  asked = [];
  await loadSegments({ tmdbId: 95479, type: 'tv', season: 2, episode: 3, anime: true });
  eq('asked once per episode', asked.length, 0);
  asked = [];
  await loadSegments({ tmdbId: 1396, type: 'tv', season: 1, episode: 1, anime: false });
  eq('not anime: AniSkip is not asked', asked.filter((u) => !u.includes('theintrodb')).length, 0);
  eq('a film is asked without an episode', (await loadSegments({ tmdbId: 0, type: 'movie' })), []);
  globalThis.fetch = real;
}

console.log('\nremoving from Jump back in');
const K = 'sahrae_watch_progress_u1_p1';
const day = 86_400_000, now = Date.now();
{
  const phone = [{ mediaId: 7, timestamp: now - 5000, removed: true }, { mediaId: 8, timestamp: now - 9000 }];
  const tvCopy = [{ mediaId: 7, timestamp: now - day }, { mediaId: 8, timestamp: now - 9000 }];
  const merged = mergeScoped(K, phone, tvCopy);
  eq('an older copy on another device does not bring it back', merged.find((x) => x.mediaId === 7).removed, true);
  const rewatched = mergeScoped(K, phone, [{ mediaId: 7, timestamp: now }]);
  eq('watching it again later does', rewatched.find((x) => x.mediaId === 7).removed, undefined);
}
{
  const many = [...Array.from({ length: 35 }, (_, i) => ({ mediaId: i, timestamp: now - i })), { mediaId: 99, timestamp: now - 200 * day, removed: true }, { mediaId: 98, timestamp: now - day, removed: true }];
  const kept = trimProgress(many, now);
  eq('30 titles kept', kept.filter((x) => !x.removed).length, 30);
  eq('a recent removal is remembered, an old one forgotten', kept.filter((x) => x.removed).map((x) => x.mediaId), [98]);
}
eq('My List merges as before', mergeScoped('sahrae_my_list_u1_p1', [{ id: 1 }], [{ id: 2 }]).map((x) => x.id), [1, 2]);

console.log('\nsubtitles and sound carry over');
{
  const list = subsList([{ id: 0, label: 'eng' }, { id: 1, label: 'English [SDH]' }, { id: 2, label: 'spa' }]);
  eq('names, not codes', list.map((c) => c.label), ['English', 'English [SDH]', 'Spanish']);
  eq('the plain track before SDH', trackFor(list, 'english'), 0);
  eq('Spanish found', trackFor(list, 'spanish'), 2);
  eq('a language it lacks: left as it is', trackFor(list, 'korean'), null);
  eq('off stays off', trackFor(list, null), null);
  eq('the original sound is marked', [isOriginal('jpn', 'ja'), isOriginal('English', 'ja'), isOriginal('Japanese', null)], [true, false, false]);
  eq('an odd label is left alone', languageLabel('Track 2'), 'Track 2');
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  eq('nothing saved: off, medium', readTrackPrefs(store), { subs: null, audio: null, size: 'M', subsChosen: false });
  saveTrackPrefs({ subs: 'english' }, store);
  saveTrackPrefs({ size: 'L' }, store);
  eq('choices remembered together', readTrackPrefs(store), { subs: 'english', audio: null, size: 'L', subsChosen: false });
  mem.set('sahrae.tracks.v1', '{"size":"XXL","subs":5}');
  eq('a damaged copy is read safely', readTrackPrefs(store), { subs: null, audio: null, size: 'M', subsChosen: false });
}

console.log('\nsubtitles for a title in another language');
{
  const none = { subs: null, audio: null, size: 'M', subsChosen: false };
  eq('anime in Japanese: English subtitles', subsWanted(none, 'ja', 'japanese'), 'english');
  eq('a Korean drama: English subtitles', subsWanted(none, 'ko', null), 'english');
  eq('an English film: none', subsWanted(none, 'en', null), null);
  eq('already playing an English dub: none', subsWanted(none, 'ja', 'english'), null);
  eq('the viewer turned them off: off stays off', subsWanted({ ...none, subsChosen: true }, 'ja', 'japanese'), null);
  eq('the viewer chose Spanish: Spanish', subsWanted({ ...none, subs: 'spanish', subsChosen: true }, 'ja', null), 'spanish');
  eq('names to codes', [langCode('english'), langCode('korean'), langCode('klingon'), langCode(null)], ['en', 'ko', null, null]);
  eq('VidFast is told in its address', withSubs('https://vidfast.vc/tv/1/1/2?autoPlay=true', 'vidfast', 'en'), 'https://vidfast.vc/tv/1/1/2?autoPlay=true&sub=en');
  eq('other servers are left alone', withSubs('https://vidlink.pro/movie/1', 'vidlink', 'en'), 'https://vidlink.pro/movie/1');
  eq('no language, no change', withSubs('https://vidfast.vc/movie/1', 'vidfast', null), 'https://vidfast.vc/movie/1');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
