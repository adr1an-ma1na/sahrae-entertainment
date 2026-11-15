// node --experimental-strip-types notify-check.mjs
// What the bell tells a viewer about: learned from the matches they open and
// the series they watch (src/services/notifyCore.ts).
import { readFileSync } from 'node:fs';
import {
  followsFrom, followFor, seriesOf, sportNotes, episodeNotes, filmNotes, pickNote, mergeNotes, deviceId, localDay,
  LEAD_MS, LIST_AHEAD_MS, SPORT_HALF_LIFE_MS,
} from './src/services/notifyCore.ts';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};

const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime();
const H = 3_600_000, DAY = 24 * H;
const match = (home, away, at, extra = {}) => ({ id: `${home}-${away}`, title: `${home} vs ${away}`, category: 'football', date: at, teams: { home: { name: home }, away: { name: away } }, ...extra });
const watch = (home, away, daysAgo, category = 'football') => ({ ts: NOW - daysAgo * DAY, category, title: `${home} vs ${away}`, teams: [home, away] });

console.log('\nlearning the teams');
eq('one match is not yet a team followed', followsFrom([watch('Arsenal', 'Chelsea', 1)], NOW).map((f) => f.name), []);
const twice = [watch('Arsenal', 'Chelsea', 8), watch('Tottenham Hotspur', 'Arsenal FC', 1)];
eq('the team in both matches is followed, the others are not', followsFrom(twice, NOW).map((f) => f.name), ['Arsenal FC']);
eq('...whichever spelling the source used', followFor(match('Arsenal', 'Everton', NOW + H), followsFrom(twice, NOW))?.kind, 'team');
eq('a team watched twice long ago has faded', followsFrom([watch('Arsenal', 'Chelsea', 200), watch('Arsenal', 'Spurs', 190)], NOW), []);
eq('half the weight after the half-life', +followsFrom([{ ts: NOW - SPORT_HALF_LIFE_MS, category: 'motor-sports', title: 'Formula 1: Qatar Grand Prix', teams: [] }, { ts: NOW - SPORT_HALF_LIFE_MS, category: 'motor-sports', title: 'F1 Sprint', teams: [] }], NOW)[0].weight.toFixed(2), 1);
eq('a team switched off stays off', followsFrom(twice, NOW, ['team:football:arsenal']).map((f) => f.name), []);
eq('never across sports: the Jets of another game', followFor({ ...match('Winnipeg Jets', 'Calgary Flames', NOW + H), category: 'hockey' }, followsFrom([watch('New York Jets', 'Bills', 1, 'american-football'), watch('New York Jets', 'Patriots', 2, 'american-football')], NOW)), null);

console.log('\nlearning the series (no two sides)');
const f1 = { ts: NOW - 2 * DAY, category: 'motor-sports', title: 'Formula 1: Las Vegas Grand Prix', teams: [] };
eq('Formula 1 by its name', seriesOf(f1), 'Formula 1');
eq('F1 by its short name', seriesOf({ title: 'F1 Qualifying', category: 'motor-sports' }), 'Formula 1');
eq('WWE', seriesOf({ title: 'WWE Raw', category: 'fight' }), 'WWE');
eq('UFC from the league', seriesOf({ title: 'Main card', league: 'UFC 322', category: 'fight' }), 'UFC');
eq('a race with no known series: the sport itself', seriesOf({ title: 'Supercars Adelaide', category: 'motor-sports' }), 'Motorsport');
eq('a football event without sides is not a series', seriesOf({ title: 'Goals show', category: 'football' }), null);
eq('one Grand Prix is enough to follow Formula 1', followsFrom([f1], NOW).map((f) => f.name), ['Formula 1']);
eq('the next race belongs to that follow', followFor({ id: 'x', title: 'Formula 1: Qatar Grand Prix', category: 'motor-sports', date: NOW + DAY }, followsFrom([f1], NOW))?.name, 'Formula 1');
eq('a WWE show does not', followFor({ id: 'y', title: 'WWE SmackDown', category: 'fight', date: NOW + DAY }, followsFrom([f1], NOW)), null);

console.log('\nwhich matches are announced, and when');
const follows = followsFrom([...twice, f1], NOW);
const events = [
  match('Arsenal', 'Everton', NOW + 3 * H, { league: 'Premier League' }),
  match('Leeds', 'Burnley', NOW + 2 * H),
  match('Arsenal', 'Everton', NOW + 3 * H + 60_000, { id: 'dup' }),
  { id: 'gp', title: 'Formula 1: Qatar Grand Prix', category: 'motor-sports', date: NOW + 26 * H },
  match('Arsenal', 'Wolves', NOW + 5 * DAY),
  match('Arsenal', 'Fulham', NOW - 30 * 60_000),
  match('Arsenal', 'Brighton', NOW - 5 * H),
];
const notes = sportNotes(events, follows, NOW);
eq('only the followed, each once, soonest first', notes.map((n) => n.title), ['Arsenal v Fulham is live', 'Arsenal v Everton', 'Formula 1: Qatar Grand Prix']);
eq('one already on is said at once', notes[0].at, undefined);
eq('...as live now, with why', notes[0].message, 'Live now. Because you watch Arsenal FC.');
eq('one to come: a quarter of an hour before', notes[1].at, NOW + 3 * H - LEAD_MS);
eq('...named by its day, so the note is still true tomorrow', notes[1].message.startsWith(new Date(NOW + 3 * H).toLocaleDateString([], { weekday: 'long' }) + ' at '), true);
eq('...listed in the bell from now (it starts within twelve hours)', notes[1].listAt, NOW);
eq('...and the league', notes[1].message.includes('· Premier League. Because you watch Arsenal FC.'), true);
eq('one a day away is listed twelve hours before', notes[2].listAt, NOW + 26 * H - LIST_AHEAD_MS);
eq('the note opens that match', notes[1].eventId, 'Arsenal-Everton');
eq('the same match from two sources has one id', new Set(notes.map((n) => n.id)).size, notes.length);
eq('nothing followed, nothing said', sportNotes(events, [], NOW), []);

