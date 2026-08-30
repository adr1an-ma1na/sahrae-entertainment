/**
 * Per-device server ranking tests.
 *
 * This decides which source a viewer lands on first, so getting it wrong means
 * everyone on a given ISP hits a dead player every time. The cases that matter
 * are the ones about learning: an untried server must still get a turn, a
 * recent success must outrank a stale one, and one bad night must not
 * permanently bury a source.
 *
 * Run: node --experimental-strip-types serverhealth-check.mjs
 */

// A localStorage stand-in, since this runs in node.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  healthOf, rankServers, recordDwell, recordFailure, recordSuccess, resetHealth,
} = await import('./src/services/serverHealth.ts');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const S = (...ids) => ids.map((id) => ({ id }));
const order = (list) => rankServers(list).map((s) => s.id).join(',');

console.log('\nfresh install');
resetHealth();
ok('an untried server starts optimistic, not at zero', healthOf('anything').score > 0.5);
ok('with no history the curated order is kept', order(S('a', 'b', 'c')) === 'a,b,c');

console.log('\nlearning from outcomes');
resetHealth();
recordSuccess('b');
ok('a server that worked moves ahead of untried ones', order(S('a', 'b', 'c')).startsWith('b'));

resetHealth();
recordFailure('a');
ok('a server that failed drops behind untried ones', order(S('a', 'b', 'c')).endsWith('a'));

resetHealth();
recordFailure('a'); recordFailure('a'); recordFailure('a');
recordSuccess('c');
ok('repeated failure sinks further', order(S('a', 'b', 'c')) === 'c,b,a');

console.log('\ndwell time as a verdict');
resetHealth();
recordDwell('a', 2000);   // gave up almost immediately
recordDwell('b', 60_000); // watched a minute
ok('a quick exit counts against a server', healthOf('a').score < healthOf('b').score);
ok('  and a long watch counts for it', healthOf('b').score > 0.6);

resetHealth();
recordDwell('a', 0);
ok('zero dwell is ignored, not counted as failure', healthOf('a').plays === 0);
recordDwell('', 5000);
ok('an empty id is ignored', true);

console.log('\nrecovery — one bad night must not be permanent');
resetHealth();
for (let i = 0; i < 3; i++) recordFailure('a');
const sunk = healthOf('a').score;
for (let i = 0; i < 5; i++) recordSuccess('a');
ok('a recovered server climbs back', healthOf('a').score > sunk);
ok('  and can lead again', order(S('a', 'b')) === 'a,b');

console.log('\nrecency breaks ties');
resetHealth();
recordSuccess('old');
recordSuccess('new');
{
  // Same score; the more recent success should lead.
  const t = JSON.parse(localStorage.getItem('sahrae.serverHealth.v1'));
  t.old.lastOk = Date.now() - 30 * 86_400_000;
  localStorage.setItem('sahrae.serverHealth.v1', JSON.stringify(t));
  ok('a recent success outranks a month-old one at the same rate',
    order(S('old', 'new')) === 'new,old');
}

console.log('\nrobustness');
resetHealth();
ok('an empty server list is safe', rankServers([]).length === 0);
ok('ranking never drops or duplicates a server',
  (() => { const r = rankServers(S('a', 'b', 'c', 'd')); return r.length === 4 && new Set(r.map((x) => x.id)).size === 4; })());
localStorage.setItem('sahrae.serverHealth.v1', 'not json');
ok('corrupt stored data does not throw', order(S('a', 'b')) === 'a,b');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
