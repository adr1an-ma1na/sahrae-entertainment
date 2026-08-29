/**
 * Tests for the Listen hub's music + podcast plumbing.
 *
 * Pure-logic tests run offline. The LIVE block actually calls iTunes and fetches
 * a real episode's audio, because the whole point of this change was that the
 * previous podcast path returned 200 to curl and nothing to a browser — that is
 * a class of bug no amount of unit testing catches.
 *
 * Run: node --experimental-strip-types listen-check.mjs
 *      node --experimental-strip-types listen-check.mjs --offline   (skip network)
 */
import { parsePlaylistId, parseISODuration } from './src/services/youtubeParse.ts';
import { mergeEpisodes, unwrapTrackingUrl } from './src/services/itunesPodcasts.ts';
import { matchEpisodeVideo, tokenize, tokenOverlap, durationScore } from './src/services/episodeVideo.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

// ── parsePlaylistId: every shape a person might paste ──────────────────────
console.log('\nparsePlaylistId');
ok('YouTube Music share link',
  parsePlaylistId('https://music.youtube.com/playlist?list=PLabc123_-XY') === 'PLabc123_-XY');
ok('youtube.com watch URL carrying a list',
  parsePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz789') === 'PLxyz789');
ok('youtu.be short link with list',
  parsePlaylistId('https://youtu.be/dQw4w9WgXcQ?list=PLshort1') === 'PLshort1');
ok('bare PL id', parsePlaylistId('PLbare0000') === 'PLbare0000');
ok('YT Music VL-prefixed id is unwrapped',
  parsePlaylistId('VLPLmusic123') === 'PLmusic123');
ok('album/auto playlist (OL)', parsePlaylistId('OLak5uy_album') === 'OLak5uy_album');
ok('channel uploads (UU)', parsePlaylistId('UUabcdef') === 'UUabcdef');
ok('surrounding whitespace tolerated',
  parsePlaylistId('  https://music.youtube.com/playlist?list=PLpad  ') === 'PLpad');
ok('list= wins over a bare-looking prefix elsewhere',
  parsePlaylistId('https://x.test/PLdecoy?list=PLreal') === 'PLreal');
ok('rejects empty', parsePlaylistId('') === null);
ok('rejects whitespace only', parsePlaylistId('   ') === null);
ok('rejects a plain video URL (no list)',
  parsePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === null);
ok('rejects arbitrary text', parsePlaylistId('my favourite songs') === null);
ok('rejects an id with no known prefix', parsePlaylistId('XXnotaplaylist') === null);

// ── parseISODuration: the field that used to be hardcoded to 180 ───────────
console.log('\nparseISODuration');
ok('PT4M13S = 253', parseISODuration('PT4M13S') === 253);
ok('PT1H2M10S = 3730', parseISODuration('PT1H2M10S') === 3730);
ok('seconds only', parseISODuration('PT45S') === 45);
ok('minutes only', parseISODuration('PT3M') === 180);
ok('hours only', parseISODuration('PT2H') === 7200);
ok('live/zero duration', parseISODuration('P0D') === 0);
ok('multi-hour podcast PT3H21M9S', parseISODuration('PT3H21M9S') === 12069);
ok('garbage returns 0, not NaN', parseISODuration('banana') === 0);
ok('empty returns 0', parseISODuration('') === 0);
ok('undefined returns 0', parseISODuration(undefined) === 0);

// ── mergeEpisodes: iTunes spine + RSS tail, without duplicates ─────────────
console.log('\nmergeEpisodes');
const ep = (id, audioUrl, extra = {}) => ({
  id, audioUrl, title: id, artist: 'Show', duration: 100, uploaded: 1000, ...extra,
});

ok('empty extra returns primary untouched',
  mergeEpisodes([ep('pod:a', 'u1')], []).length === 1);
ok('empty primary returns extra',
  mergeEpisodes([], [ep('pod:b', 'u2')]).length === 1);

const dupById = mergeEpisodes([ep('pod:a', 'u1')], [ep('pod:a', 'u1')]);
ok('same id is not duplicated', dupById.length === 1);

// The case that actually happens: a feed reports a different guid for the same
// episode, so id-matching alone would double it.
const dupByAudio = mergeEpisodes([ep('pod:itunes-guid', 'https://cdn/x.mp3')],
                                 [ep('pod:rss-guid', 'https://cdn/x.mp3')]);
ok('same audio URL under a different guid is not duplicated', dupByAudio.length === 1);

const tail = mergeEpisodes([ep('pod:new', 'u-new', { uploaded: 5000 })],
                           [ep('pod:old', 'u-old', { uploaded: 1000 })]);
ok('older RSS-only episodes are appended', tail.length === 2);
ok('iTunes episode stays first', tail[0].id === 'pod:new');

const enriched = mergeEpisodes(
  [ep('pod:a', 'u1', { description: 'short', duration: 0 })],
  [ep('pod:a', 'u1', { description: 'a much longer set of show notes', duration: 610,
                       chapters: [{ start: 0, title: 'Intro' }] })],
);
ok('chapters fold in from RSS', !!enriched[0].chapters);
ok('longer show notes win', enriched[0].description === 'a much longer set of show notes');
ok('missing duration is filled from RSS', enriched[0].duration === 610);

const keep = mergeEpisodes(
  [ep('pod:a', 'u1', { description: 'the authoritative iTunes description', duration: 300 })],
  [ep('pod:a', 'u1', { description: 'tiny', duration: 999 })],
);
ok('a good iTunes duration is NOT overwritten by RSS', keep[0].duration === 300);
ok('a longer existing description is NOT replaced by a shorter one',
  keep[0].description === 'the authoritative iTunes description');

const appendOrder = mergeEpisodes([], [ep('x', 'ux', { uploaded: 1 }), ep('y', 'uy', { uploaded: 9 })]);
ok('extra-only path preserves the caller order', appendOrder.length === 2);

// ── matchEpisodeVideo: showing nothing beats showing the wrong video ───────
console.log('\nmatchEpisodeVideo');
const vid = (title, duration, artist = 'Some Channel') => ({ id: title, title, duration, artist });
const EPISODE = { title: 'The Trouble With Sea Level Rise', artist: 'Science Weekly', duration: 1800 };

ok('no candidates → null', matchEpisodeVideo(EPISODE, []) === null);

// The real-world failure: a search always returns something, and the old code
// played whatever was first.
ok('unrelated music video is rejected',
  matchEpisodeVideo(EPISODE, [vid('Rihanna - Diamonds', 253, 'RihannaVEVO')]) === null);
ok('a short clip of the right show is rejected',
  matchEpisodeVideo(EPISODE, [vid('Science Weekly clip', 95, 'Science Weekly')]) === null);
ok('a different episode of the same show is rejected',
  matchEpisodeVideo(EPISODE, [vid('The Trouble With Antibiotics', 1795, 'Science Weekly')]) === null);

const exact = matchEpisodeVideo(EPISODE, [vid('The Trouble With Sea Level Rise', 1800, 'Science Weekly')]);
ok('the genuine episode is accepted', !!exact);
ok('  and it is the right one', exact?.track.title === 'The Trouble With Sea Level Rise');
ok('  reason mentions runtime', /runtime/.test(exact?.reason || ''));

ok('runtime within 20% still matches',
  !!matchEpisodeVideo(EPISODE, [vid('The Trouble With Sea Level Rise', 1900, 'Science Weekly')]));
ok('runtime beyond 20% does not',
  matchEpisodeVideo({ ...EPISODE, title: 'Sea Level' }, [vid('Sea Level', 3600, 'Other')]) === null);

// A show that titles its uploads identically, where YouTube gave no duration.
ok('near-identical title matches without a duration',
  !!matchEpisodeVideo(EPISODE, [vid('The Trouble With Sea Level Rise', 0, 'Science Weekly')]));

const best = matchEpisodeVideo(EPISODE, [
  vid('The Trouble With Sea Level Rise (clip)', 1500, 'Random Reuploads'),
  vid('The Trouble With Sea Level Rise', 1800, 'Science Weekly'),
]);
ok('picks the better of two plausible matches', best?.track.artist === 'Science Weekly');

ok('tokenize drops filler words', !tokenize('The Official Full Episode Video').includes('the'));
ok('tokenOverlap is 1 for identical titles', tokenOverlap('sea level rise', 'sea level rise') === 1);
ok('tokenOverlap is 0 for disjoint titles', tokenOverlap('sea level rise', 'chocolate cake') === 0);
ok('durationScore peaks at an exact match', durationScore(1800, 1800) === 1);
ok('durationScore is 0 past the 20% band', durationScore(1800, 2400) === 0);
ok('durationScore handles a missing duration', durationScore(1800, 0) === 0);

// ── LIVE: the assumption that broke the old implementation ────────────────
if (!process.argv.includes('--offline')) {
  console.log('\nlive iTunes + audio reachability');

  const getEpisodesById = async (collectionId, limit = 200) => {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=podcastEpisode&limit=${limit}`);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.results || []).filter((x) => x.wrapperType === 'podcastEpisode');
  };

  // Search → show → episodes, the same three hops the UI makes.
  const s = await fetch('https://itunes.apple.com/search?media=podcast&limit=3&term=technology').then((r) => r.json());
  const shows = (s.results || []).filter((r) => r.collectionId);
  ok('iTunes search returns shows with a numeric collectionId', shows.length > 0);

  let checkedAudio = false;
  for (const show of shows.slice(0, 2)) {
    const eps = await getEpisodesById(show.collectionId, 20);
    ok(`"${String(show.collectionName).slice(0, 28)}" returns episodes`, eps.length > 0);
    if (!eps.length) continue;

    const withAudio = eps.filter((e) => e.episodeUrl);
    ok('  every episode carries a direct audio URL', withAudio.length === eps.length,
      `${withAudio.length}/${eps.length}`);
    ok('  durations are present', eps.filter((e) => e.trackTimeMillis > 0).length > 0);
    ok('  artwork is present', eps.filter((e) => e.artworkUrl600 || e.artworkUrl160).length > 0);

    // The decisive check: the audio actually serves bytes. A metadata API that
    // returns dead URLs would look perfect in every test above.
    if (!checkedAudio && withAudio[0]) {
      const url = withAudio[0].episodeUrl;
      try {
        const head = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-2047' } });
        const ct = head.headers.get('content-type') || '';
        ok(`  audio responds (${head.status}, ${ct.slice(0, 24)})`,
          head.ok || head.status === 206);
        ok('  content-type is audio', /audio|octet-stream|mpeg/i.test(ct), ct);
        checkedAudio = true;
      } catch (e) { ok('  audio fetch', false, String(e).slice(0, 60)); }
    }
  }

  // CORS is the thing that made the RSS-only path fail silently on the web.
  const cors = await fetch('https://itunes.apple.com/lookup?id=1665219519&entity=podcastEpisode&limit=1');
  ok('iTunes sends Access-Control-Allow-Origin (works in the PWA)',
    cors.headers.get('access-control-allow-origin') === '*',
    String(cors.headers.get('access-control-allow-origin')));
}

// ── unwrapTrackingUrl ─────────────────────────────────────────────────────
// Podcast publishers chain analytics redirectors in front of the audio. Those
// are tracker domains, so a content blocker kills the chain and the episode
// never loads — the real failure this was written for. The file is at the end
// of the path; these assert we find it without breaking anything else.
console.log('\nunwrapTrackingUrl');
{
  const chained = 'https://pdst.fm/e/pscrb.fm/rss/p/mgln.ai/e/1390/claritaspod.com/measure/p.podderapp.com/2544644999/mgln.ai/e/1651/episode.flightcast.com/01M0AAXF9ND240164721SD7ETJ.mp3';
  ok('unwraps a 6-hop chain to the real host',
    unwrapTrackingUrl(chained) === 'https://episode.flightcast.com/01M0AAXF9ND240164721SD7ETJ.mp3');
  ok('unwraps a chartable.com prefix',
    unwrapTrackingUrl('https://chtbl.com/track/ABC/traffic.megaphone.fm/X9.mp3') === 'https://traffic.megaphone.fm/X9.mp3');
  ok('unwraps a podtrac prefix',
    unwrapTrackingUrl('https://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/s/ep1.mp3') === 'https://traffic.libsyn.com/s/ep1.mp3');

  // Must not touch what is already direct, or anything that is not audio.
  ok('leaves an already-direct URL alone',
    unwrapTrackingUrl('https://traffic.megaphone.fm/PLAIN.mp3') === 'https://traffic.megaphone.fm/PLAIN.mp3');
  ok('leaves a non-audio URL alone',
    unwrapTrackingUrl('https://feeds.npr.org/500005/podcast.xml') === 'https://feeds.npr.org/500005/podcast.xml');
  ok('leaves a path with no embedded host alone',
    unwrapTrackingUrl('https://cdn.example.com/a/b/c/ep.mp3') === 'https://cdn.example.com/a/b/c/ep.mp3');
  ok('garbage in, garbage out — never throws', unwrapTrackingUrl('not a url') === 'not a url');
  ok('empty string is returned unchanged', unwrapTrackingUrl('') === '');
  ok('preserves a query string',
    unwrapTrackingUrl('https://pdst.fm/e/cdn.host.com/f.mp3?token=1') === 'https://cdn.host.com/f.mp3?token=1');
  ok('handles m4a as well as mp3',
    unwrapTrackingUrl('https://chtbl.com/t/A/cdn.host.com/f.m4a') === 'https://cdn.host.com/f.m4a');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
