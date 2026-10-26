/**
 * Which players load inside the Ad Shield sandbox on the web
 * (src/services/adShield.ts).
 *
 * Checked by hand on 2026-10-25: every Live Sports feed (embed.st) and three
 * of the four film servers refuse to play sandboxed and show a "remove the
 * sandbox" screen instead. With the shield on by default they never played on
 * the web. They now load without the sandbox; VidZee keeps it.
 *
 * Run: node --experimental-strip-types sandbox-check.mjs
 */
import fs from 'node:fs';
import { refusesSandbox, playerSandbox, SHIELD_SANDBOX, playerReferrer } from './src/services/adShield.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${got}\n         want ${want}`); }
};

console.log('\nplayers that refuse the sandbox load without it');
eq('a Live Sports feed', playerSandbox(true, 'https://embed.st/embed/admin/ppv-x/1'), undefined);
eq('VidRock', playerSandbox(true, 'https://vidrock.to/embed/movie/693134'), undefined);
eq('Viduki', playerSandbox(true, 'https://vidsrc.wtf/api/1/movie/?id=693134'), undefined);
eq('VidLink Pro', playerSandbox(true, 'https://vidlink.pro/movie/693134?primaryColor=f59e0b'), undefined);

console.log('\nthe rest keep the shield when it is on');
eq('VidZee is sandboxed', playerSandbox(true, 'https://player.vidzee.wtf/embed/movie/693134'), SHIELD_SANDBOX);
eq('...and not when the viewer turned it off', playerSandbox(false, 'https://player.vidzee.wtf/embed/movie/693134'), undefined);
eq('a look-alike host is not exempt', refusesSandbox('https://embed.st.evil.example/x'), false);
eq('a sub-domain of an exempt host is', refusesSandbox('https://cdn.vidlink.pro/x'), true);
eq('junk is not exempt', refusesSandbox('not a url'), false);

console.log('\nevery film server is accounted for');
const pool = JSON.parse(fs.readFileSync('src/data/servers.json', 'utf8'));
const sandboxed = pool.servers.filter((s) => !refusesSandbox(s.movie.replace('{id}', '1'))).map((s) => s.id).join(',');
eq('with the shield on, the web offers VidZee, AutoEmbed and VidSrc.pm (update this when the pool changes)', sandboxed, 'vidzee,autoembed,vidsrcpm');
eq('VixSrc', playerSandbox(true, 'https://vixsrc.to/tv/226174/1/1?lang=en'), undefined);

console.log('\nreferrer: only to players that refuse to play without it');
eq('VixSrc gets the site origin', playerReferrer('https://vixsrc.to/movie/1?lang=en'), 'origin');
eq('the others get none', playerReferrer('https://player.vidzee.wtf/embed/movie/1'), 'no-referrer');
eq('junk gets none', playerReferrer('nope'), 'no-referrer');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
