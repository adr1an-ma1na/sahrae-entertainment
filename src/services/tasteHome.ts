/**
 * The personal half of the Music home, built only from the listener's own
 * artists (taste.ts) and the catalogue's links between artists (deezer.ts):
 *
 *   Quick picks             your artists' best songs, with their neighbours'
 *   More like <artist>      your two strongest artists' radio: them, then who they lead to
 *   New releases for you    what your artists put out in the last four months
 *   Release Radar           the songs off those releases, newest first
 *   Discover Weekly         artists you have not played yet, reached through
 *                           yours (related, and related of related), two songs
 *                           each, new each Monday, nothing you have heard
 *   Artists you might like  the artists most of yours point to, with who points to them
 *
 * It used to come from YouTube: regional searches ("New in Kenya"), YouTube's
 * own related videos and genre pools, which is how a listener of Rumba got
 * shown artists they had never played and would not (owner, 2026-11-01).
 * Kept for the day, so it is rebuilt only when the day or the artists change.
 */
import { deezer, type DzAlbum } from './deezer';
import { buildMix, interleave, type CArtist, type CTrack } from './curate';
import { artistNamed } from './sautiMixes';
import { artistKey, type Weighted } from './taste';

export interface TasteHome {
  sig: string;
  top: CArtist[];
  quick: CTrack[];
  moreLike: { artist: CArtist; tracks: CTrack[] }[];
  releases: DzAlbum[];
  radar: CTrack[];
  discover: CTrack[];
  mightLike: { artist: CArtist; because: string[] }[];
}

const HOME_KEY = 'sahrae.music.tasteHome.v1';
const DAY = 86_400_000;
const fold = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
/** A song's key for "already heard": lead artist and title, spelling aside. */
export const songKey = (artist: string, title: string) => `${artistKey(artist)}|${fold(title)}`;

/**
 * The list with later copies of the same song left out. A catalogue song and
 * the YouTube upload it plays from carry different ids, so lists keyed on id
 * showed "Romeo" twice.
 */
export function uniqueSongs<T extends { title: string; artist: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = songKey(t.artist, t.title);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** Monday-to-Sunday week number, so Discover Weekly turns over on Mondays. */
const weekOf = (now: number) => Math.floor((now / DAY + 3) / 7);

const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);

