import type { PlaybackAction, PlaybackTier, ProviderId, SahraeTrack } from '../types/index.ts';

/**
 * Which tier a track actually plays at.
 *
 * Kept pure and separate from the players because this is where the licensing
 * boundary is decided, and a boundary that lives inside a React component is a
 * boundary nobody can test. Everything here is a function of the track and the
 * environment; nothing here touches the network or the DOM.
 *
 *   1 — hand off to the provider's own app
 *   2 — the provider's own sanctioned embed, foreground and visible
 *   3 — Sahrae's licensed catalog, direct stream (Phase 3; not built)
 */

export interface TierEnvironment {
  /** Tier 2 needs a DOM to put an iframe in. */
  canEmbed: boolean;
  /**
   * The listener's preference. Some people would rather always be thrown into
   * the real app; embedding is the default because it keeps them in Sahrae.
   */
  preferEmbed: boolean;
  /**
   * True when the page is backgrounded. Tier 2 is foreground-only, so starting
   * an embed while hidden is refused rather than started-and-immediately-paused.
   */
  hidden?: boolean;
}

export const DEFAULT_ENVIRONMENT: TierEnvironment = {
  canEmbed: typeof document !== 'undefined',
  preferEmbed: true,
  hidden: false,
};

/** Providers with a sanctioned embed we support. */
const EMBEDDABLE: ReadonlySet<ProviderId> = new Set<ProviderId>(['spotify', 'youtube']);

export function isEmbeddable(provider: ProviderId): boolean {
  return EMBEDDABLE.has(provider);
}

/**
 * Spotify's track embed. Full playback only for a listener with an active
 * Spotify Premium session in the same browser; everyone else gets Spotify's
 * own 30-second preview. That is Spotify's rule, enforced by Spotify — we
 * surface it in the UI rather than pretending otherwise.
 */
export function spotifyEmbedUrl(trackId: string): string {
  return `https://open.spotify.com/embed/track/${encodeURIComponent(trackId)}`;
}

/**
 * YouTube's IFrame player. `enablejsapi` is what lets us drive it; the rest
 * keeps YouTube's own chrome and related-video behaviour intact, because
 * stripping those is exactly the kind of modification their terms forbid.
 */
export function youtubeEmbedUrl(videoId: string, origin?: string): string {
  const p = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0' });
  if (origin) p.set('origin', origin);
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${p.toString()}`;
}

/** The embed URL for a track, or undefined when the provider has none. */
export function embedUrlFor(track: SahraeTrack, origin?: string): string | undefined {
  if (track.provider === 'spotify') return spotifyEmbedUrl(track.providerId);
  if (track.provider === 'youtube') return youtubeEmbedUrl(track.providerId, origin);
  return undefined;
}

/**
 * The highest tier this track may actually use right now.
 *
 * Tier 3 is returned only when the track itself carries a streamUrl, which the
 * schema permits solely for Sahrae's own licensed catalog. No third-party
 * adapter can produce one — that is enforced by the adapters never setting it,
 * and asserted in the tests.
 */
export function resolveTier(track: SahraeTrack, env: TierEnvironment): PlaybackTier {
  if (track.playback.tier === 3 && track.playback.streamUrl) return 3;

  const embedPossible =
    env.canEmbed
    && env.preferEmbed
    && !env.hidden
    && isEmbeddable(track.provider)
    && !!track.playback.embedUrl;

  return embedPossible ? 2 : 1;
}

/** The action the UI should take for a track, given the environment. */
export function resolveAction(track: SahraeTrack, env: TierEnvironment = DEFAULT_ENVIRONMENT): PlaybackAction {
  const tier = resolveTier(track, env);

  if (tier === 3) {
    return { kind: 'native', streamUrl: track.playback.streamUrl as string };
  }
  if (tier === 2 && track.playback.embedUrl) {
    return { kind: 'embed', embedUrl: track.playback.embedUrl, provider: track.provider };
  }
  return {
    kind: 'deeplink',
    deepLink: track.playback.deepLink,
    webUrl: track.playback.webUrl,
    provider: track.provider,
  };
}

/**
 * Why a track is not embedding, in words a listener can act on. Returns null
 * when it will embed. Used for the "opens in the app instead" hint.
 */
export function embedBlockedReason(track: SahraeTrack, env: TierEnvironment): string | null {
  if (!isEmbeddable(track.provider)) return 'This service has no in-app player.';
  if (!track.playback.embedUrl) return 'No embeddable version of this track.';
  if (!env.canEmbed) return 'In-app playback is not available here.';
  if (!env.preferEmbed) return 'In-app playback is switched off.';
  if (env.hidden) return 'In-app playback only runs while Sahrae is on screen.';
  return null;
}
