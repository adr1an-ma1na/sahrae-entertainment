/**
 * sahrae-connector — public surface.
 *
 * Everything a host app needs to mount the connector. Import from here rather
 * than reaching into subdirectories, so internals can move without breaking the
 * host.
 */

// Schema
export type {
  PlaybackAction, PlaybackDescriptor, PlaybackTier, ProviderId,
  SahraeArtwork, SahraePlaylist, SahraePlaylistSummary, SahraeTrack,
} from './types/index.ts';
export { pickArtwork, sahraeId } from './types/index.ts';

// Adapters
export type { ProviderAdapter } from './providers/types.ts';
export { ProviderError } from './providers/types.ts';
export {
  adapterFor, adapterForTrack, adapters, allAdapters,
  connectedAdapters, liveAdapters, mergeTracks,
} from './providers/registry.ts';
export { spotifyAdapter } from './providers/spotify.ts';
export { youtubeAdapter } from './providers/youtube.ts';

// Auth
export { BACKEND_URL, PROVIDERS, REDIRECT_URI } from './auth/config.ts';
export {
  beginAuth, completeFromUrl, disconnect, getAccessToken,
  OAuthError, providerFetch, refresh,
} from './auth/oauthClient.ts';
export { isConnected, subscribe as subscribeToTokens } from './auth/tokenStore.ts';

// Playback (Tier 1 only in Phase 1)
export { launch, launchWith, type LaunchResult } from './playback/tier1.ts';

// UI
export { default as ConnectorScreen } from './library-ui/ConnectorScreen.tsx';
export { default as ProviderBadge, providerName } from './library-ui/ProviderBadge.tsx';
