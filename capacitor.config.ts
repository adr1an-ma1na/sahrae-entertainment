import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sahrae.entertainment',
  appName: 'Sahrae Entertainment',
  webDir: 'dist',
  android: {
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
