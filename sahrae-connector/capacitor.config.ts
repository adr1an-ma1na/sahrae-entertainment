import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for the connector module.
 *
 * One web build (`dist/`) is both the PWA bundle and the asset payload copied
 * into the Android project, which is what "single codebase, two artefacts"
 * means in practice — `npm run build:pwa` and `npm run build:android` share a
 * `vite build` and differ only in what happens afterwards.
 */
const config: CapacitorConfig = {
  appId: 'com.sahrae.connector',
  appName: 'Sahrae Connector',
  webDir: 'dist',

  android: {
    // Cleartext stays off: every endpoint here is https, and the OAuth redirect
    // must never be interceptable.
    allowMixedContent: false,
  },

  server: {
    androidScheme: 'https',
  },

  plugins: {
    /**
     * OAuth redirects come back to the app as an App Link. The matching
     * intent-filter has to be added to AndroidManifest.xml after `cap add
     * android` — see README, "Android deep links".
     */
    App: {},
  },
};

export default config;
