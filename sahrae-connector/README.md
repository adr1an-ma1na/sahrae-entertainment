# sahrae-connector

Connects Sahrae to the music services a listener already uses, reads their saved
music into one merged library, and hands playback back to the service that owns
it.

**Phases 1 and 2 are complete.** Phase 3 is deliberately not started — see
[Scope](#scope).

---

## What this is

| Layer | Path | Does |
|---|---|---|
| Schema | `src/types/` | `SahraeTrack` — the shape every provider normalises into |
| Auth | `src/auth/` | OAuth 2.0 PKCE: verifier/challenge, state check, token store, refresh |
| Backend | `api/`, `backend/core.js` | Token exchange + refresh. **The only place client secrets exist**. Same-origin Vercel function |
| Providers | `src/providers/` | One adapter per service, all behind one interface |
| Playback | `src/playback/` | Tier selection, Tier 1 hand-off, Tier 2 embeds, foreground guard |
| UI | `src/library-ui/` | Connect screen, merged library, embedded player |
| Shell | `index.html`, `src/main.tsx` | Standalone app, deployed to Vercel |

### Providers

| Service | Status | Notes |
|---|---|---|
| Spotify | **Live** | Web API. Read-only scopes |
| YouTube Music | **Live** | Data API v3. Library = Liked videos |
| Apple Music | Stub | Needs MusicKit JS + a developer token, not this OAuth flow |
| Deezer | Stub | Its OAuth does not support PKCE; must run fully server-side |
| SoundCloud | Stub | API access requires an approved application |

Stubs are real objects implementing `ProviderAdapter`, not `null` holes, so the
UI renders all five and the merge/badge paths are exercised against more than
the two that work.

---

## The three-tier playback model

| Tier | What | Status |
|---|---|---|
| **1** | Deep-link handoff — open the track in the provider's own app, falling back to its website | **Implemented** |
| **2** | Foreground embedded playback via the provider's sanctioned embed | **Implemented** |
| **3** | Sahrae's own licensed catalog — direct stream, native background service | Not started |

Which tier a track *can* use is a property of its licensing, so it travels on the
track (`track.playback.tier`) rather than being decided at the call site.

`streamUrl` is **only ever** populated for Tier 3 content Sahrae is licensed to
serve. It is never derived for a third-party provider — that would mean
circumventing their playback, which is out of scope by constraint, not by
schedule.

### Tier 2 — how it works

Each provider's own player runs in an iframe. They serve the audio, so
entitlement, ads and reporting all stay theirs and the play still counts for the
artist.

- **Spotify** — the Embed IFrame API. What a listener hears is Spotify's call: an
  active Premium session in the same browser gets full tracks, everyone else gets
  Spotify's 30-second preview. The UI says so rather than implying we can do
  better. The Web Playback SDK is deliberately *not* used — it would need the
  `streaming` scope and a Premium device registration, far more access than
  reading a library justifies.
- **YouTube** — the IFrame Player API, with the player visible. An uploader can
  disable embedding; that only surfaces at load time as error 101/150, so the
  player reports it and the track falls back to Tier 1.

Two rules are enforced in code, not left to review:

1. **Foreground only.** `ForegroundGuard` pauses playback when the page stops
   being visible. Background playback of provider content is out of scope, and
   it is the specific behaviour that gets apps removed. Returning to the app
   *offers* a resume rather than restarting by itself — audio that starts on its
   own in a room you have just walked into is a bad surprise.
2. **The player stays visible.** `checkEmbedVisible` fails loudly in development
   if the container is hidden, transparent or smaller than 200×200. Shrinking an
   embed to get audio-only playback is a terms violation and an easy one to
   introduce by accident.

A listener who would rather always be thrown into the real app can be given
`preferEmbed: false`; the same track then resolves to Tier 1.

---

## Setup

### 1. Register the app with each provider

Both need the redirect URI registered **character for character**.

- **Spotify** — <https://developer.spotify.com/dashboard> → Create app.
  Redirect URI: `http://localhost:3000/connect/callback` for local work
  (`vercel dev` serves on :3000).
  A new app is in *development mode*: only accounts you add to its allow-list can
  authorise it. Everyone else gets a 403 that looks like a bug and is not one.
- **YouTube** — Google Cloud console → enable **YouTube Data API v3**, then
  Credentials → OAuth client ID → Web application. Add the same redirect URI.
  The `youtube.readonly` scope is *sensitive*: fine for test users, but a public
  app needs Google's verification.

### 2. Configure

```bash
cp .env.example .env
```

Fill in the four values. The rule that matters:

> `VITE_*` variables are compiled into the browser bundle. Client **IDs** belong
> there — a PKCE client has to send one. Client **SECRETS** never do.

### 3. Run

```bash
npm install
npm run dev:backend    # :8787 — holds the secrets
npm run dev            # :5173 — the app
```

Check the backend sees its credentials:

```bash
curl -s http://localhost:8787/health
```

---

## Building

```bash
npm run build:pwa
```

Type-checks, then produces an installable PWA in `dist/`.

```bash
npm run build:android
```

Same web build, then `cap sync android` copies it into the Android project.

First time only:

```bash
npm run android:add
```

Then `npm run android:apk` (APK) or `npm run android:aab` (Play Store bundle),
or `npm run android:open` to build from Android Studio.

### Android deep links

The OAuth redirect returns to the app as an App Link. After `cap add android`,
add an intent-filter to `android/app/src/main/AndroidManifest.xml` inside the
main `<activity>`:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="YOUR_HOST" android:pathPrefix="/connect/callback" />
</intent-filter>
```

Tier 1 launches `spotify:` and `vnd.youtube:` URIs. Android 11+ hides other
installed apps unless they are declared, so add a `<queries>` block as a sibling
of `<application>` — without it the deep link silently fails and every hand-off
falls back to the browser:

```xml
<queries>
  <package android:name="com.spotify.music" />
  <package android:name="com.google.android.youtube" />
</queries>
```

---

## Testing

```bash
npm test
```

135 assertions, no network. Covers the parts that are easy to get wrong and
expensive to get wrong:

- **PKCE** — including the RFC 7636 §A test vector, so the challenge derivation
  is checked against the spec rather than against itself
- **Normalisation** — Spotify and YouTube payloads into `SahraeTrack`, including
  the entries that must be *rejected*: local files, catalogue tombstones,
  removed-video placeholders
- **Merge** — ordering, and that the same recording on two services is kept as
  two rows unless a caller explicitly asks to collapse by ISRC
- **Tier 1** — that the fallback fires when no app responds, does *not* fire when
  one does, and cannot double-open if the timer lands late
- **Configuration guards** — that the Android misconfiguration is detected on
  native, stays quiet on web, and does not throw without a `window`. This one
  exists because the guard shipped once as dead code: defined, called by
  nothing, while the docs claimed it ran at startup
- **Tier selection** — the licensing boundary: that a hidden page never starts an
  embed, that a provider without a sanctioned embed falls to Tier 1, and that
  Tier 3 is unreachable without a Sahrae-owned `streamUrl` no adapter can produce
- **Foreground guard** — that backgrounding pauses once rather than three times,
  that an idle page is unaffected, and that returning offers a resume instead of
  auto-playing

The backend has its own suites — 43 for the shared core, 16 driving the Vercel
function with Vercel-shaped req/res, and 21 driving the Worker's fetch handler
with real `Request` objects. All three are offline, verified by stubbing
`fetch` to throw: zero outbound calls. Both were also confirmed by running the Express server and calling it:
`/health` reports per-provider config, unknown providers 404, malformed or
missing parameters 400, unconfigured providers 500 naming the variable to set,
and a disallowed `Origin` is refused 403 with no CORS header granting access.

`npm test` runs all five suites: 141 + 43 + 45 + 16 + 21 = 266 assertions, every one offline (verified by stubbing `fetch` to throw).

---

## Deploying

**Vercel** — one project serving the app and its token-exchange API from the same
origin.

```bash
cd sahrae-connector
npx vercel        # first run links the project
npx vercel --prod
```

Vercel reads `vercel.json`: it runs `npm run build:pwa` and serves `dist/`.

### The rewrite that makes OAuth work

```json
{ "source": "/((?!api/).*)", "destination": "/index.html" }
```

Without it Vercel 404s on any path with no matching file — including
`/connect/callback`, so the redirect would die before the app ever loaded. The
`api/` exclusion keeps serverless functions routing normally.

There is no router in the app. `ConnectorScreen` completes the flow by reading
`?code=` off whatever URL it loads at, so the rewrite is the only routing needed;
a router would just be a second place that has to agree what the callback path is.

### After the first deploy

In **Vercel → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | from the Spotify dashboard |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | from Google Cloud |
| `VITE_SPOTIFY_CLIENT_ID` / `VITE_YOUTUBE_CLIENT_ID` | the same client IDs, public |
| `VITE_CONNECTOR_REDIRECT` | `https://<your-app>.vercel.app/connect/callback` |
| `VITE_CONNECTOR_BACKEND` | leave **empty** — same-origin |

Then add that redirect URI at **both** providers, character for character, and
**redeploy**: `VITE_*` values are compiled into the bundle at build time, not
read at runtime, so changing one without rebuilding changes nothing.

### Android

`VITE_CONNECTOR_BACKEND` **must** be the absolute deployment URL for the APK.
Capacitor serves the app from `https://localhost`, so the same-origin default
used on the web would resolve `/oauth/…` against that and hit nothing.

```bash
VITE_CONNECTOR_BACKEND=https://your-app.vercel.app npm run build:android
```

This is enforced twice, at different costs of being wrong:

- **`build:android` refuses to run** without it. `scripts/check-android-env.mjs`
  rejects an unset value, a non-https URL, a localhost host, a trailing slash
  (which would produce `//oauth/…` and miss the rewrite), and anything that is
  not a URL. A broken APK is never produced, which beats discovering it after
  shipping.
- **`backendMisconfigured()` reports it at runtime** for a bundle built some
  other way — shown as a banner, with the Connect buttons disabled, because
  starting a sign-in that cannot complete strands the user mid-redirect.

### Token exchange runs same-origin

`api/oauth/[provider]/[action].js` is a Vercel serverless function reusing
`backend/core.js` unchanged — the payoff from keeping that module
framework-free. `vercel.json` rewrites `/oauth/:path*` onto it.

Same-origin means **there is no CORS at all**: no allow-list to keep in sync
across two hosts, no preflight, no cross-origin surface, and nothing in the CSP's
`connect-src` beyond `'self'` and the two provider APIs the browser calls
directly. The function emits no `Access-Control-*` headers by design — if it ever
needs to serve another origin, that should be a decision made explicitly rather
than inherited from a permissive default.

**The rewrite order matters.** `/oauth/:path*` is listed *before* the SPA
fallback, because Vercel matches in order and the fallback would otherwise
swallow it and return `index.html`. The fallback's pattern excludes both `api/`
and `oauth/` as a second line of defence.

Token responses are sent `Cache-Control: no-store` — they carry credentials, and
neither the browser nor Vercel's edge should hold them.

### Cloudflare Worker (alternative)

`backend/worker.js` is a complete, tested equivalent for Cloudflare Workers, kept
because it costs nothing to keep and it is the right answer if the frontend ever
moves off Vercel. It shares `core.js`, so both are covered by the same tests.

To use it: deploy with `cd backend && npx wrangler deploy`, set the secrets with
`wrangler secret put`, add the app origin to `ALLOWED_ORIGINS` in
`wrangler.toml`, and set `VITE_CONNECTOR_BACKEND` to the Worker URL. Note that
this reintroduces CORS, which same-origin removes.

### Security headers

`vercel.json` sets `X-Frame-Options: DENY` and `frame-ancestors 'none'` — an
attacker framing the connect screen could otherwise trick someone into
authorising a provider. The CSP's one permissive directive is `frame-src`,
limited to the two sanctioned embed origins, which is exactly Tier 2 and nothing
else. `media-src 'none'` is deliberate: this app must never play media itself,
so the browser is told to refuse it.

---

## Running locally

```bash
npm run dev
```

`vercel dev` serves the Vite app and the `/api` functions on one origin — the
same shape as production, so the same-origin path is what you actually exercise
locally. It reads `.env`.

`npm run dev:vite` runs Vite alone (no token exchange), and `npm run dev:express`
starts the Express server on :8787 if you want to debug the exchange in a plain
Node process — set `VITE_CONNECTOR_BACKEND=http://localhost:8787` for that.

---

## Security notes

**Client secrets never reach the frontend.** The browser starts the PKCE flow
with a public client ID; the backend performs the code exchange and refresh.

**State is verified on the redirect.** Without it, an attacker can feed their own
authorization code to your callback and quietly connect the user's Sahrae to the
attacker's account.

**CORS is an allow-list**, not `*`. An open policy would let any site drive token
exchange using our secret.

### Refresh-token custody

The refresh token is the long-lived credential — Google's does not expire at
all. It is **not** given to the browser.

When `SESSION_SECRET` is set, the server seals the refresh token with AES-GCM and
returns it as an httpOnly cookie: `HttpOnly; Secure; SameSite=Lax; Path=/oauth`.
Script on the page cannot read it, the browser attaches it automatically on
refresh, and the client only ever stores a short-lived access token. Rotating
`SESSION_SECRET` invalidates every session at once, which is a usable revocation
switch. `/health` reports `refreshCustody: "cookie"`.

Without `SESSION_SECRET` the server falls back to returning the token to the
client — the older, weaker behaviour — and `/health` says `"client"` with a hint.
It degrades loudly rather than silently.

**What this does not fix.** XSS on the app origin can still *call* the refresh
endpoint, because the browser attaches the cookie for it, and get an access token
that way. What it can no longer do is take the permanent grant and reuse it later
from somewhere else. That is the difference between an incident you end by
rotating a secret and one you cannot end at all.

**Native.** In the APK the backend is necessarily cross-origin, so this should
move to secure platform storage (Keychain / EncryptedSharedPreferences) rather
than `localStorage`. Not done — flagged in `src/auth/tokenStore.ts`.

---

## Scope

Not built, by constraint rather than by schedule:

- **No audio extraction** from any third-party service.
- **No background playback** of Spotify or YouTube content — enforced by
  `ForegroundGuard`, not merely intended.
- **No replication of another app's branding.** `ProviderBadge` is a neutral
  two-letter chip in Sahrae's own palette — not a logo, wordmark or brand colour.
  A Spotify-green pill implies an endorsement that does not exist.

Phase 3 (owned catalog + native background service) needs explicit sign-off
before starting. It is the only tier that may legitimately stream audio Sahrae
serves itself, and the only one that may play in the background — because by
then the rights are ours.

---

## One open item

`src/types/index.ts` was written **without `sahrae-music-connector-brief.md`** —
it was not in the repo when this was built. The field set is a reconstruction
from the architecture described in the task.

Every adapter and the whole UI type-check against it, so reconcile it with the
brief before Phase 2. If the brief's `SahraeTrack` differs, the changes land in
one file plus the two `toSahraeTrack` functions.
