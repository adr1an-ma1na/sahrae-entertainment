/**
 * Lite mode tests: who gets it, and what it does to image requests.
 *
 * The bug this guards against is not cosmetic. A 3 GB phone killed the app's
 * renderer over and over because the home screen asked for full-resolution
 * artwork; if lite mode stops applying, that returns.
 *
 * Run: node --experimental-strip-types devicetier-check.mjs
 */

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

// A minimal DOM and storage, enough for the module under test.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const classes = new Set();
// navigator is a getter-only global in Node, so define it rather than assign.
const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
globalThis.document = {
  documentElement: {
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
  },
};
setNavigator({});

const { isLiteDevice, markLiteDevice, applyDeviceTier, resetDeviceTier, LITE_KEY } =
  await import('./src/services/deviceTier.ts');

const fresh = () => { store.clear(); classes.clear(); resetDeviceTier(); setNavigator({}); };

console.log('\nwho gets lite mode');
fresh();
setNavigator({ deviceMemory: 8 });
eq('an 8 GB device does not', isLiteDevice(), false);

fresh();
setNavigator({ deviceMemory: 4 });
eq('a device reporting 4 GB does (a 3 GB phone reports 4)', isLiteDevice(), true);

fresh();
setNavigator({ deviceMemory: 2 });
eq('a 2 GB device does', isLiteDevice(), true);

fresh();
eq('an unknown device does not (no deviceMemory support)', isLiteDevice(), false);

fresh();
store.set(LITE_KEY, '1');
setNavigator({ deviceMemory: 8 });
eq('the stored flag wins over a roomy report', isLiteDevice(), true);

fresh();
classes.add('lite');
setNavigator({ deviceMemory: 8 });
eq('the class set by the Android shell wins too', isLiteDevice(), true);

console.log('\nmarking and applying');
fresh();
setNavigator({ deviceMemory: 8 });
isLiteDevice();
markLiteDevice();
eq('marking persists', [isLiteDevice(), store.get(LITE_KEY), classes.has('lite')], [true, '1', true]);

fresh();
setNavigator({ deviceMemory: 4 });
applyDeviceTier();
eq('applying stamps both classes', [classes.has('lite'), classes.has('low-gfx')], [true, true]);

fresh();
setNavigator({ deviceMemory: 8 });
applyDeviceTier();
eq('a capable device keeps its effects', [classes.has('lite'), classes.has('low-gfx')], [false, false]);

console.log('\nimage sizes');
const { getImageUrl } = await import('./src/services/tmdb.ts');

fresh();
setNavigator({ deviceMemory: 8 });
eq('full size on a capable device', getImageUrl('/a.jpg', 'original'), 'https://image.tmdb.org/t/p/original/a.jpg');
eq('poster default on a capable device', getImageUrl('/a.jpg'), 'https://image.tmdb.org/t/p/w500/a.jpg');

fresh();
setNavigator({ deviceMemory: 4 });
eq('backdrops drop to w780 on lite', getImageUrl('/a.jpg', 'original'), 'https://image.tmdb.org/t/p/w780/a.jpg');
eq('posters drop to w342 on lite', getImageUrl('/a.jpg', 'w500'), 'https://image.tmdb.org/t/p/w342/a.jpg');
eq('the smallest size is left alone', getImageUrl('/a.jpg', 'w185'), 'https://image.tmdb.org/t/p/w185/a.jpg');
eq('a full URL is untouched', getImageUrl('https://img/x.jpg', 'original'), 'https://img/x.jpg');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
