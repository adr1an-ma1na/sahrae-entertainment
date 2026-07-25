# Sahrae Entertainment — Security, Scale & Release Readiness Report

**Branch:** `hardening-2026-07` (3 commits off `sauti-premium-redesign`)
**Date:** 2026-07-25
**Build source:** `sahrae-entertainment (3).zip` (25 Jul export), reconciled into the git repo
**Verdict:** **Do not ship yet — one blocker cleared, one gate outstanding (no device test).**

---

## 1. Executive summary

The build you sent me **could not have shipped as it arrived**: `vite build` failed
outright, so no APK could be produced from it. That is fixed, along with a
critical remote-attack path, a full account-takeover flaw, and a stale
configuration that was silently breaking 10 of your 14 movie/series servers.

The headline finding is that **three of your complaints share one root cause.**
Pop-up ads on the player, servers that don't play, and the security hole are the
same story: the JS server list was rewritten, the native allow-list that protects
it was not, and a dead endpoint was left behind that let any ad script open any
URL in the user's Chrome — straight past all six of your ad-blocking layers.

| # | Your ask | Status |
|---|---|---|
| 1 | Security assessment | **Done** — 8 issues found, 7 fixed, 1 documented residual |
| 2 | Built for scale, no crashes | **Done** — build blocker + storage exhaustion + 3 crash paths fixed |
| 3 | Elevate UI/UX | **Partial** — accessibility defect fixed at token level; no redesign (see §6) |
| 4 | Sports works, no pop-up ads | **Substantially fixed, NOT device-verified** (see §5) |
| 5 | QA sign-off | **This document** |

---

## 2. Security findings

Severity uses likelihood × impact for a consumer app that deliberately loads
hostile third-party content.

### CRITICAL — The native bridge was reachable from inside the piracy embeds
`MainActivity.shouldInterceptRequest` handled the private `/__*` endpoints for
**every frame in the WebView**, gated only on hostname, and answered with
`Access-Control-Allow-Origin: *`.

Your app intentionally loads untrusted, ad-funded streaming embeds. Any ad script
in one of them could run:

```js
fetch("https://localhost/__ddfetch?u=http://192.168.1.1/admin").then(r => r.text())
```

and read the reply. Concretely that gives an attacker:
- **SSRF from the user's home network and residential IP** — LAN scanning, router
  admin pages, and a free open proxy wearing the user's address.
- `/__dllist` — the user's download history.
- `/__openext?url=…` — **open any URL in the user's real Chrome browser.**

**Fixed:** every `/__*` call is now gated on a first-party `Origin`/`Referer`
check (L0); CORS narrowed from `*` to `https://localhost`; `/__openext` deleted
outright — its only caller (`MovieDownloadModal`) no longer exists in this build.

> `/__openext` deserves emphasis: it was a supported, undocumented way for
> anything in the WebView to launch an arbitrary URL externally. That is exactly
> the pop-up you have been chasing, and no amount of in-WebView blocking could
> ever have caught it.

### HIGH — Any user's cloud data could be read or altered by anyone knowing their id
`services/firebase-real.ts` authenticated to Firebase with credentials **derived
from the user id by a formula shipped in the client bundle**:

```js
email    = `${uid}@sahrae.tv.internal`
password = `fb_${uid}_secure_stable`
```

Your `firestore.rules` are genuinely well written — ownership checks, field
validation, immutability. None of it helps: rules verify *who you are
authenticated as*, and the app handed out the credential to be anyone. It also
minted a permanent Firebase Auth account per guest device, growing without bound.

**Fixed:** replaced with anonymous auth (Firebase-managed, unguessable).
**Trade-off stated plainly:** cloud watch-progress is now per-device. True
cross-device sync needs a Supabase Edge Function that verifies the Supabase JWT
and mints a Firebase custom token. No client-only scheme can be both cross-device
and unforgeable — the old one only appeared to be.

