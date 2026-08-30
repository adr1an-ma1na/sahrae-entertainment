/**
 * What is the oldest browser engine that can even PARSE this build?
 *
 * A WebView too old for the syntax in a bundle does not degrade — it throws a
 * SyntaxError on the whole chunk and renders nothing. The app appears to hang
 * with a blank screen, which is indistinguishable from a crash and gets reported
 * as one. Emulators are the usual place this shows up, because their bundled
 * Android System WebView is frozen at whatever shipped with the image, while
 * real phones update theirs through the Play Store.
 *
 * This finds the highest engine requirement actually present, so the build
 * target is set from evidence rather than from a guess about the audience.
 *
 * Run: node syntax-floor.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'dist/assets';

/** [label, regex, minimum Chrome that can parse it] */
const FEATURES = [
  ['class static block',    /\bstatic\s*\{/g,                          94],
  ['Array.prototype.at',    /\.at\s*\(\s*-?\d/g,                       92],
  ['Object.hasOwn',         /Object\.hasOwn\s*\(/g,                    93],
  ['top-level await',       /^\s*await\s/gm,                           89],
  ['logical assignment',    /[^=!<>]([&|?]{2}=)[^=]/g,                 85],
  ['String.replaceAll',     /\.replaceAll\s*\(/g,                      85],
  ['Promise.any',           /Promise\.any\s*\(/g,                      85],
  ['private class field',   /\bthis\.#[A-Za-z_]/g,                     74],
  ['nullish coalescing',    /[^?]\?\?[^=]/g,                           80],
  ['optional chaining',     /\?\.[A-Za-z_[(]/g,                        80],
  ['structuredClone',       /\bstructuredClone\s*\(/g,                 98],
  ['Array.findLast',        /\.findLast(Index)?\s*\(/g,                97],
  ['RegExp d flag',         /\/[gimsuy]*d[gimsuy]*\s*[.;,)\]]/g,       90],
  ['numeric separators',    /\b\d+_\d/g,                               75],
  ['BigInt literal',        /\b\d+n\b/g,                               67],
];

/** Rough Chrome → Android System WebView / OS mapping, for a readable verdict. */
const CONTEXT = [
  [107, 'Android 13+ with an updated WebView'],
  [94,  'a WebView updated since late 2021'],
  [87,  'Android 11-era WebView'],
  [80,  'Android 10-era WebView'],
  [74,  'Android 9-era WebView'],
];

let files = [];
try {
  files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => path.join(DIR, f));
} catch {
  console.error(`  No build found at ${DIR}. Run: npm run build`);
  process.exit(1);
}

console.log(`\n  Scanning ${files.length} chunks for the highest engine requirement.\n`);

let floor = 0;
const hits = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const [label, re, chrome] of FEATURES) {
    const n = (src.match(re) || []).length;
    if (!n) continue;
    hits.push({ label, chrome, n, file: path.basename(file) });
    if (chrome > floor) floor = chrome;
  }
}

// Report the worst offender per feature, highest requirement first.
const byFeature = new Map();
for (const h of hits) {
  const cur = byFeature.get(h.label);
  if (!cur) byFeature.set(h.label, { ...h });
  else { cur.n += h.n; }
}
const rows = [...byFeature.values()].sort((a, b) => b.chrome - a.chrome);
for (const r of rows) {
  const bar = r.chrome >= floor ? '\x1b[31m→\x1b[0m' : ' ';
  console.log(`  ${bar} ${String('Chrome ' + r.chrome).padEnd(11)} ${r.label.padEnd(22)} ${String(r.n).padStart(6)} occurrences`);
}

console.log('\n' + '─'.repeat(64));
const ctx = CONTEXT.find(([c]) => floor >= c);
console.log(`\n  This build needs at least \x1b[1mChrome ${floor}\x1b[0m to parse.`);
console.log(`  That means it requires ${ctx ? ctx[1] : 'a very old WebView is fine'}.`);
console.log('\n  Anything older shows a blank screen, not a degraded one — the chunk');
console.log('  fails to parse and nothing renders at all.\n');
