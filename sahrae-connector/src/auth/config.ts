import type { ProviderId } from '../types/index.ts';

/**
 * Per-provider OAuth configuration.
 *
 * Client IDs only. They are public by design in a PKCE flow — the browser has to
 * send one to start the flow. Client SECRETS live exclusively in the backend's
 * environment and never reach this bundle.
 */
export interface ProviderOAuthConfig {
  id: ProviderId;
  displayName: string;
  authorizeEndpoint: string;
  scopes: string[];
  /** Extra authorize params this provider needs. */
  extraAuthParams?: Record<string, string>;
  /** False until the adapter is implemented — drives the UI's "coming soon". */
  implemented: boolean;
}

const env = (k: string): string => {
  try {
    return (import.meta.env?.[k] as string) || '';
  } catch {
    return '';
  }
};

/** Where the backend that holds the client secrets lives. */
export const BACKEND_URL: string = env('VITE_CONNECTOR_BACKEND') || 'http://localhost:8787';

/**
 * The redirect target. Must be registered verbatim with each provider.
 *
 * In the PWA this is a route on our own origin. In the APK, Capacitor serves the
 * app from https://localhost, and the same route works because the App plugin
 * hands us the URL — see oauthClient's `completeFromUrl`.
 */
export const REDIRECT_URI: string =
  env('VITE_CONNECTOR_REDIRECT') ||
  (typeof window !== 'undefined' ? `${window.location.origin}/connect/callback` : '');

export const PROVIDERS: Record<ProviderId, ProviderOAuthConfig> = {
  spotify: {
    id: 'spotify',
    displayName: 'Spotify',
    authorizeEndpoint: 'https://accounts.spotify.com/authorize',
    // Read-only. The connector never needs to modify anyone's library, and
    // asking for less is both faster to get approved and easier to justify.
    scopes: [
      'user-read-email',
      'user-library-read',
      'playlist-read-private',
      'playlist-read-collaborative',
    ],
    implemented: true,
  },
  youtube: {
    id: 'youtube',
    displayName: 'YouTube Music',
    authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    // Google only returns a refresh token when both are set, and only on the
    // first consent unless prompt=consent forces it.
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    implemented: true,
  },

  // ── Stubs ──
  // Registered so the UI, the registry and the adapter interface are all
  // exercised against more than the two live providers. Each has a real
  // authorize endpoint recorded so wiring one up later is filling in an adapter,
  // not rediscovering the protocol.
  apple: {
    id: 'apple',
    displayName: 'Apple Music',
    // Apple Music does not use OAuth 2 — it issues a user token via MusicKit,
    // signed with a developer token from an Apple Developer account. The adapter
    // will need MusicKit JS rather than this PKCE path.
    authorizeEndpoint: '',
    scopes: [],
    implemented: false,
  },
  deezer: {
    id: 'deezer',
    displayName: 'Deezer',
    // Deezer's flow is OAuth 2 but non-standard: it does not support PKCE and
    // returns the token from a GET, so it must go through the backend end to end.
    authorizeEndpoint: 'https://connect.deezer.com/oauth/auth.php',
    scopes: ['basic_access', 'offline_access'],
    implemented: false,
  },
  soundcloud: {
    id: 'soundcloud',
    displayName: 'SoundCloud',
    authorizeEndpoint: 'https://secure.soundcloud.com/authorize',
    scopes: ['non-expiring'],
    implemented: false,
  },
};

/** Client id for a provider, from the environment. */
export function clientId(id: ProviderId): string {
  return env(`VITE_${id.toUpperCase()}_CLIENT_ID`);
}