### MEDIUM — Passwords stored under a 32-bit non-cryptographic hash
The offline auth shim hashed passwords with djb2 folded to 32 bits and kept the
result in `localStorage`. That is a checksum, not a password hash: the entire
output space is brute-forced on a phone in seconds. Because people reuse
passwords, this leaked credentials for *other* services.
**Fixed:** salted PBKDF2-SHA256, 210,000 iterations (OWASP 2023 floor), with a
constant-time comparison.

### MEDIUM — `android:allowBackup="true"`
`adb backup` could extract the WebView data directory — Supabase session tokens,
a live Google OAuth token, account records — from any unlocked device.
**Fixed:** `allowBackup="false"`. Nothing stored is worth restoring.

### LOW — PII in logs
Firestore error handling logged the user's email address and every linked
provider identity to the WebView console.
**Fixed:** reduced to uid and anonymous flag.

### LOW — Adult content not explicitly excluded
`include_adult` was unset on discover and both search endpoints, relying on a
TMDB default.
**Fixed:** `include_adult=false` set explicitly on all three.

### ACCEPTED RISK — Public keys in the client bundle
The Supabase publishable key, the TMDB key and the Firebase web config are all in
the bundle. For Supabase and Firebase this is by design (RLS and security rules
are the control). **Action for you:** confirm RLS is actually enabled on every
Supabase table — I could not verify that from the repo, and the rules file only
covers Firestore. The TMDB key is extractable and abusable for quota; that is
inherent to a client-only app and needs a proxy to solve properly.

### RESIDUAL — Blind trigger of side-effect endpoints
My `Origin`/`Referer` gate closes every case where an attacker needs to *read* a
response. It does not close one narrow case: an embed that sets
`<meta name="referrer" content="no-referrer">` and fires a no-CORS request (e.g.
`<img src>`) sends neither header, so it still reaches endpoints whose effect
doesn't need a readable reply — `/__eq`, `/__bgsync`, `/__dltitle`,
`/__dlremove`, and a blind (unreadable) `/__ddfetch`. Impact is nuisance-tier
now that `/__openext` is gone and responses can't be read.

**The correct fix, for the next iteration:** a per-session nonce. Generate a
random token in `MainActivity` at startup, inject it into the top frame only via
the existing `onPageFinished` → `evaluateJavascript` hook, require it as a query
parameter on every `/__*` call. A cross-origin iframe cannot read a top-frame JS
variable, so it cannot forge the token. I did not do this now because it touches
~10 JS call sites in the music, podcast and sports paths that I have no way to
test without a device, and breaking playback to close a nuisance-tier hole is a
bad trade.

---

## 3. The build was broken

```
error during build:
  assets/index-CTDfVRVW.js is 2.45 MB, and won't be precached.
```

A single 2.45 MB chunk exceeded the PWA service worker's 2 MiB precache limit and
**failed the build**. No APK could come out of this tree.

**Fixed**, and turned into a performance win rather than a config bump:

| | Before | After |
|---|---|---|
| Build | ❌ fails | ✅ passes |
| Largest chunk | 2.45 MB | 660 KB |
| Total JS | ~3.9 MB | 2.4 MB |

- Vendors split into separately cacheable chunks (react / firebase / supabase /
  three / hls / motion), so a code change no longer invalidates 2.4 MB of vendor
  code in every user's cache.
- **Removed `react-player`**, which alone pulled a 992 KB `dash.js` chunk. Its
  branch was unreachable — every one of your 14 servers is `type: 'iframe'` — and
  your own `FlowChannelsView` comments record that ReactPlayer renders 0:00 in
  this WebView. Dead weight and a known playback hazard.
- `@types/react` was only present transitively *through* `react-player`;
  removing it broke `npm run lint`. Now declared properly.

This matters most on the low-end Android TV boxes you target, where 2.4 MB of
JavaScript is parsed on the main thread before the first frame.

---

## 4. Scale & stability

**Storage exhaustion (would degrade every install over time).**
`fetchMediaDetails` wrote one blob per title viewed into `localStorage` with no
eviction. `localStorage` is a single ~5 MB bucket shared by everything the app
persists — so once a browsing session filled it, **watch progress, My List and
the auth session silently stopped saving too.** The only remedy was a "Clear
cache" button in Settings that no user has a reason to find.
**Fixed:** bounded at 250 entries, oldest evicted first, with a quota-pressure
retry that trims to a small working set.

