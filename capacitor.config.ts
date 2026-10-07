import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sahrae.entertainment',
  appName: 'Sahrae Entertainment',
  webDir: 'dist',
  android: {
    // No native Capacitor plugins, exactly like the 7 June APK that runs on the
    // owner's phone. Every test build with a plugin in it (Haptics, Filesystem,
    // or both) took a 3 GB Android 14 test device down seconds after start-up;
    // every build without one ran. The web code works without them: song
    // downloads are stored in the WebView's IndexedDB (services/downloads.ts)
    // and a missing Haptics plugin just means no tap vibration.
    includePlugins: [],
    allowMixedContent: true,
    // Present as ordinary mobile Chrome. The default Android WebView UA carries
    // the "; wv" + "Version/4.0" markers, which some stream embeds (the live
    // sports players especially) detect and refuse to run inside, showing
    // "Remove sandbox attributes on the iframe tag". A clean Chrome UA makes
    // them treat us as a normal browser and play. Set here (applied during
    // WebView init) rather than post-hoc so it reliably takes effect.
    overrideUserAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
