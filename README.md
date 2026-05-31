# Sahrae Entertainment

Streaming app for movies, series, podcasts, and live audio. Vite + React 19 + TypeScript, Firebase auth/Firestore, HLS.js.

## Run locally (web)

Prerequisites: Node.js 20+

```
npm install
npm run dev
```

## Build the Android APK

Builds run on GitHub Actions on every push to `main`. The workflow is at [`.github/workflows/android.yml`](.github/workflows/android.yml) and produces a debug-signed APK as an artifact.

Download the most recent APK:

```
gh run download <run-id> --dir ./artifacts
```

Or via the web UI: **Actions → Build Android APK → latest run → Artifacts**.

### Locally (optional)

Requires Node 20, JDK 17, Android SDK with platform 34 + build-tools 34.0.0.

```
npm install
npm run build
npx cap add android        # only if android/ doesn't exist yet
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Capacitor

- `appId`: `com.sahrae.entertainment`
- `webDir`: `dist` (Vite output)
- Config: [`capacitor.config.ts`](capacitor.config.ts)
- The `android/` folder is gitignored — CI regenerates it via `npx cap add android` each build. Any native customisations need to be scripted into the workflow or kept as an overlay copied in after `cap add`.
