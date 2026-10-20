/**
 * Data Saver and data estimates (src/services/dataSaver.ts, tmdb getImageUrl).
 *
 * For most viewers mobile data is the real cost of streaming. These pin the
 * figures shown before Play and what the switch changes.
 *
 * Run: node --experimental-strip-types datasaver-check.mjs
 */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const ds = await import('./src/services/dataSaver.ts');
const { getImageUrl } = await import('./src/services/tmdb.ts');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

console.log('\nestimates');
eq('an hour at 480p is about 0.68 GB', ds.gbFor(60, ds.SD_MBPS).toFixed(3), '0.675');
eq('an hour at 1080p is about 2.25 GB', ds.gbFor(60, ds.HD_MBPS).toFixed(2), '2.25');
eq('under a gigabyte reads in MB, to the nearest 10', ds.formatGB(0.596), '600 MB');
eq('a gigabyte and up reads to one decimal', ds.formatGB(1.987), '2.0 GB');
eq('very small never reads as 0 MB', ds.formatGB(0.001), '10 MB');
eq('a 53-minute episode, off: a range, because the player picks', ds.estimateText(53, false, true), 'About 600 MB to 2.0 GB of data');
eq('on, in the Android app: one figure, because 480p is enforced', ds.estimateText(53, true, true), 'About 600 MB with Data Saver');
eq('on, on the web: still a range, because the web cannot cap the player', ds.estimateText(53, true, false), 'About 600 MB to 2.0 GB of data');
eq('no runtime, no estimate', ds.estimateText(0, false, false), null);
eq('measured bytes read naturally', [ds.formatBytes(412_000_000), ds.formatBytes(1_230_000_000), ds.formatBytes(5_000)], ['412 MB', '1.23 GB', '5 KB']);

console.log('\nthe switch');
eq('off by default', ds.isDataSaver(), false);
globalThis.window = { dispatchEvent: () => true };
ds.setDataSaver(true);
eq('on after switching, and remembered', [ds.isDataSaver(), store.get('sahrae.dataSaver.v1')], [true, '1']);

console.log('\nsmaller pictures');
eq('posters drop from w500 to w342', getImageUrl('/p.jpg', 'w500'), 'https://image.tmdb.org/t/p/w342/p.jpg');
eq('backdrops are capped at w780', getImageUrl('/b.jpg', 'original'), 'https://image.tmdb.org/t/p/w780/b.jpg');
eq('small sizes stay as asked', getImageUrl('/s.jpg', 'w185'), 'https://image.tmdb.org/t/p/w185/s.jpg');
ds.setDataSaver(false);
eq('off again: posters back to w500', getImageUrl('/p.jpg', 'w500'), 'https://image.tmdb.org/t/p/w500/p.jpg');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
