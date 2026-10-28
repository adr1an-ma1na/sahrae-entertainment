/**
 * Songs only (src/services/musicFilter.ts): what YouTube files under Music but
 * is not a song stays out of Sauti.
 *
 * Run: node --experimental-strip-types musicfilter-check.mjs
 */
import { isMusicTrack } from './src/services/musicFilter.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
const s = (title, artist = 'Artist', duration = 210) => ({ id: 'x', title, artist, duration });

console.log('\nsongs pass');
eq('an official video', isMusicTrack(s('Burna Boy - Last Last [Official Music Video]', 'Burna Boy')), true);
eq('a lyric video', isMusicTrack(s('Ayra Starr - Rush (Lyrics)', 'Ayra Starr')), true);
eq('a live performance of a song', isMusicTrack(s('Sauti Sol - Suzanna (Live at Koroga)', 'Sauti Sol', 260)), true);
eq('a remix and a cover are still songs', [isMusicTrack(s('Calm Down (Remix) ft. Selena Gomez')), isMusicTrack(s('Essence - Acoustic Cover'))], [true, true]);
eq('a song with a word a video might use (Good News)', isMusicTrack(s('Mac Miller - Good News', 'Mac Miller')), true);
eq('a song on a label channel named TV', isMusicTrack(s('Diamond Platnumz - Komasava', 'Wasafi TV')), true);
eq('no length known yet, judged on its name', isMusicTrack({ id: 'x', title: 'Tems - Free Mind', artist: 'Tems' }), true);

console.log('\neverything else stays out');
eq('a chart compilation', isMusicTrack(s('Top 40 Songs This Week', 'MUSIC CHARTS', 397)), false);
eq('a year-end best-of', isMusicTrack(s('Best Songs of 2026 (Afrobeats)')), false);
eq('songs of the week', isMusicTrack(s('Hits of the Week | Kenya')), false);
eq('a reaction video', isMusicTrack(s('American Reacts to Burna Boy')), false);
eq('an interview', isMusicTrack(s('Bien on his new album | Interview', 'Kiss FM', 540)), false);
eq('a podcast episode', isMusicTrack(s('The Joe Budden Podcast Episode 750', 'Joe Budden', 590)), false);
eq('news', isMusicTrack(s('Artist arrested at airport', 'Citizen TV News')), false);
eq('a trailer', isMusicTrack(s('Black Panther Official Trailer', 'Marvel')), false);
eq('a slowed and reverb edit', isMusicTrack(s('Calm Down (slowed + reverb)')), false);
eq('a Short', isMusicTrack(s('New song soon #shorts', 'Artist', 45)), false);
eq('anything under a minute', isMusicTrack(s('Intro', 'Artist', 40)), false);
eq('an hour-long mix', isMusicTrack(s('Amapiano Mix 2026', 'DJ Set', 3600)), false);
eq('a channel that reacts or reports', [isMusicTrack(s('Burna Boy - Last Last', 'Music Reacts')), isMusicTrack(s('Song', 'Afro Charts'))], [false, false]);
eq('hashtag promotion', isMusicTrack(s('#Bien #Kenya #NewMusic')), false);
eq('nothing at all', [isMusicTrack(null), isMusicTrack({ title: 'no id' })], [false, false]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
