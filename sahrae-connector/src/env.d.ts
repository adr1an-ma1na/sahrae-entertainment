/// <reference types="vite/client" />

/**
 * Build-time configuration. Client IDs are public by design in a PKCE flow;
 * a client SECRET must never appear here — anything VITE_-prefixed is compiled
 * into the browser bundle.
 *
 * No index signature: vite/client's own ImportMetaEnv already declares one, and
 * adding a second is a duplicate-index-signature error (TS2374). These entries
 * merge with theirs.
 */
interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
  readonly VITE_YOUTUBE_CLIENT_ID?: string;
  readonly VITE_CONNECTOR_BACKEND?: string;
  readonly VITE_CONNECTOR_REDIRECT?: string;
}
