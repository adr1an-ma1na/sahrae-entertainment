/**
 * How Sauti curates, the way Spotify's mixes are built: from ARTISTS, not from
 * search words. A genre mix starts from that genre's known artists, widens
 * through their related artists, and plays each one's real top songs; a Daily
 * Mix starts from the listener's own artists and adds their neighbours. The
 * catalogue is Deezer's (label-distributed releases, real covers); a song is
 * matched to its YouTube audio only when it is about to play (resolveYt.ts).
 *
 * Searching YouTube for a genre's name ("rumba congolaise songs") is what gave
 * a Rumba & Lingala mix of AI-generated uploads that would not even play
 * (owner, 2026-11-01). Pure, so it is testable alone (curate-check.mjs).
 */

export interface CArtist { id: number; name: string; picture?: string; fans?: number }
export interface CTrack { id: number; title: string; artist: string; artistId: number; duration: number; cover?: string; coverXl?: string; rank?: number }

// ── One song, whatever version ───────────────────────────────────────────────
// "Calm Down", "Calm Down (Remix)", "Calm Down - Sped Up" and a cover of it are
// one song: Up next and an artist's releases must not offer it twice (owner,
// 2026-11-07: "not repeating songs of remixes of the same song").

/** A remix, live take, edit or other version of a song, named in its brackets or after a dash. */
const VERSION = /\b(remix(es)?|rmx|edit|version|acoustic|stripped|live|sped\s*up|slowed|reverb|instrumental|karaoke|a\s*cappella|acapella|cover|demo|extended|vip|bootleg|rework|unplugged|8d|nightcore|amapiano\s+mix|piano)\b/i;

const fold = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** The parts of a title that describe it: what is in brackets, and what follows " - ". */
function titleTags(title: string): string {
  const t = fold(title);
  const brackets = [...t.matchAll(/\((.*?)\)|\[(.*?)\]/g)].map((m) => m[1] ?? m[2] ?? '');
  const dash = t.match(/\s[-–]\s(.*)$/)?.[1] ?? '';
  return [...brackets, dash].join(' | ');
}

/** True for a version of a song (remix, live, acoustic, sped up...), not the song itself. */
export function isVersion(title: string): boolean {
  return VERSION.test(titleTags(title)) || /\bremix(es)?\b/i.test(title);
}

