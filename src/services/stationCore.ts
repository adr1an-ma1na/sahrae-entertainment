/**
 * Up next, the way Spotify's radio decides it (owner, 2026-11-19: "the up next
 * from selecting a song isn't good … have the Spotify algorithm processing").
 *
 * Spotify's radio is three steps: gather candidates from what people play
 * together, score them for this listener, then order them so the station
 * flows. Sauti does the same with what it has:
 *
 *   Gather   Deezer's own radio for the artist (its listeners' co-plays: the
 *            strongest signal), the radios of the two closest related artists,
 *            the related artists' best known songs, and a few of the artist's
 *            own (their songs only, not features on other people's).
 *   Score    a song more sources agree on is closer; well-known songs a little
 *            higher; the artists this listener plays and likes higher, the ones
 *            they skip lower; "Not interested", other versions of a song and
 *            what was just played left out; a little chance, so no two stations
 *            from one song are the same.
 *   Order    the closest first, widening as it goes; never one artist twice
 *            running nor twice in any four; each artist a few times at most.
 *   Learn    a quick skip moves that artist's radio songs later; two, and they
 *            leave this station (afterSkip).
 *
 * What Sauti cannot do as Spotify does: it has no audio analysis (tempo, mood)
 * of songs, so the flow is by artists and listening, not by sound.
 * Pure, tested in station-check.mjs.
 */
import { isVersion, songBase, type CTrack } from './curate.ts';
import { artistKey } from './taste.ts';

export type Source = 'radio' | 'near' | 'related' | 'own';
/** How much a source says "this belongs here". */
export const SOURCE_WEIGHT: Record<Source, number> = { radio: 1, own: 0.75, near: 0.7, related: 0.55 };

export interface StationInput {
  seedArtistId: number;
  sources: { source: Source; tracks: CTrack[] }[];
  /** The listener's artists: artistKey → weight (taste.weigh). */
  taste?: Map<string, number>;
  /** Quick skips per artist (the log's, faded, and this session's). */
  skips?: Map<string, number>;
  banned?: Set<string>;
  /** Songs not to offer (songBase): queued already, or just played. */
  avoid?: Set<string>;
  count: number;
  /** Artists heard just before the station starts (the song it plays on from): not straight away again. */
  justHeard?: number[];
  rng?: () => number;
}

export interface Scored { t: CTrack; score: number; evidence: number; sources: Source[] }

/** Every candidate once, scored for this listener, best first. */
export function scoreCandidates(input: StationInput): Scored[] {
  const byKey = new Map<string, Scored>();
  for (const { source, tracks } of input.sources) {
    const n = Math.max(1, tracks.length);
    tracks.forEach((t, i) => {
      if (!t || !t.title || isVersion(t.title)) return;
      const base = songBase(t.title);
      if (!base || input.avoid?.has(base)) return;
      const ak = artistKey(t.artist);
      if (!ak || input.banned?.has(ak)) return;
      // Earlier in a source is stronger (a radio lists its closest first).
      const w = SOURCE_WEIGHT[source] * (1 - Math.min(0.5, i / (n * 2)));
      const k = `${base}|${ak}`;
      const cur = byKey.get(k);
      if (!cur) { byKey.set(k, { t, score: 0, evidence: w, sources: [source] }); return; }
      // Another source agreeing adds weight; the same source twice does not.
      if (!cur.sources.includes(source)) { cur.evidence += w * 0.6; cur.sources.push(source); }
      else cur.evidence = Math.max(cur.evidence, w);
    });
  }
  const rng = input.rng ?? Math.random;
  for (const s of byKey.values()) {
    const ak = artistKey(s.t.artist);
    const pop = s.t.rank ? Math.min(1, Math.log10(s.t.rank + 1) / 6) : 0.4;
    const taste = Math.tanh((input.taste?.get(ak) || 0) / 6);
    const skips = Math.min(1, (input.skips?.get(ak) || 0) / 2);
    s.score = s.evidence + 0.45 * pop + 0.5 * taste - 0.9 * skips + rng() * 0.12;
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

/** The station's order: best first, never one artist twice running nor twice in four, a few each at most. */
export function sequence(scored: Scored[], count: number, seedArtistId: number, justHeard: number[] = []): CTrack[] {
  const out: CTrack[] = [];
  // What played just before counts for the spacing, not the count.
  const before = justHeard.map((artistId) => ({ artistId }) as CTrack);
  const used = new Map<number, number>();
  const pool = [...scored];
  const cap = (id: number) => (id === seedArtistId ? Math.max(2, Math.ceil(count / 10)) : Math.max(2, Math.ceil(count / 20)));
  while (out.length < count && pool.length) {
    let pick = -1;
    // Strict first, then loosened a step at a time: the cap goes first, then the
    // spacing, and one artist twice running only when nothing else is left.
    for (let pass = 0; pass < 4 && pick < 0; pass++) {
      const gap = pass <= 1 ? 3 : pass === 2 ? 1 : 0;
      let fewest = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const t = pool[i].t;
        if (gap && [...before, ...out].slice(-gap).some((x) => x.artistId === t.artistId)) continue;
        const u = used.get(t.artistId) || 0;
        if (pass === 0) {
          if (u >= cap(t.artistId)) continue;
          pick = i;
          break;
        }
        // Past the caps: shared out, the artist heard least so far (the best of theirs).
        if (u < fewest) { fewest = u; pick = i; }
      }
    }
    if (pick < 0) break;
    const [{ t }] = pool.splice(pick, 1);
    out.push(t);
    used.set(t.artistId, (used.get(t.artistId) || 0) + 1);
  }
  return out;
}

export const rankStation = (input: StationInput): CTrack[] => sequence(scoreCandidates(input), input.count, input.seedArtistId, input.justHeard);

/**
 * An artist's own songs from their "top" list, which also carries songs they
 * only feature on (Shakira's "Dai Dai" as Burna Boy's): those belong to the
 * lead artist. All of them when too few are their own.
 */
export function leadOnly(list: CTrack[], artistId: number, min = 4): CTrack[] {
  const own = list.filter((t) => t.artistId === artistId);
  return own.length >= min ? own : list;
}

/**
 * After a quick skip of `artist`: what is still to come, their station songs
 * moved to the end (once) or out (twice or more). Songs the listener queued
 * themselves stay where they are.
 */
export function afterSkip<T extends { artist: string; via?: string }>(upcoming: T[], artist: string, times: number): T[] {
  const ak = artistKey(artist);
  const theirs = (t: T) => t.via === 'radio' && artistKey(t.artist) === ak;
  const rest = upcoming.filter((t) => !theirs(t));
  return times >= 2 ? rest : [...rest, ...upcoming.filter(theirs)];
}

/** One song's outcome as the listener's verdict: a quick skip (3 to 30 s, not half a short song). */
export function wasSkipped(listened: number, duration: number): boolean {
  const played = listened >= 30 || (duration > 0 && listened >= duration * 0.5);
  return !played && listened >= 3;
}
