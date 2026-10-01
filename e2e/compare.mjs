// Side-by-side of the same flows on several targets.
//   node compare.mjs results/pwa-phone results/android-fixed results/android-baseline
import fs from 'node:fs';
import path from 'node:path';

const dirs = process.argv.slice(2);
const runs = dirs.map((d) => ({ name: path.basename(d), r: JSON.parse(fs.readFileSync(path.join(d, 'report.json'), 'utf8')) }));

const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
// An empty 200 for a stylesheet/script/API call is what the APK's native filter
// returns when it blocks; a real server essentially never does.
const emptied = (q) => q.status === 200 && q.bytes === 0 && ['xhr', 'fetch', 'stylesheet', 'script'].includes(q.type);
const failed = (q) => q.failure && !/ERR_ABORTED/.test(q.failure);

const cell = (s) => {
  if (!s) return '-';
  const p = s.probe || {};
  const x = s.extra || {};
  const bits = [];
  if (p.imgs) bits.push(`img ${p.imgsLoaded}/${p.imgs}`);
  bits.push(`font ${p.appFontsLoaded ?? '?'}`);
  if ('advancing' in x) bits.push(x.advancing ? 'PLAYING' : 'not playing');
  if ('results' in x) bits.push(`${x.results} results`);
  if ('email' in x) bits.push(x.email && x.password ? 'form ok' : 'no form');
  if (x.nav === null || x.clicked === null || x.opened === null) bits.push('NOT REACHED');
  if (!s.ok) bits.push('ERROR');
  return bits.join(', ');
};

const names = [...new Set(runs.flatMap((x) => x.r.steps.map((s) => s.name)))];
const W = 34;
console.log('step'.padEnd(22) + runs.map((x) => x.name.padEnd(W)).join(''));
for (const n of names) {
  console.log(n.padEnd(22) + runs.map((x) => cell(x.r.steps.find((s) => s.name === n)).slice(0, W - 2).padEnd(W)).join(''));
}

console.log('\nper run: requests | emptied-200 | failed | page crashes | console errors');
for (const x of runs) {
  const q = x.r.requests;
  console.log(`  ${x.name.padEnd(20)} ${String(q.length).padStart(5)} | ${String(q.filter(emptied).length).padStart(5)} | ${String(q.filter(failed).length).padStart(5)} | ${String(x.r.pageErrors.length).padStart(4)} | ${String(x.r.consoleErrors.length).padStart(4)}`);
}

for (const x of runs) {
  const by = {};
  for (const q of x.r.requests.filter(emptied)) by[host(q.url)] = (by[host(q.url)] || 0) + 1;
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (top.length) console.log(`\n${x.name}: emptied responses by host\n  ` + top.map(([h, n]) => `${h} x${n}`).join('\n  '));
}
