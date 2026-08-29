/**
 * VideoCard formatter tests.
 *
 * View counts and relative dates are the two bits of a video row people read
 * without thinking, and both are easy to get subtly wrong — "1.0M views",
 * "1 months ago", a runtime that drops the hour. Pure functions, so they get
 * checked directly.
 *
 * Run: node --experimental-strip-types video-check.mjs
 */
import { compactViews, timeAgo, runtime } from './src/components/ui/videoFormat.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

console.log('\ncompactViews');
ok('under a thousand is exact', compactViews(742) === '742 views');
ok('zero is shown, not hidden', compactViews(0) === '0 views');
ok('one thousand', compactViews(1000) === '1K views');
ok('keeps a decimal under 10K', compactViews(1200) === '1.2K views');
ok('drops a trailing .0', compactViews(2000) === '2K views');
ok('no decimal past 10K', compactViews(45_800) === '46K views');
ok('millions', compactViews(1_200_000) === '1.2M views');
ok('no decimal past 10M', compactViews(23_400_000) === '23M views');
ok('billions', compactViews(1_250_000_000) === '1.3B views');
ok('undefined renders as nothing rather than NaN', compactViews(undefined) === '');

console.log('\ntimeAgo');
const ago = (s) => Date.now() - s * 1000;
ok('just now', timeAgo(ago(5)) === 'just now');
ok('minutes', timeAgo(ago(300)) === '5 minutes ago');
ok('singular minute has no s', timeAgo(ago(70)) === '1 minute ago');
ok('hours', timeAgo(ago(7200)) === '2 hours ago');
ok('days', timeAgo(ago(86_400 * 3)) === '3 days ago');
ok('weeks', timeAgo(ago(604_800 * 2)) === '2 weeks ago');
ok('months', timeAgo(ago(2_592_000 * 5)) === '5 months ago');
ok('singular month has no s', timeAgo(ago(2_592_000)) === '1 month ago');
ok('years', timeAgo(ago(31_536_000 * 2)) === '2 years ago');
ok('undefined renders as nothing', timeAgo(undefined) === '');
ok('a future date does not go negative', timeAgo(Date.now() + 60_000) === 'just now');

console.log('\nruntime');
ok('under a minute keeps a leading zero', runtime(45) === '0:45');
ok('minutes and seconds', runtime(253) === '4:13');
ok('pads seconds', runtime(305) === '5:05');
ok('adds the hour when there is one', runtime(3730) === '1:02:10');
ok('pads minutes inside an hour', runtime(3605) === '1:00:05');
ok('long stream', runtime(12_069) === '3:21:09');
ok('zero renders as nothing, not 0:00', runtime(0) === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
