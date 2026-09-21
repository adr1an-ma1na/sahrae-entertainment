/**
 * Artwork sizing and the small-memory marker.
 *
 * The bug this guards against is not cosmetic. A 3 GB phone killed the app's
 * renderer over and over because a full-bleed backdrop was fetched at up to
 * 3840 px — roughly 60 MB once decoded — for a screen 720 px wide. Asking for
 * artwork the screen can actually show is invisible to the viewer and is what
 * keeps the renderer alive, so if this stops happening, the crash returns.
 *
 * Run: node --experimental-strip-types devicetier-check.mjs
 */

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

// A minimal DOM, storage and screen, enough for the modules under test.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const classes = new Set();
// navigator is a getter-only global in Node, so define it rather than assign.
const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
const setScreen = (w, h, dpr) => {
  globalThis.window = { screen: { width: w, height: h }, devicePixelRatio: dpr, innerWidth: w, innerHeight: h };
};
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
setScreen(1512, 982, 2);

const { isLiteDevice, markLiteDevice, applyDeviceTier, resetDeviceTier, screenPixels, LITE_KEY } =
  await import('./src/services/deviceTier.ts');
const { getImageUrl } = await import('./src/services/tmdb.ts');

const fresh = () => { store.clear(); classes.clear(); resetDeviceTier(); setNavigator({}); setScreen(1512, 982, 2); };

console.log('\nwho counts as a small-memory device');
fresh(); setNavigator({ deviceMemory: 8 });
eq('an 8 GB device does not', isLiteDevice(), false);

fresh(); setNavigator({ deviceMemory: 4 });
eq('a device reporting 4 GB does (a 3 GB phone reports 4)', isLiteDevice(), true);

fresh(); setNavigator({ deviceMemory: 2 });
eq('a 2 GB device does', isLiteDevice(), true);

fresh();
eq('an unknown device does not', isLiteDevice(), false);

fresh(); store.set(LITE_KEY, '1'); setNavigator({ deviceMemory: 8 });
eq('a stored mark wins over a roomy report', isLiteDevice(), true);

fresh(); classes.add('lite'); setNavigator({ deviceMemory: 8 });
eq('the class set by the Android shell wins too', isLiteDevice(), true);

console.log('\nthe mark changes nothing you can see');
fresh(); setNavigator({ deviceMemory: 8 });
isLiteDevice();
markLiteDevice();
eq('marking persists', [isLiteDevice(), store.get(LITE_KEY), classes.has('lite')], [true, '1', true]);

fresh(); setNavigator({ deviceMemory: 4 });
applyDeviceTier();
eq('a small device is marked, and keeps its glass and glow', [classes.has('lite'), classes.has('low-gfx')], [true, false]);

fresh(); setNavigator({ deviceMemory: 8 });
applyDeviceTier();
eq('a capable device is not marked at all', [classes.has('lite'), classes.has('low-gfx')], [false, false]);

console.log('\nartwork is sized to the screen, not to the memory mark');
fresh(); setScreen(1512, 982, 2);
eq('a laptop keeps the full-resolution backdrop', getImageUrl('/a.jpg', 'original'), 'https://image.tmdb.org/t/p/original/a.jpg');
eq('screenPixels measures the width at 2x', screenPixels(), 3024);

fresh(); setScreen(720, 1600, 2); setNavigator({ deviceMemory: 4 });
eq('a 720 px phone at 2x takes w1280, not a 60 MB original', getImageUrl('/a.jpg', 'original'), 'https://image.tmdb.org/t/p/w1280/a.jpg');
eq('and w780 is already small enough to keep', getImageUrl('/a.jpg', 'w780'), 'https://image.tmdb.org/t/p/w780/a.jpg');

fresh(); setScreen(360, 640, 1);
eq('a 360 px screen drops the backdrop to w780, the smallest backdrop TMDB offers', getImageUrl('/a.jpg', 'original'), 'https://image.tmdb.org/t/p/w780/a.jpg');
eq('a w780 request there is already right', getImageUrl('/a.jpg', 'w780'), 'https://image.tmdb.org/t/p/w780/a.jpg');

fresh(); setScreen(1000, 800, 1);
eq('a 1000 px screen takes w1280 rather than original', getImageUrl('/a.jpg', 'original'), 'https://image.tmdb.org/t/p/w1280/a.jpg');

fresh(); setScreen(360, 640, 1);
eq('posters are left exactly as asked', getImageUrl('/a.jpg', 'w500'), 'https://image.tmdb.org/t/p/w500/a.jpg');
eq('the smallest size is untouched', getImageUrl('/a.jpg', 'w185'), 'https://image.tmdb.org/t/p/w185/a.jpg');
eq('a full URL is untouched', getImageUrl('https://img/x.jpg', 'original'), 'https://img/x.jpg');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