/** The song itself: its title without brackets, " - ..." tails or featured artists. */
export function songBase(title: string): string {
  return fold(title)
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s[-–|]\s.*$/, ' ')
    .replace(/\b(feat|ft|featuring|with)\b.*$/, ' ')
    .replace(/\b(the\s+)?remixes\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Each song once, in the list's order: where a song comes in several versions
 * the song itself stands in the first one's place, a remix only when there is
 * nothing else.
 */
export function onePerSong<T extends { title: string }>(list: T[]): T[] {
  const out: T[] = [];
  const at = new Map<string, number>();
  for (const t of list) {
    const key = songBase(t.title);
    const i = at.get(key);
    if (i === undefined) { at.set(key, out.length); out.push(t); }
    else if (isVersion(out[i].title) && !isVersion(t.title)) out[i] = t;
  }
  return out;
}

/**
 * An artist's releases as Spotify lists them: each release once (the Deluxe,
 * Extended and Live editions of an album are that album; the best-loved
 * edition stands for it), remix packages left out, then albums apart from
 * singles and EPs, the most popular first (`fans`: listeners who saved it).
 */
export function splitReleases<T extends { title: string; type: string; fans?: number }>(list: T[]): { albums: T[]; singles: T[] } {
  const rank = (r: T) => (r.type === 'album' ? 2 : r.type === 'ep' ? 1 : 0);
  const best = new Map<string, T>();
  for (const r of list) {
    if (/\bremix(es)?\b/i.test(r.title)) continue;
    const key = songBase(r.title);
    if (!key) continue;
    const had = best.get(key);
    const better = !had
      || Number(isVersion(had.title)) - Number(isVersion(r.title)) > 0
      || (isVersion(had.title) === isVersion(r.title) && (rank(r) - rank(had) || (r.fans ?? 0) - (had.fans ?? 0)) > 0);
    if (better) best.set(key, r);
  }
  const byFans = (a: T, b: T) => (b.fans ?? 0) - (a.fans ?? 0);
  const all = [...best.values()];
  return { albums: all.filter((r) => r.type === 'album').sort(byFans), singles: all.filter((r) => r.type !== 'album').sort(byFans) };
}

const norm = (s: string) => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)|\[.*?\]/g, ' ')
  .replace(/\b(feat|ft|featuring|with)\b.*$/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A mix from several artists' songs: round the artists in turn, never the same
 * artist twice running, at most `cap` songs each, no title twice.
 */
export function interleave(lists: CTrack[][], size: number, cap = 4): CTrack[] {
  const out: CTrack[] = [];
  const seen = new Set<string>();
  const used = new Map<number, number>();
  const pos = lists.map(() => 0);
  let progress = true;
  while (out.length < size && progress) {
    progress = false;
    for (let i = 0; i < lists.length && out.length < size; i++) {
      const list = lists[i];
      while (pos[i] < list.length) {
        const t = list[pos[i]++];
        const key = `${norm(t.artist)}|${norm(t.title)}`;
        if (seen.has(key) || (used.get(t.artistId) || 0) >= cap) continue;
        // Not the same artist twice running, unless no other artist has songs left.
        const othersLeft = lists.some((l, j) => j !== i && pos[j] < l.length);
        if (othersLeft && out.length && out[out.length - 1].artistId === t.artistId) { pos[i]--; break; }
        seen.add(key); used.set(t.artistId, (used.get(t.artistId) || 0) + 1);
        out.push(t); progress = true;
        break;
      }
    }
  }
  return out;
}

/**
 * A Daily Mix: the listener's artists (familiar, about 40%) and their related
 * artists (discovery, about 60%), woven together.
 */
export function buildMix(familiar: CTrack[][], discovery: CTrack[][], size = 50): CTrack[] {
  const fam = interleave(familiar, Math.round(size * 0.4), 6);
  const disc = interleave(discovery, size - fam.length, 3);
  // Weave: two discoveries, then a familiar song, so the mix stays recognisable throughout.
  const out: CTrack[] = [];
  let f = 0, d = 0;
  while (out.length < size && (f < fam.length || d < disc.length)) {
    for (let k = 0; k < 2 && d < disc.length; k++) out.push(disc[d++]);
    if (f < fam.length) out.push(fam[f++]);
  }
  // No artist twice running across the seam.
  for (let i = 1; i < out.length; i++) {
    if (out[i].artistId === out[i - 1].artistId) {
      const j = out.findIndex((t, k) => k > i && t.artistId !== out[i].artistId && t.artistId !== out[i - 1].artistId);
      if (j > 0) [out[i], out[j]] = [out[j], out[i]];
    }
  }
  return out;
}

/**
 * Group the listener's artists the way Daily Mixes are grouped: artists that
 * are related to one another share a mix. `related` maps an artist to the ids
 * Deezer calls related; at most `max` groups, largest first.
 */
export function clusterArtists(artists: CArtist[], related: Record<number, number[]>, max = 6): CArtist[][] {
  const ids = artists.map((a) => a.id);
  const parent = new Map<number, number>(ids.map((id) => [id, id]));
  const find = (x: number): number => { while (parent.get(x) !== x) x = parent.get(x)!; return x; };
  for (const a of ids) for (const b of related[a] || []) if (parent.has(b)) parent.set(find(a), find(b));
  // Two artists that share a related artist are neighbours too.
  const via = new Map<number, number>();
  for (const a of ids) for (const r of related[a] || []) {
    if (via.has(r)) parent.set(find(a), find(via.get(r)!)); else via.set(r, a);
  }
  const groups = new Map<number, CArtist[]>();
  for (const a of artists) { const root = find(a.id); groups.set(root, [...(groups.get(root) || []), a]); }
  const sorted = [...groups.values()].sort((x, y) => y.length - x.length);
  if (sorted.length <= max) return sorted;
  // Too many groups: the smallest join the last kept one.
  const kept = sorted.slice(0, max);
  for (const g of sorted.slice(max)) kept[max - 1] = [...kept[max - 1], ...g];
  return kept;
}

/** "Fally Ipupa, Ferre Gola and more": a mix's subtitle, from the artists it plays most. */
export function mixSubtitle(tracks: CTrack[], n = 3): string {
  const count = new Map<string, number>();
  for (const t of tracks) count.set(t.artist, (count.get(t.artist) || 0) + 1);
  const names = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([a]) => a);
  if (!names.length) return '';
  return count.size > names.length ? `${names.join(', ')} and more` : names.join(', ');
}

// ── Matching a song to its YouTube audio ─────────────────────────────────────

export interface YtCandidate { id: string; title: string; artist: string; duration: number }

const words = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 1));

/** How well a YouTube result matches the song: 0 (not it) to 1. */
export function matchScore(song: { title: string; artist: string; duration: number }, yt: YtCandidate): number {
  const want = words(song.title);
  if (!want.size) return 0;
  const have = words(`${yt.title} ${yt.artist}`);
  let hit = 0;
  for (const w of want) if (have.has(w)) hit++;
  const titleShare = hit / want.size;
  const artistOk = norm(`${yt.title} ${yt.artist}`).includes(norm(song.artist).split(' ')[0] || '');
  const dt = song.duration && yt.duration ? Math.abs(song.duration - yt.duration) : 0;
  const timeOk = !song.duration || !yt.duration ? 0.6 : dt <= 8 ? 1 : dt <= 25 ? 0.6 : 0.1;
  // Covers, karaoke and sped-up versions are not the song.
  const off = /\b(karaoke|instrumental|cover|sped up|slowed|nightcore|8d|remix)\b/i.test(yt.title) && !/\b(remix|instrumental)\b/i.test(song.title);
  if (off) return 0;
  return titleShare * 0.55 + (artistOk ? 0.3 : 0) + timeOk * 0.15;
}

/** The best YouTube match, or null when nothing is close enough to be the song. */
export function bestMatch(song: { title: string; artist: string; duration: number }, list: YtCandidate[], min = 0.62): YtCandidate | null {
  let best: YtCandidate | null = null; let bestS = 0;
  for (const c of list) { const s = matchScore(song, c); if (s > bestS) { best = c; bestS = s; } }
  return bestS >= min ? best : null;
}
