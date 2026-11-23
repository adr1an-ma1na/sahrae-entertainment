// node --experimental-strip-types plans-check.mjs
// The paywall demonstration (services/paywallDemo.ts; owner, 2026-11-23): website only,
// off unless switched on, never charges, and its plans are the pricing proposal's.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const { TIERS, planParam, demoOn, passValid, passFor } = await import('./src/services/paywallDemo.ts');

console.log('\nthe proposal\'s plans');
eq('prices in KSh', TIERS.map((t) => [t.id, t.price]), [['day', 20], ['week', 60], ['mobile', 150], ['plus', 350], ['family', 550]]);
eq('how long each lasts', TIERS.map((t) => t.hours), [24, 168, 720, 720, 720]);
eq('Plus is the main plan', TIERS.filter((t) => t.main).map((t) => t.id), ['plus']);

console.log('\nswitched on only where asked');
const s = mem();
eq('off by default', demoOn(false, '', s), false);
eq('?plans=demo turns it on', demoOn(false, '?plans=demo', s), true);
eq('and it stays on in that browser', demoOn(false, '', s), true);
eq('?plans=off turns it off', [demoOn(false, '?plans=off', s), demoOn(false, '', s)], [false, false]);
eq('never in the Android apps, even when asked', demoOn(true, '?plans=demo', mem()), false);
eq('other values do nothing', [planParam('?plans=yes'), planParam('?x=1')], [null, null]);
eq('storage blocked: on for that visit only', demoOn(false, '?plans=demo', null), true);

console.log('\na chosen plan, for this tab');
const t = mem(), now = 1_000_000;
eq('no pass yet', passValid(t, now), false);
t.setItem('sahrae.plansDemo.pass.v1', JSON.stringify(passFor(TIERS[0], now)));
eq('a day pass lets the tab play', passValid(t, now + 3600_000), true);
eq('and runs out after 24 hours', passValid(t, now + 24 * 3600_000 + 1), false);
eq('a broken record is no pass', (() => { const b = mem(); b.setItem('sahrae.plansDemo.pass.v1', '{'); return passValid(b, now); })(), false);

console.log('\nno payment, no details');
const sheet = readFileSync('src/components/PlansSheet.tsx', 'utf8');
const pm = readFileSync('src/components/PlayerModal.tsx', 'utf8');
eq('says it is a demo that charges nothing', sheet.includes('Sahrae takes no payments yet, and nothing here charges you or asks for your details.'), true);
eq('asks for nothing: no input of any kind', /<input|<form|<textarea/.test(sheet), false);
eq('nothing is sent anywhere', /fetch\(|XMLHttpRequest|sendBeacon/.test(sheet + readFileSync('src/services/paywallDemo.ts', 'utf8')), false);
eq('every way a film starts shows the plans first; nothing loads behind them', pm.includes('if (on && plansDemoOn() && !hasDemoPass()) { setPlayingState(false); setShowPlans(true); return; }'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
