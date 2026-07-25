import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  // GitHub Pages serves a project site from /<repo>/, so assets need that
  // prefix. The Android/Capacitor build and Firebase Hosting both serve from
  // the root, and a prefix there would break every asset URL — so this is opt-in
  // via an env var that ONLY the Pages workflow sets.
  const base = process.env.GH_PAGES === '1' ? '/sahrae-entertainment/' : '/';

  return {
    base,
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['pwa-icon.svg'],
        workbox: {
          // The app shell is split into vendor chunks (see manualChunks below),
          // but three.js alone still lands near the 2 MiB default. 4 MiB keeps
          // every chunk precached instead of silently failing the build.
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // Never precache the streaming/native bridge or third-party embeds —
          // only our own shell assets belong in the service worker.
          navigateFallbackDenylist: [/^\/__/],
        },
        manifest: {
          name: 'Sahrae Entertainment',
          short_name: 'Sahrae',
          description: 'The ultimate streaming experience for movies, series, and live audio.',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          // Must match `base`, or the installed app opens at the wrong path and
          // the service worker's scope will not cover the pages it serves.
          scope: base,
          start_url: base,
          orientation: 'any',
          icons: [
            {
              src: 'pwa-icon.svg',
              sizes: '192x192',
              type: 'image/svg+xml'
            },
            {
              src: 'pwa-icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml'
            },
            {
              src: 'pwa-icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        // shadcn-style alias → src (so `@/components/ui/...` resolves correctly).
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // A single 2.45 MB chunk was being emitted, which both failed the PWA
      // precache step and forced every user to parse the whole app — including
      // three.js and the Firebase SDK — before the first frame. Splitting the
      // heavy, rarely-changing vendors into their own chunks lets the browser
      // cache them across releases and lets the shell paint sooner. This matters
      // most on the low-end Android TV boxes the app targets.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-three': ['three'],
            'vendor-media': ['hls.js'],
            'vendor-motion': ['motion'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
