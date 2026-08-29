/**
 * The unified schema every provider normalises into.
 *
 * NOTE — this file is the one part of Phase 1 written without the brief in hand
 * (sahrae-music-connector-brief.md was not in the repo). The field set below is
 * a reconstruction; reconcile it against the brief before Phase 2, because every
 * adapter and the whole UI type-check against it.
 *
 * Design rules it follows:
 *  - `id` is globally unique across providers, so merged lists never collide.
 *  - Provenance (`provider`) is carried on the track itself, because the UI has
 *    to badge every row with where it came from.
 *  - Playback is a DESCRIPTOR, not a URL. Which tier a track can be played at is
 *    a property of the track's licensing, so it travels with the track rather
 *    than being decided at the call site.
 */

export type ProviderId = 'spotify' | 'youtube' | 'apple' | 'deezer' | 'soundcloud';

/**
 * The three-tier playback model.
 *  1 — deep-link handoff: we hand the user to the provider's own app/site.
 *      The only tier implemented in Phase 1.
 *  2 — foreground embedded playback: the provider's own sanctioned embed/SDK,
 *      visible and foreground only. Phase 2.
 *  3 — Sahrae's own licensed catalog: we hold the rights, so we may stream it
 *      directly and play it in a native background service. Phase 3.
 */
export type PlaybackTier = 1 | 2 | 3;

export interface SahraeArtwork {
  url: string;
  width?: number;
  height?: number;
}

export interface PlaybackDescriptor {
  tier: PlaybackTier;
  /** Native app URI (spotify:track:…, vnd.youtube:…). Absent if none exists. */
  deepLink?: string;
  /** Always present — the fallback when the native app is not installed. */
  webUrl: string;
  /** Tier 2 only: the provider's sanctioned embed. Never populated in Phase 1. */
  embedUrl?: string;
  /**
   * Tier 3 only: a direct stream Sahrae is licensed to serve.
   *
   * This is NEVER populated from a third-party provider. Deriving one for
   * Spotify or YouTube content would mean circumventing their playback, which
   * is out of scope by constraint, not by schedule.
   */
  streamUrl?: string;
}

export interface SahraeTrack {
  /** `${provider}:${providerId}` — unique across every connected provider. */
  id: string;
  provider: ProviderId;
  /** The id as the provider knows it, for API calls back to that provider. */
  providerId: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs: number;
  artwork: SahraeArtwork[];
  /** Recording identifier, where the provider exposes one. The only reliable
   *  key for recognising the same recording across two providers. */
  isrc?: string;
  explicit?: boolean;
  /** When the user saved it, for library sorting. Epoch ms. */
  addedAt?: number;
  playback: PlaybackDescriptor;
}

export interface SahraePlaylistSummary {
  id: string;
  provider: ProviderId;
  providerId: string;
  name: string;
  description?: string;
  artwork: SahraeArtwork[];
  trackCount: number;
  owner?: string;
}

export interface SahraePlaylist extends SahraePlaylistSummary {
  tracks: SahraeTrack[];
}

/** What the UI should do when a track is activated. */
export type PlaybackAction =
  | { kind: 'deeplink'; deepLink?: string; webUrl: string; provider: ProviderId }
  | { kind: 'embed'; embedUrl: string; provider: ProviderId }
  | { kind: 'native'; streamUrl: string }
  | { kind: 'unavailable'; reason: string };

/** Convenience: the stable composite id used everywhere. */
export function sahraeId(provider: ProviderId, providerId: string): string {
  return `${provider}:${providerId}`;
}

/** Largest artwork at or above `min` px, else the largest available. */
export function pickArtwork(art: SahraeArtwork[], min = 300): string | undefined {
  if (!art.length) return undefined;
  const sorted = [...art].sort((a, b) => (b.width || 0) - (a.width || 0));
  return (sorted.find((a) => (a.width || 0) >= min) || sorted[0]).url;
}
