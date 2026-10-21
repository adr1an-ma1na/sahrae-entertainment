/**
 * Matchday (src/services/matchdayCore.ts): odds to probabilities, ESPN events
 * to fixtures, and finding each fixture's live stream in the sports feed.
 *
 * Run: node --experimental-strip-types matchday-check.mjs
 */
import { americanToDecimal, devig, percentages, parseEvent, findStream, teamSimilarity, dayToken, COMPETITIONS } from './src/services/matchdayCore.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
const r3 = (x) => Math.round(x * 1000) / 1000;

console.log('\nodds');
eq('+340 is 4.40', americanToDecimal('+340'), 4.4);
eq('-140 is 1.714', r3(americanToDecimal('-140')), 1.714);
eq('EVEN is 2.00', americanToDecimal('EVEN'), 2);
eq('junk is not odds', [americanToDecimal(''), americanToDecimal('abc'), americanToDecimal(null), americanToDecimal('+50')], [null, null, null, null]);
const p = devig(4.4, 4.1, 1 + 100 / 140);
eq('probabilities sum to 1', r3(p.pHome + p.pDraw + p.pAway), 1);
eq('the favourite is the most likely', p.pAway > p.pHome && p.pAway > p.pDraw, true);
eq('the margin is what the prices overshoot by', r3(p.margin), r3(1 / 4.4 + 1 / 4.1 + 1 / (1 + 100 / 140) - 1));
eq('impossible prices give nothing', devig(1, 3, 3), null);
eq('percentages add up to exactly 100', percentages([0.2153, 0.2311, 0.5536]).reduce((a, b) => a + b, 0), 100);
eq('...and round as expected', percentages([0.2153, 0.2311, 0.5536]), [22, 23, 55]);

console.log('\nESPN events');
const epl = COMPETITIONS[0];
const ev = {
  id: '401879256', date: '2026-10-24T11:30Z', name: 'Manchester City at Aston Villa',
  status: { displayClock: "0'", type: { state: 'pre', shortDetail: 'Scheduled' } },
  competitions: [{
    venue: { fullName: 'Villa Park' },
    competitors: [
      { homeAway: 'home', score: '0', form: 'DWDWW', team: { displayName: 'Aston Villa', shortDisplayName: 'Aston Villa', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/362.png' } },
      { homeAway: 'away', score: '0', form: 'DWLWW', team: { displayName: 'Manchester City', shortDisplayName: 'Man City' } },
    ],
    odds: [{ provider: { name: 'DraftKings' }, moneyline: { home: { close: { odds: '+340' } }, away: { close: { odds: '-140' } }, draw: { close: { odds: '+310' } } } }],
  }],
};
const fx = parseEvent(ev, epl);
eq('teams, venue and kick-off', [fx.home.name, fx.away.short, fx.venue, new Date(fx.date).toISOString()], ['Aston Villa', 'Man City', 'Villa Park', '2026-10-24T11:30:00.000Z']);
eq('odds read from the closing moneyline', [fx.odds.home, r3(fx.odds.away), fx.odds.draw, fx.odds.provider], [4.4, 1.714, 4.1, 'DraftKings']);
eq('a live match shows its clock', parseEvent({ ...ev, status: { displayClock: "63'", type: { state: 'in', shortDetail: "63'" } } }, epl).status, "63'");
eq('half time stays half time', parseEvent({ ...ev, status: { displayClock: "45'", type: { state: 'in', shortDetail: 'Halftime' } } }, epl).status, 'Halftime');
eq('a finished match is FT', parseEvent({ ...ev, status: { type: { state: 'post', shortDetail: 'FT' } } }, epl).status, 'FT');
eq('no odds, no probabilities', parseEvent({ ...ev, competitions: [{ ...ev.competitions[0], odds: [] }] }, epl).odds, undefined);
eq('an event without a date is dropped', parseEvent({ ...ev, date: 'soon' }, epl), null);
eq('ESPN day tokens are UTC', dayToken(Date.parse('2026-10-24T23:30:00Z')), '20261024');

console.log('\nfinding the stream');
eq('Man City is Manchester City', teamSimilarity('Man City', 'Manchester City'), 1);
eq('Bayer Leverkusen is Leverkusen', teamSimilarity('Bayer Leverkusen', 'Leverkusen'), 1);
eq('Atlético Madrid is Atletico Madrid', teamSimilarity('Atlético Madrid', 'Atletico Madrid'), 1);
eq('Manchester United is not Manchester City', teamSimilarity('Manchester United', 'Manchester City') < 1, true);
const t0 = Date.parse('2026-10-24T11:30:00Z');
const feed = [
  { id: 'a', title: 'Aston Villa vs Manchester United', category: 'football', date: t0, teams: { home: { name: 'Aston Villa' }, away: { name: 'Manchester United' } } },
  { id: 'b', title: 'Aston Villa vs Man City', category: 'football', date: t0 + 15 * 60000, teams: { home: { name: 'Aston Villa' }, away: { name: 'Man City' } } },
  { id: 'c', title: 'Aston Villa vs Manchester City', category: 'football', date: t0 + 30 * 86400000, teams: { home: { name: 'Aston Villa' }, away: { name: 'Manchester City' } } },
];
eq('the right match, not a namesake or a later meeting', findStream(fx, feed)?.id, 'b');
eq('home and away swapped still matches', findStream(fx, [{ id: 'd', title: 'Man City vs Aston Villa', category: 'football', date: t0, teams: { home: { name: 'Man City' }, away: { name: 'Aston Villa' } } }])?.id, 'd');
eq('a title without team fields still matches', findStream(fx, [{ id: 'e', title: 'Aston Villa - Manchester City', category: 'football', date: t0, teams: null }])?.id, 'e');
eq('nothing similar, nothing found', findStream(fx, [{ id: 'f', title: 'Lakers vs Celtics', category: 'basketball', date: t0 }]), null);
const race = parseEvent({ id: '9', date: '2026-10-25T19:00Z', name: 'MSC Cruises United States Grand Prix', status: { type: { state: 'pre', shortDetail: 'Scheduled' } }, competitions: [{}] }, COMPETITIONS.find((c) => c.code === 'f1'));
eq('an F1 race finds its F1 listing', findStream(race, [
  { id: 'm', title: 'MotoGP: Malaysian GP', category: 'motor-sports', date: race.date },
  { id: 'g', title: 'F1: United States Grand Prix', category: 'motor-sports', date: race.date + 600000 },
])?.id, 'g');

console.log('\nreminders');
const { buildIcs, LEAD_MS } = await import('./src/services/reminders.ts');
const ics = buildIcs('eng.1:401879256', 'Aston Villa v Man City, Matchday 9', Date.parse('2026-10-24T11:30:00Z'), 'Villa Park');
eq('a calendar entry at kick-off', /DTSTART:20261024T113000Z/.test(ics), true);
eq('with an alert 15 minutes before', ics.includes('TRIGGER:-PT15M') && LEAD_MS === 900000, true);
eq('commas in text are escaped, and lines end CRLF as the format requires', ics.includes('SUMMARY:Aston Villa v Man City\\, Matchday 9') && ics.includes('\r\n'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
