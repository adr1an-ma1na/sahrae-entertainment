/**
 * The library: what the account sync carries (services/syncKeys.ts), how two
 * devices' lists merge, and where a title resumes (services/resume.ts).
 *
 * Run: node --experimental-strip-types library-check.mjs
 */
import { syncedKey, mergeScoped, isScopedKey } from './src/services/syncKeys.ts';
import { resumePoint, timeLeft, withStartAt } from './src/services/resume.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

console.log('\nwhat the account sync carries');
const U = 'b7c1e9a0-uid';
eq('Continue watching for this account and profile', syncedKey(`sahrae_watch_progress_${U}_profile_1`, U), true);
eq('My List for this account and profile', syncedKey(`sahrae_my_list_${U}_profile_1`, U), true);
eq('...and for the account with no profile', syncedKey(`sahrae_my_list_${U}`, U), true);
eq('another account\'s list on the same device is not sent', syncedKey('sahrae_my_list_someone-else_profile_1', U), false);
eq('a look-alike uid is not this account', syncedKey(`sahrae_my_list_${U}x_profile_1`, U), false);
eq('signed out, no per-account list goes anywhere', syncedKey(`sahrae_watch_progress_${U}_profile_1`, null), false);
eq('the fixed keys still travel (liked songs)', syncedKey('sahrae.music.liked.v1', U), true);
eq('caches do not', syncedKey('sahrae_tmdb_details_123', U), false);
eq('which keys merge rather than replace', [isScopedKey(`sahrae_my_list_${U}`), isScopedKey('sahrae.music.liked.v1')], [true, false]);

console.log('\ntwo devices\' lists merge');
const PK = `sahrae_watch_progress_${U}_p`;
const phone = [{ mediaId: 1, timestamp: 100, episode: 2 }, { mediaId: 2, timestamp: 90 }];
const tv = [{ mediaId: 3, timestamp: 120 }, { mediaId: 1, timestamp: 80, episode: 1 }];
const merged = mergeScoped(PK, phone, tv);
eq('every title either side has is kept', merged.map((x) => x.mediaId), [3, 1, 2]);
eq('the same title keeps its more recent entry', merged.find((x) => x.mediaId === 1).episode, 2);
eq('a device with an empty list loses nothing', mergeScoped(PK, [], tv).length, 2);
eq('an empty list from the server wipes nothing', mergeScoped(PK, phone, []).length, 2);
eq('nothing from the server, the device copy stands', mergeScoped(PK, phone, undefined), phone);
eq('nothing on the device, the server copy is taken', mergeScoped(PK, null, tv), tv);
eq('Continue watching keeps at most 30', mergeScoped(PK, Array.from({ length: 25 }, (_, i) => ({ mediaId: i, timestamp: i })), Array.from({ length: 25 }, (_, i) => ({ mediaId: 100 + i, timestamp: 100 + i }))).length, 30);
const LK = `sahrae_my_list_${U}_p`;
eq('My List keeps this device\'s order, then the other\'s additions', mergeScoped(LK, [{ id: 5 }, { id: 6 }], [{ id: 7 }, { id: 5 }]).map((x) => x.id), [5, 6, 7]);

console.log('\nwhere a title resumes');
eq('a film left at 41 minutes', resumePoint({ mediaType: 'movie', position: 2460, duration: 7200, server: 'vidlink' }), { server: 'vidlink', at: 2460 });
eq('the same episode resumes', resumePoint({ mediaType: 'tv', season: 2, episode: 5, position: 900, duration: 2700 }, 2, 5).at, 900);
eq('another episode starts at the beginning (on the same server)', resumePoint({ mediaType: 'tv', season: 2, episode: 5, position: 900, duration: 2700, server: 'vidzee' }, 2, 6), { server: 'vidzee', at: 0 });
eq('the first half-minute is not worth resuming', resumePoint({ mediaType: 'movie', position: 20, duration: 7200 }).at, 0);
eq('nor the closing credits', resumePoint({ mediaType: 'movie', position: 7150, duration: 7200 }).at, 0);
eq('no position known, start at the beginning', resumePoint({ mediaType: 'movie', server: 'vidrock' }), { server: 'vidrock', at: 0 });
eq('nothing saved', resumePoint(undefined), { at: 0 });
eq('time left', [timeLeft(2460, 7200), timeLeft(600, 1500), timeLeft(0, 100), timeLeft(100, 0)], ['1h 19m left', '15 min left', null, null]);

console.log('\nopening at the minute');
eq('VidLink gets startAt after its own query', withStartAt('https://vidlink.pro/movie/1?primaryColor=f59e0b', 'vidlink', 2460.7), 'https://vidlink.pro/movie/1?primaryColor=f59e0b&startAt=2460');
eq('VidFast too', withStartAt('https://vidfast.vc/movie/1?autoPlay=true', 'vidfast', 90), 'https://vidfast.vc/movie/1?autoPlay=true&startAt=90');
eq('a server that does not take one is left alone', withStartAt('https://www.2embed.cc/embedtv/1396&s=1&e=1', '2embed', 90), 'https://www.2embed.cc/embedtv/1396&s=1&e=1');
eq('no time, no parameter', withStartAt('https://vidlink.pro/movie/1?x=1', 'vidlink', 0), 'https://vidlink.pro/movie/1?x=1');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
