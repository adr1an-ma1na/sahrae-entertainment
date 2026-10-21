/**
 * Tier 3 logic: discovery by time and mood (discoverCore.ts) and one taste
 * profile across films, music and sport (tasteProfileCore.ts).
 *
 * Run: node --experimental-strip-types discover-check.mjs
 */
import { quickPickQuery, fitsLabel, localQuery, LOCAL_ROWS, MOODS } from './src/services/discoverCore.ts';
import { screenTaste, followedCompetitions, describe, HALF_LIFE_MS } from './src/services/tasteProfileCore.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

console.log('\ntime and mood');
const q30 = quickPickQuery(30, 'light');
eq('30 minutes and light: a comedy series with short episodes', [q30.type, q30.params.with_genres, q30.params['with_runtime.lte']], ['tv', '35', '30']);
const q95 = quickPickQuery(95, 'thrilling');
eq('an hour and a half, thrilling: a thriller or action film that fits', [q95.type, q95.params.with_genres, q95.params['with_runtime.lte'], q95.params['with_runtime.gte']], ['movie', '53|28', '95', '60']);
eq('all night: long films only', [quickPickQuery(999, 'scary').params['with_runtime.gte'], quickPickQuery(999, 'scary').params['with_runtime.lte']], ['130', undefined]);
eq('only well-known, well-liked titles', [q95.params['vote_count.gte'], q95.params['vote_average.gte']], ['200', '6.5']);
eq('every mood has a film and a series genre', MOODS.every((m) => m.movie && m.tv), true);
eq('labels say what fits', [fitsLabel(30), fitsLabel(60), fitsLabel(130)], ['Episodes under 30 min', 'Episodes under an hour', 'Films under 2 hours']);

console.log('\nlocal rows');
eq('Kenya means made in Kenya', localQuery(LOCAL_ROWS.kenya.origin, 'tv').with_origin_country, 'KE');
eq('African stories leave out South Africa\'s Hollywood co-productions', LOCAL_ROWS.africa.origin.includes('ZA'), false);

console.log('\nthe taste profile');
const NOW = Date.parse('2026-10-21T12:00:00Z');
const w = (days, type, ids) => ({ timestamp: NOW - days * 86400000, mediaType: type, item: { genre_ids: ids } });
const watched = [w(0, 'tv', [80, 18]), w(1, 'tv', [80, 9648]), w(2, 'movie', [28, 53]), w(40, 'movie', [35])];
const t = screenTaste(watched, [{ id: 35 }], NOW);
eq('crime leads: watched twice this week', t[0].name, 'Crime');
eq('...and it is a series taste', t[0].type, 'tv');
const all = screenTaste(watched, [{ id: 35 }], NOW, 10);
eq('an old comedy plus an onboarding pick count less than one drama this week', all.find((g) => g.id === 35).weight < all.find((g) => g.id === 18).weight, true);
eq('a title three weeks old counts half', screenTaste([{ timestamp: NOW - HALF_LIFE_MS, mediaType: 'movie', item: { genre_ids: [99] } }], [], NOW)[0].weight, 0.5);
eq('nothing watched, onboarding still gives a start', screenTaste([], [{ id: 27 }], NOW).map((g) => g.name), ['Horror']);
eq('unknown genre ids are ignored', screenTaste([w(0, 'movie', [123456])], [], NOW), []);
eq('competitions followed, most reminders first', followedCompetitions(['eng.1:1', 'esp.1:2', 'eng.1:3', 'f1:4']), ['eng.1', 'esp.1']);
eq('described in a few words', describe({ screen: [{ name: 'Crime' }, { name: 'Drama' }], music: [{ name: 'Afrobeats' }], sports: [{ name: 'Premier League' }] }), 'Crime · Drama · Afrobeats · Premier League');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