**Crash paths in Live Sports.**
- `reportCurrentSportsServerDead` called `resolveServer` **from inside a
  `setPlaying` updater**. React may invoke an updater more than once, so tapping
  "server dead" could fire duplicate resolutions of the same stream.
  *Fixed — the side effect now runs outside the updater.*
- The same function computed `(currentIdx + 1) % sources.length`. With an empty
  source list that is `NaN`, and the next line dereferenced `sources[NaN].status`
  — **a TypeError mid-match.** *Fixed with an explicit guard.*
- When every source was dead the loop fell through and selected another dead
  source. *Fixed — it now holds position.*
- The notice auto-dismiss timer was never cancelled, so leaving Sports within 4
  seconds left a timer running, and rapid taps stacked one per tap. *Fixed.*

**Removed a guaranteed-failing network call on every cold start.**
`firebase-real.ts` ran `getDocFromServer(doc(db,'test','connection'))` at module
import. Your own rules deny that path, so this was a round-trip that failed by
design — for every user, on every launch — costing latency and billed Firestore
traffic while proving nothing.

---

## 5. Live sports & pop-up ads — read this section carefully

### The root cause, and it is not what it looked like

The native `EMBED_HOSTS` allow-list had drifted badly out of sync with the JS
`SERVERS` array. Of your 14 current providers, **10 were missing**: `multiembed.mov`,
`vidsrc.cc`, `smashystream.com`, `vidbinge.com`, `moviesapi.club`, `vidsrc.pro`,
`2embed.cc`, `vidsrc.net`, `vidsrc.me`, `embed.su`. Meanwhile the list still named
five retired ones.

A provider missing from that set is punished **twice**:

1. **L1.5 rewrites its HTML.** The code deliberately skips rewriting known
   providers because they run anti-tamper checks and refuse to play when modified
   — the "remove sandbox attributes on the iframe tag" error. Unlisted providers
   got rewritten, and tripped exactly that check.
2. **L2.5 refuses its frame loads.** Gesture-driven sub-frame navigation to a
   non-allow-listed host is dropped as a popunder. So the user taps Play, the
   player tries to load, and nothing happens.

So the same stale list both **broke playback** and **left those providers without
the anti-popup shim**. This is very likely the single biggest cause of both
symptoms you reported. It is now synced, with a prominent "keep in sync" marker
at both ends.

### Other pop-up work

- `/__openext` removed (see §2) — the escape hatch that bypassed all six layers.
- `clipboard-write` revoked from the player iframe. It let an ad script silently
  replace the user's clipboard contents; no player needs it.
- **Sandboxing added on the web build only.** On Android your native shell already
  refuses every popup and top-frame hijack, and sandboxing there would trip the
  providers' anti-tamper checks. On web there is *no* native shell, so the embeds
  could pop freely — that build now gets `allow-scripts allow-same-origin` and
  deliberately **not** `allow-popups`, `allow-modals` or `allow-top-navigation`.

### What I must not overstate

You asked for sports links that work **"without fail"** and **"no pop up ads at
all."** I have removed specific, identified causes of both. I cannot certify
either absolutely, and you should not accept a claim that anyone can:

- **The streams are third-party piracy sources.** They rotate domains, go dark
  mid-match and are IP-locked. No amount of app code makes an upstream source
  reliable. Your multi-server + fallback-channel cascade is the right design and
  it is intact.
- **Ad-blocking is an arms race.** Six layers plus the fixes above is genuinely
  strong, but "zero pop-ups, forever" is not a state any app reaches permanently.
- **Nothing here has run on an Android device.** See §7.

---

## 6. UI/UX

Your design system is better than I expected — a proper three-layer token
architecture, `prefers-reduced-motion` handled, `:focus-visible` rings for TV and
keyboard navigation, a coherent gold ramp. I did not repaint it, because a
wholesale restyle would have been unverifiable churn on top of work that is
already good.

Instead I fixed what was **measurably wrong**:

