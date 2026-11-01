/**
 * Live Sports schedule from ppv.st (src/services/sportsFeed.ts), after
 * Streamed closed on 2026-10-26.
 *
 * Run: node --experimental-strip-types sportsfeed-check.mjs
 */
import { ppvCategory, ppvTeams, ppvToEvent, sfToEvent, timToEvent, timTeams, atTeams } from './src/services/sportsFeed.ts';
import { sameTeam, sameMatch, mergeEvents, newYorkTime } from './src/services/sportsMerge.ts';

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

console.log('\nthe same team, spelt by another source');
eq('"Man City" is Manchester City', sameTeam('Man City', 'Manchester City'), true);
eq('"Hamburg SV" is "Hamburger SV"', sameTeam('Hamburg SV', 'Hamburger SV'), true);
eq('"Inter Miami CF" is "Inter Miami"', sameTeam('Inter Miami CF', 'Inter Miami'), true);
eq('"Ravens" is the Baltimore Ravens', sameTeam('Ravens', 'Baltimore Ravens'), true);
eq('Lazio is not Lecce', sameTeam('Lazio', 'Lecce'), false);
eq('Real Madrid is not Real Sociedad', sameTeam('Real Madrid', 'Real Sociedad'), false);

console.log('\nthe same match from two sources');
const T0 = Date.UTC(2026, 10, 1, 14, 0);
const ev = (id, home, away, date, category = 'football', feeds = []) => ({ id, title: home + ' vs ' + away, category, date, teams: { home: { name: home }, away: { name: away } }, feeds, embeds: feeds.map((f) => f.url) });
eq('either order: "Lazio vs Cagliari" and "Cagliari @ Lazio"', sameMatch(ev('a', 'Lazio', 'Cagliari', T0), ev('b', 'Cagliari', 'Lazio', T0)), true);
eq('an hour apart: still the same', sameMatch(ev('a', 'Lazio', 'Cagliari', T0), ev('b', 'Lazio', 'Cagliari', T0 + 3600_000)), true);
eq('a day apart: a different match (the return leg)', sameMatch(ev('a', 'Lazio', 'Cagliari', T0), ev('b', 'Lazio', 'Cagliari', T0 + 86_400_000)), false);
eq('only one team in common: different matches', sameMatch(ev('a', 'Lazio', 'Cagliari', T0), ev('b', 'Lazio', 'Genoa', T0)), false);
eq('never across sports: New York Jets are not Winnipeg Jets', sameMatch(ev('a', 'Raiders', 'Jets', T0, 'american-football'), ev('b', 'Raiders', 'Winnipeg Jets', T0, 'hockey')), false);

console.log('\nmerged: every feed of the match, best first');
const m = mergeEvents(
  [ev('ppv-1', 'Lazio', 'Cagliari', T0, 'football', [{ url: 'https://p.test/1', label: 'PPV', rank: 1 }])],
  [ev('sf-1', 'Cagliari', 'Lazio', T0, 'football', [{ url: 'https://s.test/1080p', label: 'Full HD', hd: true, rank: 0 }, { url: 'https://s.test/540p', label: 'SD backup', rank: 3 }]),
   ev('sf-2', 'Genoa', 'Lecce', T0, 'football', [{ url: 'https://s.test/g', label: 'Full HD', rank: 0 }])],
);
eq('one match per game, the new game added', m.map((e) => e.id), ['ppv-1', 'sf-2']);
eq('Full HD first, then PPV, the SD backup last', m[0].embeds, ['https://s.test/1080p', 'https://p.test/1', 'https://s.test/540p']);
eq('the same address is not offered twice', mergeEvents(m, [ev('x', 'Lazio', 'Cagliari', T0, 'football', [{ url: 'https://p.test/1', label: 'PPV', rank: 1 }])])[0].embeds.length, 3);

console.log('\nStreamFree and Tim Streams');
const sf = sfToEvent({ stream_key: 'cagliari-vs-lazio', name: 'Cagliari vs Lazio', category: 'soccer', league: 'Serie A', match_timestamp: T0 / 1000, team1: { name: 'Cagliari', logo: 'https://a.espncdn.com/c.png' }, team2: { name: 'Lazio' } }, T0 + 60_000);
eq('StreamFree: its 1080p and 540p players', sf.embeds, ['https://strmfree.st/embed/soccer/cagliari-vs-lazio1080p', 'https://strmfree.st/embed/soccer/cagliari-vs-lazio540p']);
eq('StreamFree: soccer is football, live a minute in, crest kept', [sf.category, sf.live, sf.teams.home.badge], ['football', true, 'https://a.espncdn.com/c.png']);
eq('StreamFree: an odd key is not turned into an address', sfToEvent({ stream_key: '../x', name: 'X', category: 'soccer', match_timestamp: 1 }, T0), null);
eq('Tim: "Cagliari @ Lazio" is Lazio at home', timTeams('Cagliari @ Lazio'), { home: { name: 'Lazio' }, away: { name: 'Cagliari' } });
eq('ppv: "Ravens at Bills" is Buffalo at home', atTeams('Baltimore Ravens at Buffalo Bills'), { home: { name: 'Buffalo Bills' }, away: { name: 'Baltimore Ravens' } });
eq('Tim: 09:00 in New York on 1 Nov 2026 (EST) is 14:00 UTC', new Date(newYorkTime('2026-11-01T09:00')).toISOString(), '2026-11-01T14:00:00.000Z');
eq('Tim: 09:00 in New York on 1 Jul 2026 (EDT) is 13:00 UTC', new Date(newYorkTime('2026-07-01T09:00')).toISOString(), '2026-07-01T13:00:00.000Z');
const tim = timToEvent({ url: 'cagliari-v-lazio-1', name: 'Cagliari @ Lazio', genre: 1, time: '2026-11-01T09:00', streams: [{ name: 'DAZN1 Italia', url: 'https://e.test/a' }, { name: 'VIP', url: 'https://e.test/v', vip: true }] }, T0);
eq('Tim: the channel is the feed name, VIP-only feeds left out', tim.feeds.map((f) => f.label), ['DAZN1 Italia']);
eq('Tim: live shows are not sport', timToEvent({ url: 'x', name: 'Show', genre: 17, time: '2026-11-01T09:00', streams: [{ name: 'a', url: 'https://e.test/a' }] }, T0), null);
eq('all three pair up as one match', mergeEvents(mergeEvents([ev('ppv-1', 'Lazio', 'Cagliari', T0, 'football', [{ url: 'https://p.test/1', label: 'PPV', rank: 1 }])], [sf]), [tim]).length, 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
