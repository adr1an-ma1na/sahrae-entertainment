/**
 * Every movie/series server in the server pool must be on MainActivity's
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

// The movie and series servers live in the pool file (src/data/servers.json):
// every host of every server in it counts, reserves included, because a
// reserve steps in the moment one of the six goes down. The APK also learns the
// published pool's hosts at run time (/__embedhosts), but a server that ships
// with the app must work before that call has been made.
const pool = JSON.parse(fs.readFileSync('src/data/servers.json', 'utf8'));
const serverHosts = [...new Set(pool.servers.flatMap((s) => s.hosts.map((h) => h.toLowerCase())))];
const java = fs.readFileSync('android-overlay/app/src/main/java/com/sahrae/entertainment/MainActivity.java', 'utf8');

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
