import type {
  PlaybackAction, ProviderId, SahraePlaylist, SahraePlaylistSummary, SahraeTrack,
} from '../types/index.ts';

/**
 * The contract every music source implements — the live ones and the stubs
 * alike. The UI only ever talks to this, so adding Deezer later is writing one
 * file, not touching the library screen.
 */
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly displayName: string;
  /** False for a stub. The UI shows these greyed with "coming soon". */
  readonly implemented: boolean;

  isConnected(): boolean;
  /** Returns the authorize URL to send the user to; it does not navigate. */
  beginConnect(): Promise<string>;
  disconnect(): void;

  searchTracks(query: string, limit?: number): Promise<SahraeTrack[]>;
  getUserLibrary(limit?: number): Promise<SahraeTrack[]>;
  getUserPlaylists(limit?: number): Promise<SahraePlaylistSummary[]>;
  getPlaylist(playlistId: string): Promise<SahraePlaylist>;

  /**
   * What should happen when the user activates this track.
   *
   * Async because a real Tier 3 lookup will need to ask whether Sahrae holds
   * rights to the recording. In Phase 1 every implementation returns Tier 1.
   */
  resolvePlaybackAction(track: SahraeTrack): Promise<PlaybackAction>;
}

/** Thrown when a provider says no. Carries enough for the UI to explain itself. */
export class ProviderError extends Error {
  readonly provider: ProviderId;
  readonly status?: number;
  constructor(message: string, provider: ProviderId, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
  }
}

/** A stub adapter: satisfies the interface, refuses every call, honestly. */
export function notImplemented(id: ProviderId, displayName: string, note: string): ProviderAdapter {
  const refuse = (): never => { throw new ProviderError(`${displayName} is not connected yet. ${note}`, id); };
  return {
    id,
    displayName,
    implemented: false,
    isConnected: () => false,
    beginConnect: async () => refuse(),
    disconnect: () => { /* nothing stored */ },
    searchTracks: async () => [],
    getUserLibrary: async () => [],
    getUserPlaylists: async () => [],
    getPlaylist: async () => refuse(),
    resolvePlaybackAction: async () => ({ kind: 'unavailable', reason: `${displayName} is not connected yet.` }),
  };
}