console.log('\nseries');
const show = (o) => ({ id: 1396, name: 'Breaking Bad', posterPath: '/p.jpg', ...o });
eq('a catalogue date is local midnight', new Date(localDay('2026-11-14')).getDate(), 14);
eq('not a date: not a number', Number.isNaN(localDay('soon')), true);
eq('an episode out since the one watched', episodeNotes([show({ last: { season_number: 2, episode_number: 5, air_date: '2026-11-13' }, watched: { season: 2, episode: 4 } })], NOW).map((n) => [n.id, n.at]), [['ep_1396_2_5', undefined]]);
eq('already watched: nothing', episodeNotes([show({ last: { season_number: 2, episode_number: 5, air_date: '2026-11-13' }, watched: { season: 2, episode: 5 } })], NOW), []);
eq('out a month ago: nothing', episodeNotes([show({ last: { season_number: 2, episode_number: 5, air_date: '2026-10-10' } })], NOW), []);
const coming = episodeNotes([show({ next: { season_number: 2, episode_number: 6, air_date: '2026-11-18' } })], NOW);
eq('one that airs this week: the morning after', new Date(coming[0].at).toString().slice(0, 21), new Date(2026, 10, 19, 9).toString().slice(0, 21));
eq('one that airs next month: not yet', episodeNotes([show({ next: { season_number: 2, episode_number: 6, air_date: '2026-12-20' } })], NOW), []);
eq('on My List but not started: a new episode is still said', episodeNotes([show({ last: { season_number: 1, episode_number: 1, air_date: '2026-11-12' }, watched: null })], NOW).length, 1);

console.log('\nfilms');
eq('a saved film released last week', filmNotes([{ id: 9, title: 'Dune', releaseDate: '2026-11-10' }], NOW).map((n) => [n.title, n.at]), [['Out now: Dune', undefined]]);
eq('one released next week waits for the day', filmNotes([{ id: 9, title: 'Dune', releaseDate: '2026-11-19' }], NOW)[0].at, new Date(2026, 10, 19, 9).getTime());
eq('one released long ago: nothing', filmNotes([{ id: 9, title: 'Dune', releaseDate: '2021-10-22' }], NOW), []);
const cands = [{ id: 1, title: 'A', genreIds: [35], mediaType: 'movie' }, { id: 2, title: 'B', genreIds: [53], mediaType: 'movie' }, { id: 3, title: 'C', genreIds: [53], mediaType: 'movie' }];
const top = [{ id: 53, name: 'Thriller' }];
eq('a pick in the genre watched most', pickNote(cands, top, new Set(), 0, NOW)?.title, 'New for you: B');
eq('...says why', pickNote(cands, top, new Set(), 0, NOW)?.message, 'Trending this week. Because you watch thriller.');
eq('never one already watched or saved', pickNote(cands, top, new Set(['movie-2']), 0, NOW)?.title, 'New for you: C');
eq('not again within three days', pickNote(cands, top, new Set(), NOW - DAY, NOW), null);
eq('nothing watched yet: no pick', pickNote(cands, [], new Set(), 0, NOW), null);

console.log('\nthe list the bell shows');
const m1 = mergeNotes([], [notes[0], notes[2]], [], NOW);
eq('a note due now is added; one for later waits', m1.added.map((n) => n.id), [notes[0].id]);
const m2 = mergeNotes(m1.list, [notes[0], notes[2]], m1.seen, notes[2].listAt + 1);
eq('...and joins when its time comes', m2.added.map((n) => n.id), [notes[2].id]);
eq('newest first', m2.list.map((n) => n.id), [notes[2].id, notes[0].id]);
eq('never twice', mergeNotes(m2.list, [notes[0], notes[2]], m2.seen, notes[2].at + 2).added, []);
eq('an episode joins when it is out, not before', mergeNotes([], coming, [], NOW).added, []);
eq('a cleared note does not come back', mergeNotes([], [notes[0]], m2.seen, NOW).added, []);
eq('new notes are unread', m1.list[0].read, false);
eq('a device id is a positive whole number, the same each time', [deviceId('sport_x_20261115') > 0, deviceId('a') === deviceId('a'), Number.isInteger(deviceId('ep_1396_2_5'))], [true, true, true]);

console.log('\nno invented notifications');
const hook = readFileSync(new URL('./src/hooks/useNotifications.ts', import.meta.url), 'utf8');
eq('the welcome card is gone', /Welcome to Notifications/.test(hook), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