export async function buildTasteHome(input: {
  ranked: Weighted[];
  picks: CArtist[];
  banned: string[];
  heard: Set<string>;
  now?: number;
}): Promise<TasteHome | null> {
  const now = input.now ?? Date.now();
  const banned = new Set(input.banned);
  const pickByKey = new Map(input.picks.map((a) => [artistKey(a.name), a]));

  // 1. The listener's artists, as catalogue artists, strongest first.
  const lead = input.ranked.slice(0, 12);
  const resolved = await Promise.all(lead.map((w) => pickByKey.get(w.key) || safe(artistNamed(w.name), null)));
  const weight = new Map<number, number>();
  const top: CArtist[] = [];
  resolved.forEach((a, i) => { if (a && !weight.has(a.id)) { weight.set(a.id, lead[i].w); top.push(a); } });
  if (!top.length) return null;

  const sig = `${new Date(now).toDateString()}|${top.map((a) => a.id).join(',')}|${input.banned.join(',')}`;
  try {
    const kept = JSON.parse(localStorage.getItem(HOME_KEY) || 'null') as TasteHome | null;
    if (kept?.sig === sig) return kept;
  } catch { /* none kept */ }

  const mine = new Set(top.map((a) => a.id));
  const allowed = (a: CArtist) => !mine.has(a.id) && !banned.has(artistKey(a.name));

  // 2. Who each of them leads to (the same lookups the Daily Mixes make, so already kept).
  const related = await Promise.all(top.map((a) => safe(deezer.related(a.id, 10), [] as CArtist[])));

  // 3. Artists you might like: pointed to by the most of yours, the strongest of yours counting most.
  const score = new Map<number, { artist: CArtist; s: number; because: string[] }>();
  top.forEach((a, i) => related[i].forEach((r, j) => {
    if (!allowed(r)) return;
    const cur = score.get(r.id) || { artist: r, s: 0, because: [] };
    cur.s += (weight.get(a.id) || 1) * (1 - j / 20);
    if (!cur.because.includes(a.name)) cur.because.push(a.name);
    score.set(r.id, cur);
  }));
  const mightLike = [...score.values()].sort((x, y) => y.s - x.s).slice(0, 20).map(({ artist, because }) => ({ artist, because }));

  // 4. Songs: your artists' best known, and your likely next artists'.
  const [familiar, neighbours] = await Promise.all([
    Promise.all(top.slice(0, 8).map((a) => safe(deezer.topTracks(a.id, 12), [] as CTrack[]))),
    Promise.all(mightLike.slice(0, 10).map((m) => safe(deezer.topTracks(m.artist.id, 6), [] as CTrack[]))),
  ]);
  const quick = buildMix(familiar, neighbours, 24);

  // 5. More like your two strongest: their songs woven with who they lead to.
  const moreLike: TasteHome['moreLike'] = [];
  for (let i = 0; i < Math.min(2, top.length); i++) {
    const rel = related[i].filter(allowed).slice(0, 8);
    if (rel.length < 3) continue;
    const relTops = await Promise.all(rel.map((r) => safe(deezer.topTracks(r.id, 6), [] as CTrack[])));
    const tracks = buildMix([familiar[i]?.slice(0, 5) || []], relTops, 30);
    if (tracks.length >= 10) moreLike.push({ artist: top[i], tracks });
  }

  // 6. New releases: your artists' last four months, your likely next artists' last six weeks.
  const [ownAlbums, nextAlbums] = await Promise.all([
    Promise.all(top.slice(0, 10).map((a) => safe(deezer.artistAlbums(a, 8), [] as DzAlbum[]))),
    Promise.all(mightLike.slice(0, 6).map((m) => safe(deezer.artistAlbums(m.artist, 6), [] as DzAlbum[]))),
  ]);
  const within = (d: string, days: number) => { const t = Date.parse(d); return t > 0 && t <= now + DAY && now - t <= days * DAY; };
  const seenRelease = new Set<string>();
  const releases = [...ownAlbums.flat().filter((x) => within(x.date, 120)), ...nextAlbums.flat().filter((x) => within(x.date, 45))]
    .sort((x, y) => y.date.localeCompare(x.date))
    .filter((x) => { const k = `${x.artistId}|${fold(x.title)}`; return seenRelease.has(k) ? false : (seenRelease.add(k), true); })
    .slice(0, 16);

  // 7. Release Radar: the songs off them (a single's one, the lead two off a longer release).
  const releaseSongs = await Promise.all(releases.slice(0, 14).map((r) =>
    safe(deezer.albumTracks(r.id, r), [] as CTrack[]).then((ts) => ts.slice(0, r.type === 'single' ? 1 : 2))));
  const radar = interleave(releaseSongs, 30, 3);

  // 8. Discover Weekly: artists new to you, reached through yours; two unheard songs each.
  const near = mightLike.slice(2, 12).map((m) => m.artist);
  const nearIds = new Set(mightLike.map((m) => m.artist.id));
  const further = (await Promise.all(mightLike.slice(0, 3).map((m) => safe(deezer.related(m.artist.id, 10), [] as CArtist[]))))
    .flat().filter((a, i, all) => allowed(a) && !nearIds.has(a.id) && all.findIndex((x) => x.id === a.id) === i).slice(0, 6);
  const week = weekOf(now);
  const pools = await Promise.all([...near, ...further].map((a) => safe(deezer.topTracks(a.id, 6), [] as CTrack[])));
  const fresh = pools.map((list) => {
    const unheard = list.filter((t) => !input.heard.has(songKey(t.artist, t.title)));
    if (unheard.length <= 2) return unheard;
    // A different pair each week, from the artist's best known.
    const at = (week + hash(String(unheard[0].artistId))) % unheard.length;
    return [unheard[at], unheard[(at + 1) % unheard.length]];
  });
  // Shuffled for the week, so the newest-to-you are not all bunched at one end.
  const order = fresh.map((_, i) => i).sort((x, y) => hash(`${week}|${x}`) - hash(`${week}|${y}`));
  const discover = interleave(order.map((i) => fresh[i]), 30, 2);

  const home: TasteHome = { sig, top, quick, moreLike, releases, radar, discover, mightLike };
  try { localStorage.setItem(HOME_KEY, JSON.stringify(home)); } catch { /* storage full */ }
  return home;
}
