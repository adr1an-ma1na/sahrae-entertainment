// Which of the requests the working PWA makes would the APK's native filter
// silently answer with an empty 200?  Mirrors MainActivity.shouldInterceptRequest
// (L1 hostname list + L1.2 EasyList rules) using the same lists CI bundles.
//
//   node classify.mjs results/pwa/report.json
import fs from 'node:fs';
import path from 'node:path';

const report = JSON.parse(fs.readFileSync(process.argv[2] || 'results/pwa/report.json', 'utf8'));
const CACHE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '.cache');
fs.mkdirSync(CACHE, { recursive: true });

async function cached(name, url) {
  const f = path.join(CACHE, name);
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const t = await (await fetch(url)).text();
  fs.writeFileSync(f, t);
  return t;
}

// Exactly the CI recipe in android.yml.
const hostsTxt = await cached('hosts.txt', 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts');
const adHostsFile = hostsTxt.split('\n').filter((l) => /^(0\.0\.0\.0|127\.0\.0\.1)\s+/.test(l)).map((l) => l.trim().split(/\s+/)[1].toLowerCase())
  .filter((h) => h && !/^(localhost|localhost\.localdomain|local|broadcasthost|0\.0\.0\.0|ip6-.*)$/.test(h));
const easy = (await cached('easylist.txt', 'https://easylist.to/easylist/easylist.txt')) + '\n' + (await cached('easyprivacy.txt', 'https://easylist.to/easylist/easyprivacy.txt'));
const easyLines = easy.split('\n').filter((l) => !/^[!\[]/.test(l) && !/#(#|@#|\?#)/.test(l) && l.trim());

const javaSrc = fs.readFileSync(path.join(CACHE, '..', '..', 'android-overlay/app/src/main/java/com/sahrae/entertainment/MainActivity.java'), 'utf8');
const core = (javaSrc.match(/CORE_AD_HOSTS\s*=[\s\S]*?\)\);/) || [''])[0].match(/"([a-z0-9.-]+\.[a-z.]+)"/g).map((s) => s.slice(1, -1));

// ── The rule engine: same logic as adfilter-check.mjs (the hand-kept JS mirror of AdFilter.java)
const T = { UNKNOWN: 0, DOCUMENT: 1, SUBDOCUMENT: 2, SCRIPT: 4, IMAGE: 8, STYLESHEET: 16, XHR: 32, MEDIA: 64, FONT: 128 };
const mirror = fs.readFileSync(path.join(CACHE, '..', '..', 'adfilter-check.mjs'), 'utf8');
const engineSrc = mirror.slice(mirror.indexOf('function abpToRegex'), mirror.indexOf('// ── Cases'));
const { makeEngine, parse } = new Function('T', engineSrc + '\nreturn { makeEngine, parse };')(T);

// EasyList's plain `||domain^` rules are folded into the host set on device.
const domainRules = [];
for (const l of easyLines) {
  const m = l.trim().match(/^\|\|([a-z0-9.-]+)\^$/i);
  if (m) domainRules.push(m[1].toLowerCase());
}
const fullHosts = new Set([...core, ...adHostsFile, ...domainRules]);
const coreHosts = new Set(core);
const engine = makeEngine(easyLines);

const isAdHost = (set, host) => {
  let h = host.toLowerCase();
  for (;;) { if (set.has(h)) return true; const d = h.indexOf('.'); if (d < 0) return false; h = h.slice(d + 1); }
};

// What the WebView's typeOf() would most likely see for each puppeteer resource type.
const typeOf = (r) => ({ document: r.nav && !r.frame ? T.DOCUMENT : T.SUBDOCUMENT, stylesheet: T.STYLESHEET, script: T.SCRIPT, image: T.IMAGE, font: T.FONT, media: T.MEDIA }[r.type] ?? T.UNKNOWN);

const PWA_HOST = 'adr1an-ma1na.github.io';
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };

const rows = [];
for (const r of report.requests) {
  if (!/^https?:/.test(r.url)) continue;
  const host = hostOf(r.url);
  if (host === PWA_HOST) continue; // the app shell: in the APK this is https://localhost, never filtered
  const fhost = hostOf(r.frame);
  const fromApp = !fhost || fhost === PWA_HOST;
  const docHost = fromApp ? 'localhost' : fhost;
  const type = typeOf(r);
  const neverRule = type === T.DOCUMENT || type === T.SUBDOCUMENT || type === T.MEDIA;
  const ruleWithRef = !neverRule && engine(r.url, host, docHost, type);
  const ruleNoRef = !neverRule && engine(r.url, host, null, type);
  rows.push({
    step: r.step, host, type: r.type, fromApp, url: r.url,
    hostFull: isAdHost(fullHosts, host), hostCore: isAdHost(coreHosts, host),
    ruleWithRef, ruleNoRef,
  });
}

const FIXED = process.argv.includes('--fixed');
const blockedOn = (row, profile) => {
  if (FIXED && row.fromApp) return false;
  return profile === 'big-phone'
    ? row.hostFull || row.ruleWithRef || (!FIXED && row.ruleNoRef)
    : row.hostCore;
};

const summary = (profile) => {
  const hits = rows.filter((r) => blockedOn(r, profile));
  const g = {};
  for (const r of hits) {
    const k = `${r.fromApp ? 'APP  ' : 'EMBED'} ${r.host}  [${r.type}]`;
    (g[k] ||= { n: 0, steps: new Set(), sample: r.url, why: [] }).n++;
    g[k].steps.add(r.step.replace(/^\d+-/, ''));
    const why = [r.hostFull && 'hosts', r.ruleWithRef && 'rule', r.ruleNoRef && 'rule(no-ref)'].filter(Boolean).join('+');
    if (!g[k].why.includes(why)) g[k].why.push(why);
  }
  return { total: hits.length, fromApp: hits.filter((r) => r.fromApp).length, groups: g };
};

for (const profile of ['big-phone', 'low-ram']) {
  const s = summary(profile);
  console.log(`\n══ ${profile === 'big-phone' ? 'Phone with enough memory (full hosts + EasyList + EasyPrivacy)' : 'Low-RAM device / TV box (built-in core list only)'}`);
  console.log(`   ${s.total} of ${rows.length} external requests would be emptied (${s.fromApp} made by the app itself)\n`);
  const sorted = Object.entries(s.groups).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const [k, v] of sorted) {
    console.log(`   ${k}  x${v.n}  via ${v.why.join(',')}  in ${[...v.steps].join(',')}`);
    console.log(`        e.g. ${v.sample.slice(0, 130)}`);
  }
}
fs.writeFileSync(path.join(path.dirname(process.argv[2] || 'results/pwa/report.json'), 'apk-filter-prediction.json'), JSON.stringify(rows.filter((r) => blockedOn(r, 'big-phone')), null, 1));
