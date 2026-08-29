import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * One build serves both targets: Vercel gets `dist/` as a static site, and
 * `cap sync android` copies the same `dist/` into the Android project. That is
 * what "single codebase, two artefacts" means here — build:pwa and
 * build:android differ only in what happens after this runs.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Sahrae Connections',
        short_name: 'Connections',
        description: 'Your Spotify and YouTube Music libraries in one place.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // The OAuth callback must always hit the network and must never be
        // served from a cached shell — a stale document there would replay an
        // old URL and lose the authorization code.
        navigateFallbackDenylist: [/^\/api\//, /^\/connect\/callback/],
        // Never cache provider API responses: they are per-user and short-lived,
        // and a cached library is a privacy problem on a shared device.
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
