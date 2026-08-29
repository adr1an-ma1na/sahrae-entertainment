/**
 * Refuse to build an Android bundle that cannot reach its backend.
 *
 * Token exchange is same-origin by default: the app calls `/oauth/…` and Vercel
 * rewrites it onto the serverless function. That is correct for web and wrong
 * for Android — Capacitor serves the app from `https://localhost`, so a
 * relative path resolves against that and hits nothing.
 *
 * Detecting this at runtime (see backendMisconfigured) tells the user their app
 * is broken. Detecting it here means the broken app is never built. Failing at
 * the point of the mistake beats reporting it after shipping.
 *
 * Run by `npm run build:android` before vite build.
 */

const url = process.env.VITE_CONNECTOR_BACKEND?.trim();

const die = (msg) => {
  console.error(`\n  Android build stopped: ${msg}\n`);
  console.error('  Capacitor serves the app from https://localhost, so the same-origin');
  console.error('  default used on the web resolves to nothing in the APK.\n');
  console.error('  Set it to the absolute deployment URL, e.g.\n');
  console.error('    VITE_CONNECTOR_BACKEND=https://your-app.vercel.app npm run build:android\n');
  console.error('  or add it to .env before building.\n');
  process.exit(1);
};

if (!url) die('VITE_CONNECTOR_BACKEND is not set.');

let parsed;
try {
  parsed = new URL(url);
} catch {
  die(`VITE_CONNECTOR_BACKEND is not a valid URL: ${url}`);
}

// http would be blocked as cleartext by the Capacitor config anyway, and an
// OAuth token exchange must never travel unencrypted.
if (parsed.protocol !== 'https:') die(`VITE_CONNECTOR_BACKEND must be https, got ${parsed.protocol}//`);

// localhost is the specific mistake this check exists to catch: it is what the
// web default effectively becomes inside the WebView.
if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname)) {
  die(`VITE_CONNECTOR_BACKEND points at ${parsed.hostname}, which inside the APK is the app itself.`);
}

// A trailing slash would produce "https://host//oauth/..." — harmless on most
// servers, but Vercel's rewrite matches on the exact path and would miss.
if (url.endsWith('/')) die('VITE_CONNECTOR_BACKEND must not end in a slash — the app appends /oauth/…');

console.log(`  Android backend: ${url}`);
