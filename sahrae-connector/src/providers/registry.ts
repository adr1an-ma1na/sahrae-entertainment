import type { ProviderId, SahraeTrack } from '../types/index.ts';
import { spotifyAdapter } from './spotify.ts';
import { youtubeAdapter } from './youtube.ts';
import { notImplemented, type ProviderAdapter } from './types.ts';

/**
 * Every source the connector knows about, live and stubbed.
 *
 * The stubs are real objects satisfying the interface, not `null` holes, so the
 * library screen renders all five providers and the merge/badge code is
 * exercised against more than the two that work.
 */

export const appleAdapter = notImplemented(
  'apple', 'Apple Music',
  'It needs MusicKit JS and a developer token rather than this OAuth flow.',
);
export const deezerAdapter = notImplemented(
  'deezer', 'Deezer',
  'Its OAuth flow does not support PKCE, so it has to run entirely through the backend.',
);
export const soundcloudAdapter = notImplemented(
  'soundcloud', 'SoundCloud',
  'API access requires an approved application registration.',
);

export const adapters: Record<ProviderId, ProviderAdapter> = {
  spotify: spotifyAdapter,
  youtube: youtubeAdapter,
  apple: appleAdapter,
  deezer: deezerAdapter,
  soundcloud: soundcloudAdapter,
};

export const allAdapters: ProviderAdapter[] = Object.values(adapters);
export const liveAdapters = (): ProviderAdapter[] => allAdapters.filter((a) => a.implemented);
export const connectedAdapters = (): ProviderAdapter[] => allAdapters.filter((a) => a.implemented && a.isConnected());

export function adapterFor(id: ProviderId): ProviderAdapter {
  return adapters[id];
}

/** The adapter that owns a `provider:id` composite. */
export function adapterForTrack(track: SahraeTrack): ProviderAdapter {
  return adapters[track.provider];
}

/**
 * Merge tracks from several providers into one list.
 *
 * Two things matter here. First, ordering: newest-saved first, with anything
 * lacking a save date after the dated entries rather than jumbled among them.
 *
 * Second, duplicates. The same song saved on two services is genuinely two
 * different playable things — different rights, different apps — so the merge
 * does NOT collapse them by default. `dedupeByIsrc` collapses recordings that
 * share an ISRC when a caller wants one row per song; the first provider in
 * `order` wins, so the caller controls which service represents the song.
 */
export function mergeTracks(
  lists: SahraeTrack[][],
  opts: { dedupeByIsrc?: boolean; order?: ProviderId[] } = {},
): SahraeTrack[] {
  const all = lists.flat();

  let out = all;
  if (opts.dedupeByIsrc) {
    const rank = new Map<ProviderId, number>((opts.order || []).map((p, i) => [p, i]));
    const best = new Map<string, SahraeTrack>();
    const passthrough: SahraeTrack[] = [];
    for (const t of all) {
      if (!t.isrc) { passthrough.push(t); continue; } // no ISRC → cannot claim it is the same recording
      const cur = best.get(t.isrc);
      if (!cur) { best.set(t.isrc, t); continue; }
      const a = rank.has(t.provider) ? rank.get(t.provider)! : Number.MAX_SAFE_INTEGER;
      const b = rank.has(cur.provider) ? rank.get(cur.provider)! : Number.MAX_SAFE_INTEGER;
      if (a < b) best.set(t.isrc, t);
    }
    out = [...best.values(), ...passthrough];
  }

  // Stable: equal-dated entries keep their input order.
  return out
    .map((t, i) => ({ t, i }))
    .sort((x, y) => {
      const ax = x.t.addedAt ?? -1;
      const ay = y.t.addedAt ?? -1;
      if (ax !== ay) return ay - ax;
      return x.i - y.i;
    })
    .map(({ t }) => t);
}