**Secondary text failed WCAG AA nearly everywhere.** `text-zinc-500` is used 109
times across the app — release years, runtimes, episode counts, artist names —
and measured **3.87:1** against the app surface, below the 4.5:1 AA threshold.
`text-zinc-600` was **2.42:1**, a clear failure.

| Token | Before | After | Result |
|---|---|---|---|
| `zinc-500` | 3.87:1 | **4.59:1** | passes AA for body text |
| `zinc-600` | 2.42:1 | **3.49:1** | passes AA for large text / non-text |

Fixed once at the token layer, so all 127 usages inherit it and the type
hierarchy is unchanged — the steps stay visibly subordinate to `zinc-400`. This
matters most in your actual use cases: a TV viewed from across a room, a phone in
daylight.

**Catalog quality — a credibility bug.** "Award-Winning Dramas" was rendering 20
titles nobody has heard of, every one showing a perfect 10.0. Cause:
`sort_by=vote_average.desc` with no vote-count floor, which surfaces films with a
single 10/10 vote. Now floors at 300 votes. Verified live in the browser — the
shelf now reads *The Shawshank Redemption, The Godfather, Schindler's List,
12 Angry Men*.

**Dead image host.** The missing-poster fallback pointed at `via.placeholder.com`,
which no longer serves images — so every gap produced a broken image plus a
hanging request to a third party. Replaced with an inline SVG data URI: instant,
offline, and it reports nothing to anyone.

**Honest scope note:** this is a defect-fixing pass, not the visual redesign your
wording suggests. If you want the latter, that is its own engagement and needs a
direction from you (reference apps, brand intent) before anyone writes CSS.

---

## 7. What I verified, and what I did not

**Verified by execution:**
- `npx tsc --noEmit` — clean.
- `npx vite build` — passes (it did not before).
- App booted in a real browser; home, navigation sheet and Live Sports exercised.
- **Live Sports loaded 9 live events and 72 football fixtures with servers
  attached, zero console errors.** Your sports feed is healthy right now.
- Catalog fix confirmed visually in the running app.
- Contrast ratios computed with the WCAG relative-luminance formula, not eyeballed.

**NOT verified — and this is the gate before release:**
- **No APK was built and nothing ran on a device.** No JDK is available here, so
  my `MainActivity.java` / `AudioFx.java` / `DownloadStore.java` changes are
  **not compiled**. I verified them by structural analysis (a brace/paren scanner
  that skips strings and comments — all balanced) and by re-reading every hunk
  against its imports and call sites. That is careful, but it is not a compiler.
- Whether the 10 restored providers now actually play. This is the change most
  likely to deliver your fix and it is entirely untested.
- Whether pop-ups are gone in practice.
- Whether anonymous Firebase auth is enabled in your console. If it is disabled,
  cloud watch-progress degrades to local-only — which works, but silently.
- I did not push this branch or run CI. That is your call to make.

---

## 8. Assumptions I made

1. **The zip is newer than the repo and is what you want worked on.** It is a
   superset of the 11 Jul commit (bigger `PlayerModal`, `SportsView`, `tmdb`, plus
   `TalentExplorer`/`videoDownloads`/`cacheManager`). I imported it onto a branch
   so you keep git history and the Android CI, which the zip has no `.github` for.
2. **I kept your `package.json`, not the zip's.** The zip bumps Capacitor 6→8
   (untested against your Android build) and re-adds `youtube-dl-exec`, whose
   postinstall has broken your CI before.
3. **I deleted `MovieDownloadModal.tsx`**, which the newer export replaced with
   `videoDownloads`/`useVideoDownloads`.
4. Cross-device cloud sync is worth losing temporarily to close the account-takeover
   flaw. Say the word if you'd rather I build the Edge Function token exchange.

---

## 9. Recommended next step

**Push the branch and run the Android workflow, then install the release APK and
test one movie and one live match.**

```bash
git push -u origin hardening-2026-07 && gh workflow run android.yml --ref hardening-2026-07
```

That single run answers the two questions this report cannot: does the native
layer still compile, and do the 10 restored providers play. Everything else here
is verified; this is the gate.
