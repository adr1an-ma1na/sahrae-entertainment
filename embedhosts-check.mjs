/**
 * Every movie/series server in PlayerModal's SERVERS must be on MainActivity's
 * EMBED_HOSTS list.
 *
 * A server missing from the native list plays in the PWA but not in the APK:
 * its player page gets rewritten (tripping the provider's anti-tamper check)
 * and its own navigations are refused. The two lists are kept by hand and have
 * drifted twice; VidFast and Videasy, the first two servers, went missing the
 * second time. This turns that drift into a failed build.
 *
 * Run: node embedhosts-check.mjs
 */
import fs from 'node:fs';

const tsx = fs.readFileSync('src/components/PlayerModal.tsx', 'utf8');
const java = fs.readFileSync('android-overlay/app/src/main/java/com/sahrae/entertainment/MainActivity.java', 'utf8');

const serversBlock = tsx.slice(tsx.search(/(export )?const SERVERS\b/));
const serversEnd = serversBlock.search(/\n\];/);
const serverHosts = [...new Set((serversBlock.slice(0, serversEnd).match(/https?:\/\/[a-z0-9.-]+/gi) || [])
  .map((u) => u.replace(/^https?:\/\//i, '').toLowerCase()))];

const embedBlock = (java.match(/EMBED_HOSTS\s*=\s*new HashSet<>\(Arrays\.asList\(([\s\S]*?)\)\);/) || [])[1] || '';
const embedHosts = (embedBlock.replace(/\/\/[^\n]*/g, '').match(/"([a-z0-9.-]+)"/gi) || []).map((s) => s.slice(1, -1).toLowerCase());

const covered = (h) => embedHosts.some((e) => h === e || h.endsWith('.' + e));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         ' + detail : '')); }
};

check('found the SERVERS list', serverHosts.length >= 3, `found ${serverHosts.length} hosts`);
check('found the EMBED_HOSTS list', embedHosts.length >= 3, `found ${embedHosts.length} hosts`);
for (const h of serverHosts) {
  check(`${h} is on EMBED_HOSTS`, covered(h), 'add it to EMBED_HOSTS in MainActivity.java, or the APK will rewrite its player and it will not play');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
