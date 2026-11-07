/**
 * Sauti search ranking (src/services/musicSearch.ts). The follower counts are
 * the catalogue's own, taken from its answers to these searches.
 *
 * Run: node --experimental-strip-types search-check.mjs
 */
import { nameMatch, rankArtists, artistLeads } from './src/services/searchRank.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
const a = (id, name, fans) => ({ id, name, fans });

console.log('\nhow well a name answers a search');
eq('the name itself', nameMatch('sauti sol', 'Sauti Sol'), 1.3);
eq('spacing aside', nameMatch('ali kiba', 'Alikiba'), 1.3);
eq('the start of the name', nameMatch('burna', 'Burna Boy'), 1.15);
eq('one of its words', nameMatch('diamond', 'Neil Diamond'), 1);
eq('accents aside', nameMatch('beyonce', 'Beyoncé'), 1.3);
eq('not in the name', nameMatch('sauti sol', 'Santigold'), 0.3);

console.log('\nartists, best first');
// "burna": the catalogue lists Burna (44 fans) before Burna Boy.
const burna = [a(1, 'Burna', 44), a(2, 'Burna Boy', 1086216), a(3, 'No Limit', 30252), a(4, 'Burna Bandz', 1344)];
eq('burna: Burna Boy first', rankArtists('burna', burna)[0].name, 'Burna Boy');
eq('burna: Burna Boy leads the results', artistLeads('burna', rankArtists('burna', burna)[0]), true);

// "diamond": an exact but little-known "Diamond" against Diamond Platnumz and Neil Diamond.
const diamond = [a(10, 'Diamond & The Psychotic Neurotics', 261), a(11, 'Diamond', 6007), a(12, 'Neil Diamond', 386447), a(13, 'Diamond Platnumz', 181680), a(14, 'Diamond*', 50)];
eq('diamond: Diamond Platnumz first', rankArtists('diamond', diamond)[0].name, 'Diamond Platnumz');
const own = new Set(['neil diamond']);
eq('the listener\'s own artist comes first', rankArtists('diamond', diamond, own)[0].name, 'Neil Diamond');
eq('the same name twice is listed once', rankArtists('diamond', [...diamond, a(15, 'Diamond Platnumz', 100)]).filter((x) => x.name === 'Diamond Platnumz').length, 1);

// "sauti sol": exact name.
const sauti = [a(20, 'Sauti Sol', 103965), a(21, 'Santigold', 94463), a(22, 'Samí Sól', 3)];
eq('sauti sol: Sauti Sol first', rankArtists('sauti sol', sauti)[0].name, 'Sauti Sol');
eq('a lookalike name never leads', rankArtists('sauti sol', sauti)[1].name, 'Santigold');

// "calm down" is a song: no artist should take the top result.
const calm = [a(30, 'Calmdown', 210), a(31, 'Calm Down Music Club', 23), a(32, 'KENZY DONA', 3144)];
eq('calm down: a song leads, not an artist', artistLeads('calm down', rankArtists('calm down', calm)[0]), false);
eq('nothing found, nothing leads', artistLeads('x', undefined), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
