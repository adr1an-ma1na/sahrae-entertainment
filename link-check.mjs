/**
 * Device links (src/services/linkCore.ts): pairing codes, and the checking
 * of every message a phone, TV or watch-party guest sends. Anything that
 * arrives over a link came from another device, so nothing unknown,
 * malformed or oversized may act.
 *
 * Run: node --experimental-strip-types link-check.mjs
 */
import { makeCode, normalizeCode, validCommand, validState, validRoomMessage, CODE_ALPHABET, CODE_LENGTH } from './src/services/linkCore.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

console.log('\ncodes');
const codes = Array.from({ length: 2000 }, () => makeCode());
eq('six characters from the alphabet', codes.every((c) => c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch))), true);
eq('no look-alikes (0 O 1 I L) on a TV screen', /[0O1IL]/.test(CODE_ALPHABET), false);
eq('2,000 codes, practically no repeats', new Set(codes).size >= 1998, true);
eq('typed with spaces, dashes and lower case', normalizeCode(' k7q-2mx '), 'K7Q2MX');
eq('the wrong length is not a code', [normalizeCode('K7Q2M'), normalizeCode('K7Q2MZZ')], [null, null]);
eq('a look-alike is not a code', normalizeCode('K7Q0MZ'), null);

console.log('\nphone to TV');
eq('arrow keys pass', validCommand({ t: 'key', k: 'up' }), { t: 'key', k: 'up' });
eq('an unknown key does not', validCommand({ t: 'key', k: 'reboot' }), null);
eq('a search is trimmed', validCommand({ t: 'search', q: '  Wednesday ' }), { t: 'search', q: 'Wednesday' });
eq('an empty or oversized search is dropped', [validCommand({ t: 'search', q: '   ' }), validCommand({ t: 'search', q: 'x'.repeat(101) })], [null, null]);
eq('opening an episode', validCommand({ t: 'open', type: 'tv', id: 119051, s: 2, e: 1 }), { t: 'open', type: 'tv', id: 119051, s: 2, e: 1 });
eq('a film needs no episode', validCommand({ t: 'open', type: 'movie', id: 27205, s: 9 }), { t: 'open', type: 'movie', id: 27205 });
eq('a bad id is dropped', [validCommand({ t: 'open', type: 'movie', id: -1 }), validCommand({ t: 'open', type: 'movie', id: '27205' }), validCommand({ t: 'open', type: 'game', id: 5 })], [null, null, null]);
eq('a server choice', validCommand({ t: 'server', idx: 2 }), { t: 'server', idx: 2 });
eq('an unknown message does nothing', [validCommand({ t: 'eval', code: 'x' }), validCommand(null), validCommand('key')], [null, null, null]);

console.log('\nTV to phone');
eq('the screen state, trimmed to size', validState({ t: 'state', title: 'x'.repeat(200), type: 'tv', id: 5, s: 1, e: 2, servers: ['A', 7, 'B'], server: 1 }),
  { t: 'state', title: 'x'.repeat(120), type: 'tv', id: 5, s: 1, e: 2, servers: ['A', 'B'], server: 1 });
eq('not a state, nothing', validState({ t: 'cmd' }), null);

console.log('\nwatch together');
eq('what the room watches', validRoomMessage({ t: 'now', type: 'movie', id: 27205, server: 'vidrock', title: 'Inception' }), { t: 'now', type: 'movie', id: 27205, server: 'vidrock', title: 'Inception' });
eq('a server id that could be anything is refused', validRoomMessage({ t: 'now', type: 'movie', id: 1, server: 'https://evil', title: '' }), null);
eq('chat is trimmed, names capped', validRoomMessage({ t: 'chat', name: '  Adrian  ', text: ' goal! ', at: 5 }), { t: 'chat', name: 'Adrian', text: 'goal!', at: 5 });
eq('empty or huge chat is dropped', [validRoomMessage({ t: 'chat', name: 'A', text: '  ' }), validRoomMessage({ t: 'chat', name: 'A', text: 'x'.repeat(301) })], [null, null]);
eq('only the offered reactions', [validRoomMessage({ t: 'react', name: 'A', emoji: '🔥' })?.emoji, validRoomMessage({ t: 'react', name: 'A', emoji: '<img>' })], ['🔥', null]);
eq('a countdown only for the next half minute', [!!validRoomMessage({ t: 'countdown', at: Date.now() + 5000 }), validRoomMessage({ t: 'countdown', at: Date.now() + 3600000 })], [true, null]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
