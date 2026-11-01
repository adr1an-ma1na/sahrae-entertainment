/**
 * What this listener is into, as a weight on each artist. Everything personal
 * in Sauti (Daily Mixes, Quick picks, More like, New releases, Discover Weekly,
 * Artists you might like) starts from these weights and from nothing else, so
 * the home page only ever reaches out from artists the listener chose or plays.
 *
 *   picked at first run   +6   (a stated choice)
 *   each liked song       +2   (up to +10 an artist)
 *   each song played      +1   (30 s or half the song; fades over a month)
 *   each quick skip       -1.5 (under 30 s; fades the same way)
 *   Not interested        out, everywhere, until taken back
 *
 * The listening log lives in `sahrae.music.taste.v1` and follows the account
 * between devices (syncKeys.ts). Pure apart from load/save, so it is testable
 * alone (taste-check.mjs).
 */

export interface ArtistStat { name: string; plays: number; skips: number; last: number }
export interface TasteLog { a: Record<string, ArtistStat>; banned: string[] }
export interface Weighted { key: string; name: string; w: number }

export const TASTE_KEY = 'sahrae.music.taste.v1';
export const TASTE_CHANGE = 'sahrae:taste';
const MONTH = 30 * 86_400_000;
const MAX_ARTISTS = 300;

const fold = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** The lead artist of a credit: "Wizkid, Tems" and "Wizkid feat. Tems" are Wizkid's. */
export const leadArtist = (credit: string) => (credit || '').split(/,|&|\sfeat\.?\s|\sft\.?\s|\sx\s/i)[0].trim();
export const artistKey = (credit: string) => fold(leadArtist(credit)).replace(/ /g, '');

export const emptyLog = (): TasteLog => ({ a: {}, banned: [] });

/**
 * One song's outcome. Played: 30 s, or half of a short song. Skipped: moved on
 * between 3 and 30 s (under 3 s is a song that never started, not a judgement).
 */
export function recordListen(log: TasteLog, credit: string, listened: number, duration: number, now = Date.now()): TasteLog {
  const key = artistKey(credit);
  if (!key) return log;
  const played = listened >= 30 || (duration > 0 && listened >= duration * 0.5);
  const skipped = !played && listened >= 3;
  if (!played && !skipped) return log;
  const prev = log.a[key];
  // Older listening fades before the new one is added, so the counts stay "recent".
  const fade = prev ? Math.pow(0.5, (now - prev.last) / MONTH) : 1;
  const stat: ArtistStat = {
    name: leadArtist(credit),
    plays: (prev ? prev.plays * fade : 0) + (played ? 1 : 0),
    skips: (prev ? prev.skips * fade : 0) + (skipped ? 1 : 0),
    last: now,
  };
  const a = { ...log.a, [key]: stat };
  const keys = Object.keys(a);
  if (keys.length > MAX_ARTISTS) keys.sort((x, y) => a[x].last - a[y].last).slice(0, keys.length - MAX_ARTISTS).forEach((k) => delete a[k]);
  return { ...log, a };
}

export function setBanned(log: TasteLog, credit: string, banned: boolean): TasteLog {
  const key = artistKey(credit);
  const rest = log.banned.filter((k) => k !== key);
  return { ...log, banned: banned ? [...rest, key] : rest };
}
export const isBanned = (log: TasteLog, credit: string) => log.banned.includes(artistKey(credit));

/** The listener's artists, strongest first. `picks` and `liked` are artist credits. */
export function weigh(input: { picks: string[]; liked: string[]; log: TasteLog; now?: number }): Weighted[] {
  const now = input.now ?? Date.now();
  const out = new Map<string, Weighted>();
  const add = (credit: string, w: number) => {
    const key = artistKey(credit);
    if (!key) return;
    const cur = out.get(key) || { key, name: leadArtist(credit), w: 0 };
    cur.w += w;
    out.set(key, cur);
  };
  for (const p of input.picks) add(p, 6);
  const likes = new Map<string, number>();
  for (const l of input.liked) { const k = artistKey(l); if (k) likes.set(k, (likes.get(k) || 0) + 1); }
  for (const l of input.liked) {
    const k = artistKey(l);
    // +2 a like, at most +10 an artist: counted once per artist here.
    if (k && likes.has(k)) { add(l, Math.min(10, 2 * likes.get(k)!)); likes.delete(k); }
  }
  for (const s of Object.values(input.log.a)) {
    const fade = Math.pow(0.5, (now - s.last) / MONTH);
    add(s.name, (s.plays - 1.5 * s.skips) * fade);
  }
  const banned = new Set(input.log.banned);
  return [...out.values()].filter((x) => x.w > 0.5 && !banned.has(x.key)).sort((a, b) => b.w - a.w);
}

export function loadTaste(): TasteLog {
  try {
    const t = JSON.parse(localStorage.getItem(TASTE_KEY) || 'null') as TasteLog | null;
    return t && t.a ? { a: t.a, banned: Array.isArray(t.banned) ? t.banned : [] } : emptyLog();
  } catch { return emptyLog(); }
}
export function saveTaste(t: TasteLog, announce = false): void {
  try { localStorage.setItem(TASTE_KEY, JSON.stringify(t)); } catch { /* storage full */ }
  if (announce) window.dispatchEvent(new Event(TASTE_CHANGE));
}
/** "Not interested in <artist>": out of every mix and shelf, now. */
export function banArtist(credit: string, banned = true): void {
  saveTaste(setBanned(loadTaste(), credit, banned), true);
}
