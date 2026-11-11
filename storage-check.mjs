// node --experimental-strip-types storage-check.mjs
// A storage bucket with a quota, so a full device can be tested without a browser.
class Storage {
  constructor(quota) { this.quota = quota; this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  removeItem(k) { this.map.delete(k); }
  used() { let n = 0; for (const [k, v] of this.map) n += (k.length + v.length) * 2; return n; }
  setItem(k, v) {
    const before = this.map.get(k);
    const after = this.used() - (before !== undefined ? (k.length + before.length) * 2 : 0) + (k.length + String(v).length) * 2;
    if (after > this.quota) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
    this.map.set(k, String(v));
  }
}
globalThis.Storage = Storage;
globalThis.setTimeout = () => 0;
const { installStorageGuard, clearCaches } = await import('./src/services/storageGuard.ts');
const { adoptOrphans } = await import('./src/services/orphanLists.ts');
installStorageGuard();

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};
const blob = (n) => 'x'.repeat(n);

console.log('\na full device');
{
  const s = new Storage(200_000);
  for (let i = 0; i < 9; i++) s.setItem(`v2-sahrae_tmdb_details_movie_${i}`, blob(10_000));
  s.setItem('sahrae_watch_progress_u1_p1', JSON.stringify([{ mediaId: 1 }]));
  let threw = false;
  try { s.setItem('sahrae_notifications', blob(30_000)); } catch { threw = true; }
  eq('the save that used to crash goes through', threw, false);
  eq('it is kept', s.getItem('sahrae_notifications')?.length, 30_000);
  eq('Continue Watching is untouched', s.getItem('sahrae_watch_progress_u1_p1'), JSON.stringify([{ mediaId: 1 }]));
  eq('film caches made the room', [...s.map.keys()].filter((k) => k.startsWith('v2-')).length < 9, true);
}
{
  const s = new Storage(50_000);
  s.setItem('sahrae_my_list_u1_p1', blob(20_000));
  let threw = false;
  try { s.setItem('sahrae.dz.playlist/1', blob(40_000)); } catch { threw = true; }
  eq('a cache that cannot fit is skipped quietly', threw, false);
  eq('and nothing of the viewer is dropped for it', s.getItem('sahrae_my_list_u1_p1')?.length, 20_000);
}
{
  const s = new Storage(100);
  let threw = false;
  try { s.setItem('a', 'b'); } catch { threw = true; }
  eq('an ordinary save still works', s.getItem('a'), 'b');
  const odd = new Storage(1000);
  odd.setItem = Storage.prototype.setItem;
  eq('no error invented', threw, false);
}
{
  const s = new Storage(1_000_000);
  s.setItem('v2-sahrae_tmdb_details_tv_1', 'x');
  s.setItem('sahrae.yt.cache.q', 'x');
  s.setItem('sahrae_watch_progress_u1_p1', '[]');
  s.setItem('sahrae.music.playlists.v1', '[]');
  clearCaches(s);
  eq('reset clears caches only', [...s.map.keys()].sort(), ['sahrae.music.playlists.v1', 'sahrae_watch_progress_u1_p1']);
}

console.log('\nlists under an older profile');
{
  const s = new Storage(1_000_000);
  s.setItem('sahrae_watch_progress_u1_profile_111', JSON.stringify([{ mediaId: 5, timestamp: 10 }, { mediaId: 6, timestamp: 30 }]));
  s.setItem('sahrae_watch_progress_u1_profile_222', JSON.stringify([{ mediaId: 5, timestamp: 20 }]));
  s.setItem('sahrae_watch_progress_u2_profile_9', JSON.stringify([{ mediaId: 99, timestamp: 1 }]));
  const got = adoptOrphans(s, 'sahrae_watch_progress_', 'u1', 'sahrae_watch_progress_u1_profile_new');
  eq('found again, newest first, one entry each', got.map((x) => x.mediaId), [6, 5]);
  eq('the newer copy of a title wins', got.find((x) => x.mediaId === 5).timestamp, 20);
  eq('another account is never taken', got.some((x) => x.mediaId === 99), false);
  eq('kept under the current profile', JSON.parse(s.getItem('sahrae_watch_progress_u1_profile_new')).length, 2);
  eq('nothing to find, nothing made', adoptOrphans(s, 'sahrae_my_list_', 'u1', 'sahrae_my_list_u1_p'), []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
