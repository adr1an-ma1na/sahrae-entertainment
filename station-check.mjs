// node --experimental-strip-types station-check.mjs
// Up next and the stations (services/stationCore.ts): gather, score, order, learn,
// as Spotify's radio does (owner, 2026-11-19).
import { scoreCandidates, sequence, rankStation, leadOnly, afterSkip, wasSkipped } from './src/services/stationCore.ts';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};
const still = () => 0; // no chance: the same answer every run
let n = 1;
const T = (title, artist, artistId, rank = 200000) => ({ id: n++, title, artist, artistId, duration: 200, rank });

console.log('\ngather and score');
const radio = [T('Love Nwantiti', 'CKay', 2), T('Calm Down', 'Rema', 3), T('Soso', 'Omah Lay', 4), T('Essence', 'Wizkid', 5)];
const near = [T('Calm Down', 'Rema', 3), T('Rush', 'Ayra Starr', 6)];
const related = [T('Peru', 'Fireboy DML', 7), T('Calm Down (Remix)', 'Rema', 3), T('Joha', 'Asake', 8)];
const s = scoreCandidates({ seedArtistId: 1, sources: [{ source: 'radio', tracks: radio }, { source: 'near', tracks: near }, { source: 'related', tracks: related }], count: 10, rng: still });
eq('each song once, however many sources have it', s.filter((x) => x.t.title === 'Calm Down').length, 1);
eq('sources agreeing make a song closer', s[0].t.title, 'Calm Down');
eq('no remixes or other versions', s.some((x) => /remix/i.test(x.t.title)), false);
const taste = scoreCandidates({ seedArtistId: 1, sources: [{ source: 'related', tracks: [T('Peru', 'Fireboy DML', 7), T('Joha', 'Asake', 8)] }], taste: new Map([['asake', 12]]), count: 5, rng: still });
eq('the listener\'s artists first among equals', taste[0].t.artist, 'Asake');
const skipped = scoreCandidates({ seedArtistId: 1, sources: [{ source: 'radio', tracks: [T('Soso', 'Omah Lay', 4), T('Rush', 'Ayra Starr', 6)] }], skips: new Map([['omahlay', 2]]), count: 5, rng: still });
eq('an artist they skip goes lower', skipped[0].t.artist, 'Ayra Starr');
eq('"Not interested" is out', scoreCandidates({ seedArtistId: 1, sources: [{ source: 'radio', tracks: radio }], banned: new Set(['ckay']), count: 9, rng: still }).some((x) => x.t.artist === 'CKay'), false);
eq('nothing just played or queued', scoreCandidates({ seedArtistId: 1, sources: [{ source: 'radio', tracks: radio }], avoid: new Set(['essence']), count: 9, rng: still }).some((x) => x.t.title === 'Essence'), false);

console.log('\nthe order');
const many = [];
for (let a = 0; a < 6; a++) for (let k = 0; k < 6; k++) many.push(T(`Song ${a}-${k}`, `Artist ${a}`, 100 + a, 900000 - a * 1000 - k));
const order = rankStation({ seedArtistId: 100, sources: [{ source: 'radio', tracks: many }], count: 20, rng: still });
eq('twenty songs', order.length, 20);
eq('never one artist twice running', order.every((t, i) => i === 0 || t.artistId !== order[i - 1].artistId), true);
eq('nor twice in any four', order.every((t, i) => !order.slice(Math.max(0, i - 3), i).some((x) => x.artistId === t.artistId)), true);
const counts = order.reduce((m, t) => m.set(t.artistId, (m.get(t.artistId) || 0) + 1), new Map());
eq('a few each at most', Math.max(...counts.values()) <= 4, true);
eq('after a song you chose, someone else first', rankStation({ seedArtistId: 100, sources: [{ source: 'radio', tracks: many }], count: 5, justHeard: [100], rng: still })[0].artistId !== 100, true);
eq('one artist only: still plays, not empty', sequence(scoreCandidates({ seedArtistId: 9, sources: [{ source: 'own', tracks: [T('A', 'Solo', 9), T('B', 'Solo', 9), T('C', 'Solo', 9)] }], count: 3, rng: still }), 3, 9).length, 3);

console.log('\nan artist\'s own songs');
const tops = [T('Dai Dai', 'Shakira', 50), T('COMO UN BEBE', 'J Balvin', 51), T('Last Last', 'Burna Boy', 1), T('Ye', 'Burna Boy', 1), T('On the Low', 'Burna Boy', 1), T('City Boys', 'Burna Boy', 1)];
eq('features on others\' songs are theirs, not Burna Boy\'s', leadOnly(tops, 1).map((t) => t.artist), ['Burna Boy', 'Burna Boy', 'Burna Boy', 'Burna Boy']);
eq('too few of their own: all kept', leadOnly(tops.slice(0, 3), 1).length, 3);

console.log('\nlearning from skips');
const up = [{ artist: 'Omah Lay', via: 'radio', id: 'a' }, { artist: 'Rema', via: 'radio', id: 'b' }, { artist: 'Omah Lay', id: 'c' }, { artist: 'Omah Lay', via: 'radio', id: 'd' }];
eq('one quick skip: their station songs later', afterSkip(up, 'Omah Lay', 1).map((t) => t.id), ['b', 'c', 'a', 'd']);
eq('two: out of this station', afterSkip(up, 'Omah Lay', 2).map((t) => t.id), ['b', 'c']);
eq('a song they queued themselves stays', afterSkip(up, 'Omah Lay', 2).some((t) => t.id === 'c'), true);
eq('a quick skip is 3 to 30 seconds', [wasSkipped(10, 200), wasSkipped(2, 200), wasSkipped(45, 200), wasSkipped(40, 60)], [true, false, false, false]);

console.log('\nwired in');
const um = readFileSync('src/hooks/useMusic.tsx', 'utf8');
const mv = readFileSync('src/components/MusicView.tsx', 'utf8');
eq('stations know the listener and are marked as stations', um.includes('upNext(c, avoid, 25, stationCtx())') && um.includes("via: 'radio' as const"), true);
eq('a skip reorders what is to come', um.includes('afterSkip(prev.slice(at + 1), skippedArtist, times)'), true);
eq('a song from search plays as its radio', mv.includes('onPlay={() => startRadio(rSongs[i])}'), true);
eq('songs switch inside the loaded player, reloading only if that fails', um.includes("cmd('loadVideoById', [{ videoId: id") && um.includes("sessionStorage.setItem('sahrae.yt.inplace', '0')"), true);
eq('the player is warmed when Music opens; songs matched before the tap', mv.includes('window.setTimeout(warmPlayer, 600)') && mv.includes('onPointerEnter={() => prime(track)}'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
