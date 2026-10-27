/**
 * Live Sports schedule from ppv.st (src/services/sportsFeed.ts), after
 * Streamed closed on 2026-10-26.
 *
 * Run: node --experimental-strip-types sportsfeed-check.mjs
 */
import { ppvCategory, ppvTeams, ppvToEvent } from './src/services/sportsFeed.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

console.log('\nsports');
eq('Football is football', ppvCategory('Football'), 'football');
eq('American Football is the NFL tab', ppvCategory('American Football'), 'american-football');
eq('Ice Hockey', ppvCategory('Ice Hockey'), 'hockey');
eq('Wrestling goes with combat', ppvCategory('Wrestling'), 'fight');
eq('Australian Football goes with rugby', ppvCategory('Australian Football'), 'rugby');
eq('24/7 Streams (cartoons, shows) are dropped', ppvCategory('24/7 Streams'), null);

console.log('\nteams');
eq('"Sassuolo vs. Lazio"', ppvTeams('Sassuolo vs. Lazio'), { home: { name: 'Sassuolo' }, away: { name: 'Lazio' } });
eq('"Brooklyn Nets vs Boston Celtics"', ppvTeams('Brooklyn Nets vs Boston Celtics'), { home: { name: 'Brooklyn Nets' }, away: { name: 'Boston Celtics' } });
eq('a channel has no teams', ppvTeams('NFL Network'), null);

console.log('\nevents');
const now = 1793120000;
const match = { id: 31146, name: 'Sassuolo vs. Lazio', tag: 'Serie A', poster: 'https://static.ppvservices.st/a.jpg', starts_at: now - 600, ends_at: now + 6000, always_live: 0, iframe: 'https://taifood-blog.asia/embed/seriea/x', viewers: '2310' };
const e = ppvToEvent(match, 'football', now);
eq('id', e.id, 'ppv-31146');
eq('kick-off in ms', e.date, (now - 600) * 1000);
eq('live between start and end', e.live, true);
eq('league from the tag', e.league, 'Serie A');
eq('one feed: the player page', e.embeds, ['https://taifood-blog.asia/embed/seriea/x']);
eq('popular with 500+ viewers', e.popular, true);
eq('not live before kick-off', ppvToEvent({ ...match, starts_at: now + 3600, ends_at: now + 9000 }, 'football', now).live, false);
const ch = ppvToEvent({ ...match, name: 'NFL Network', tag: '24/7 channel', starts_at: 0, ends_at: 0, always_live: 1 }, 'american-football', now);
eq('a 24/7 channel is always live, with no kick-off', [ch.live, ch.date], [true, 0]);
eq('no player link: not listed', ppvToEvent({ ...match, iframe: '' }, 'football', now), null);
eq('a non-https player link: not listed', ppvToEvent({ ...match, iframe: 'http://x.test/e' }, 'football', now), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
