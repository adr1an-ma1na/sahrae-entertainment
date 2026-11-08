import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Trophy, Play, X, Maximize, Loader2, Radio, Tv, Clapperboard, Search, ShieldCheck, AlertCircle, ExternalLink, AlertTriangle, MousePointer2, Shield } from 'lucide-react';
import type HlsT from 'hls.js';
import { useHls } from '../services/hlsLoader';
import { Capacitor } from '@capacitor/core';
import { haptics } from '../services/haptics';
import { playerSandbox, isShieldOn } from '../services/adShield';
import {
  DEFAULT_CONFIG, markFailure, needsCheck, nextStream, rankFeeds,
  type FailureReason, type Stream,
} from '../services/sportsStreams';
import { buildStreams, validateStream, metrics } from '../services/streamValidation';
import { loadSportsFeed, sourcesById, fetchStreamsFor, type Feed, type FeedEvent } from '../services/sportsFeed';
import { hostOf } from '../services/sportsStreams';
import Coachmark from './Coachmark';
import { suppressPopups } from '../services/popupGuard';
import { lockLandscape, unlockOrientation } from '../services/fullscreen';
import { tapCenterOf, canTap, canFrameKick, tellFrame, isFramePlaying, isFrameStalled } from '../services/nativeTap';
import { TvServerStrip, useTvServerStrip } from './ui/TvServerStrip';
import { useFrameChoices } from '../hooks/useFrameChoices';
import { fetchProof, reportPlay } from '../services/playProof';
import { FEED_PROOF_KEY, feedServerId, orderByProof, longestSinceFailing } from '../services/feedProof';
import type { ProofRow } from '../services/playProofRank';
import { isDataSaver } from '../services/dataSaver';
import { isLiteDevice } from '../services/deviceTier';
import TvPointer from './TvPointer';
import { isTelevision, tvFocus } from '../tv/spatialNavigation';
import { competitionOf, isTeamSport, knownBadge, findBadge } from '../services/sportBadges';
import { readAudioFormat, bestAudioTrack, upscaleDecision, bestHeight, type AudioFormat } from '../services/streamQuality.ts';
import { gpuReport } from '../services/gpu.ts';
import { attachUpscaler } from '../services/upscaler.ts';

/**
 * Live Sports.
 *
 * SCHEDULE comes from our auto-updating feed (github.com/adr1an-ma1na/sahrae-sports-feed):
 * the full day's events + each event's EMBED URLs, published as feed.json
 * (GitHub raw = reachable & CORS-open everywhere).
 *
 * STREAMS resolve ON-DEVICE: tapping an event sends its embed URLs to the native
 * resolver (/__embed2m3u8), which runs the embed's player in a hidden WebView and
 * captures the live .m3u8 — so the CDN token binds to the user's own IP and plays
 * (server-resolved tokens are IP-locked and 403 elsewhere). The resolved stream
 * plays through the native HLS proxy; every event also offers its sport's verified
 * free HD channel as an instant, always-reliable fallback.
 */

// Two mirrors of the same file: GitHub raw + the jsDelivr CDN (very reliable,
// edge-cached). We try both, retry once, and fall back to the last good feed
// cached on-device — so the events screen should never be left empty.
const FEED_URLS = [
  'https://raw.githubusercontent.com/adr1an-ma1na/sahrae-sports-feed/main/feed.json',
  'https://cdn.jsdelivr.net/gh/adr1an-ma1na/sahrae-sports-feed@main/feed.json',
];
const FEED_CACHE_KEY = 'sahrae.sportsFeed.v1';
const proxied = (m3u8: string, referer?: string) =>
  Capacitor.isNativePlatform()
    ? `https://localhost/__hlsproxy?u=${encodeURIComponent(m3u8)}${referer ? `&r=${encodeURIComponent(referer)}` : ''}`
    : m3u8;

// NOTE: resolveEmbed() and validateStream() used to live here. Both now live in
// services/streamValidation.ts, where resolution and manifest validation feed the
// health engine instead of returning a bare boolean.

const MATCH_STOP = new Set(['vs', 'the', 'and', 'live', 'stream', 'hd', 'sd', 'match', 'game', 'full', 'fc', 'sc', 'afc', 'cf']);
/** Significant lowercase tokens identifying an event (title + team names). */
function eventTokens(m: FeedEvent): string[] {
  const s = `${m.title} ${m.teams?.home?.name || ''} ${m.teams?.away?.name || ''}`.toLowerCase();
  return Array.from(new Set<string>(s.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !MATCH_STOP.has(w))));
}
/** Does the resolved stream's own URL slug look like it belongs to this event? */
function streamMatchesEvent(m3u8: string, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const slug = decodeURIComponent(m3u8).toLowerCase();
  return tokens.some((t) => slug.includes(t));
}

// ── Verified always-free HD channels (fallback + Channels tab) ──
interface Channel { name: string; category: 'Football' | 'Combat' | 'Cricket' | 'Tennis' | 'Motorsport' | 'General'; desc: string; url: string }
const CHANNELS: Channel[] = [
  { name: 'beIN Sports XTRA', category: 'Football', desc: 'Football & global sports', url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8' },
  { name: 'FIFA+ HD', category: 'Football', desc: 'Football live matches & archive', url: 'https://d2w9q46ikgrcwx.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-of5cbk3sav3w5/v1/sysdata_s_p_a_fifa_7/samsungheadend_us/latest/main/hls/playlist.m3u8' },
  { name: 'Real Madrid TV', category: 'Football', desc: 'Los Blancos 24/7', url: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8' },
  { name: 'FTF Sports Network', category: 'Football', desc: 'For The Fan global sports', url: 'https://1593604785.rsc.cdn77.org/FTF/FTF_SCTE.m3u8' },
  { name: 'beIN Sports en Español', category: 'Football', desc: 'Fútbol en vivo', url: 'https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8' },
  { name: 'ACCDN Sports', category: 'Football', desc: 'ACC College Football & Sports', url: 'https://raycom-accdn-firetv.amagi.tv/playlist.m3u8' },
  { name: 'FloRacing Live', category: 'Motorsport', desc: '24/7 Motorsport & racing', url: 'https://amg02278-amg02278c1-flosports-worldwide-7592.playouts.now.amagi.tv/playlist.m3u8' },
  { name: 'Red Bull TV', category: 'Motorsport', desc: 'Motorsport & action sports', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8' },
  { name: 'Cricket Gold', category: 'Cricket', desc: 'Cricket all formats live', url: 'https://streams2.sofast.tv/ptnr-yupptv/title-cricketgold/v1/master/611d79b11b77e2f571934fd80ca1413453772ac7/b2048bb8-1686-4432-aa50-647245383e0c/manifest.m3u8' },
  { name: 'Tennis Channel', category: 'Tennis', desc: 'ATP / WTA tennis live', url: 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01444-tennischannelth-tennischannelnl-samsungnl/playlist.m3u8' },
  { name: 'Stadium Live', category: 'General', desc: 'Live US sports network', url: 'https://wurl120sports.global.transmit.live/hls/679a907dce42a042c23ace37/v1/stadium_gracenote/samsung_us/latest/main/hls/playlist.m3u8' },
  { name: 'Fubo Sports', category: 'General', desc: 'Live sports & analysis', url: 'https://dnf08l6u6uxnz.cloudfront.net/master.m3u8' },
  { name: 'SportsGrid Network', category: 'General', desc: 'Live sports news & odds', url: 'https://sportsgrid-samsungus.amagi.tv/playlist.m3u8' },
  { name: 'Pluto Sports HD', category: 'General', desc: '24/7 Live sports events', url: 'https://service-stitcher-ipv4.clusters.pluto.tv/stitch/hls/channel/58bc10efdbf2c019013bd352/master.m3u8?advertisingId=&appName=web&appVersion=unknown&clientDeviceType=0&deviceDNT=0&deviceId=1&deviceMake=Chrome&deviceModel=Chrome&deviceType=web&deviceVersion=unknown' },
  { name: '30A Golf', category: 'General', desc: 'Golf tournaments & highlights', url: 'https://30a-tv.com/feeds/vidaa/golf.m3u8' },
];
function channelForSport(sport: string): Channel {
  let cat: Channel['category'] = 'General';
  if (sport === 'football') cat = 'Football';
  else if (sport === 'fight') cat = 'Combat';
  else if (sport === 'cricket') cat = 'Cricket';
  else if (sport === 'tennis') cat = 'Tennis';
  else if (sport === 'motor-sports') cat = 'Motorsport';
  return CHANNELS.find((c) => c.category === cat) || CHANNELS[0];
}
/** Guaranteed-reliable fallback channels so an event ALWAYS has something to
 *  watch: the sport's own channel first, then universal always-on HD feeds. A
 *  dead one cascades to the next (see onUnplayable). */
function fallbackChannels(sport: string): Channel[] {
  const primary = channelForSport(sport);
  // The sport's OWN channels first (best coverage of the event), then the
  // universal always-on HD feeds — deduped. More options = the cascade always
  // finds a live one, and the viewer can flip between the channels covering it
  // (Cricfy-style) even before an event's dedicated server is live.
  const sameCat = CHANNELS.filter((c) => c.category === primary.category);
  /**
   * Last-resort channels, ordered by MEASURED resolution rather than by name.
   *
   * The previous order was almost exactly backwards. Reading each manifest:
   *
   *     beIN Sports XTRA   720p      was LAST
   *     SportsGrid         720p      was absent
   *     Red Bull TV        240p      was FIRST
   *     Stadium Live       360p
   *     Fubo Sports        216p
   *     Pluto Sports HD    declares no resolution at all
   *
   * So a viewer who fell through to the universal list — which is precisely the
   * viewer whose event had no stream — was handed 240p first and 720p last, and
   * one of the options carries "HD" in a name no manifest supports. Sport-
   * specific channels still come before all of these, because relevance beats
   * resolution: Red Bull TV at 240p is worth more on a motorsport fixture than
   * a crisp channel showing something else.
   */
  const universal = ['beIN Sports XTRA', 'SportsGrid Network', 'Stadium Live', 'Red Bull TV', 'Fubo Sports', 'Pluto Sports HD']
    .map((n) => CHANNELS.find((c) => c.name === n))
    .filter((c): c is Channel => !!c);
  const seen = new Set<string>();
  const out: Channel[] = [];
  for (const c of [primary, ...sameCat, ...universal]) if (c && !seen.has(c.name)) { seen.add(c.name); out.push(c); }
  return out;
}

/** How long the titles stay on a full-screen match on a TV, and after an arrow press brings them back. */
const TV_TITLES_MS = 500;
const TV_TITLES_BACK_MS = 3500;
/** A live match with no picture after this long moves to the next feed by itself. */
const NO_PICTURE_MS = 30_000;
/** A feed moved to because the last one died: the viewer is already waiting. */
const NO_PICTURE_AFTER_DROP_MS = 12_000;
/** Still playing after this long counts as a feed that holds up. */
const HELD_UP_MS = 3 * 60_000;
/** How often the match's feed list is read again while it plays: links change during a game. */
const FEED_REFRESH_MS = 4 * 60_000;
/** Every feed has failed: go round again, but stop after this many so a finished match rests. */
const MAX_LAST_RESORTS = 8;

const SPORT_EMOJI: Record<string, string> = {
  football: '⚽', 'american-football': '🏈', basketball: '🏀', baseball: '⚾', hockey: '🏒',
  'motor-sports': '🏎️', fight: '🥊', tennis: '🎾', cricket: '🏏', golf: '⛳', rugby: '🏉', darts: '🎯', other: '🏆',
};
/**
 * A team's badge: from the listing when it has one, otherwise found by name
 * (sportBadges.ts). Never letters: a listener looks for the crest. Looked up
 * only as the card comes on screen, and while there is none a plain shield in
 * the team's colour holds the place.
 */
function TeamLogo({ name, src, category, size = 'w-10 h-10', color }: { name: string; src?: string; category: string; size?: string; color?: string }) {
  const [srcFailed, setSrcFailed] = useState(false);
  const [found, setFound] = useState(() => knownBadge(name, category) || '');
  const [foundFailed, setFoundFailed] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);
  const needLookup = (!src || srcFailed) && !found && isTeamSport(category);
  useEffect(() => {
    const el = holder.current;
    if (!needLookup || !el) return;
    let live = true;
    const look = () => { void findBadge(name, category).then((u) => { if (live && u) setFound(u); }); };
    if (typeof IntersectionObserver !== 'function') { look(); return () => { live = false; }; }
    const io = new IntersectionObserver((seen) => { if (seen.some((x) => x.isIntersecting)) { io.disconnect(); look(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [needLookup, name, category]);

  const image = src && !srcFailed ? src : !foundFailed ? found : '';
  if (image) {
    return <img loading="lazy" decoding="async" src={image} alt="" onError={() => (image === src ? setSrcFailed(true) : setFoundFailed(true))} className={`${size} object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]`} />;
  }
  return (
    <span ref={holder} className={`${size} grid place-items-center`}>
      <Shield aria-hidden className="w-full h-full" strokeWidth={1.25} style={{ color: color || '#a1a1aa', fill: color ? `color-mix(in srgb, ${color} 70%, black)` : 'rgba(255,255,255,0.08)' }} />
    </span>
  );
}

/**
 * What a session or fight belongs to, for an event with no two teams: the
 * series' logo on a light tile (several are dark artwork), else the sport's
 * symbol. "São Paulo Qualifying" alone does not say Formula 1.
 */
function CompetitionMark({ event, size }: { event: FeedEvent; size: string }) {
  const comp = competitionOf(event);
  const [failed, setFailed] = useState(false);
  if (comp?.logo && !failed) {
    return (
      <span className={`${size} shrink-0 grid place-items-center rounded-2xl bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]`}>
        <img src={comp.logo} alt={comp.name} loading="lazy" decoding="async" onError={() => setFailed(true)} className="w-full h-full object-contain" />
      </span>
    );
  }
  return (
    <span aria-hidden className={`${size} shrink-0 grid place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10 text-3xl`}>{SPORT_EMOJI[event.category] || SPORT_EMOJI.other}</span>
  );
}

// FeedEvent / Feed now come from services/sportsFeed.ts, which loads fixtures
// from the live API (100% stream coverage) rather than the committed snapshot
// that only carried streams for 10% of events.

const SPORT_LABELS: Record<string, string> = {
  football: 'Football', 'american-football': 'NFL', basketball: 'Basketball', baseball: 'Baseball',
  hockey: 'Hockey', 'motor-sports': 'Motorsport', fight: 'Combat', tennis: 'Tennis', cricket: 'Cricket',
  golf: 'Golf', rugby: 'Rugby', darts: 'Darts', other: 'Other',
};

const SPORT_BADGE_CLASSES: Record<string, string> = {
  football: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  basketball: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  fight: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  'motor-sports': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  tennis: 'bg-lime-500/10 text-lime-400 border border-lime-500/20',
  cricket: 'bg-teal-500/10 text-teal-400 border border-teal-500/20',
  'american-football': 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  baseball: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  hockey: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
  golf: 'bg-green-500/10 text-green-400 border border-green-500/20',
  rugby: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
};
/** Each sport's accent: the glow behind the spotlight, the dot on its chip. */
const SPORT_ACCENT: Record<string, string> = {
  football: '16,185,129', basketball: '249,115,22', fight: '244,63,94', 'motor-sports': '245,158,11',
  tennis: '132,204,22', cricket: '20,184,166', 'american-football': '59,130,246', baseball: '99,102,241',
  hockey: '14,165,233', golf: '34,197,94', rugby: '168,85,247', darts: '239,68,68',
};
const accentOf = (cat: string) => SPORT_ACCENT[cat] || '245,158,11';

const getSportBadgeClass = (cat: string) => SPORT_BADGE_CLASSES[cat] || 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';

// Typical max runtime per sport, so a finished event leaves the list promptly
// instead of lingering for hours. Live events get a +1h overrun grace.
const HR = 3600_000;
const SPORT_DURATION_MS: Record<string, number> = {
  football: 2.5 * HR, 'american-football': 3.5 * HR, basketball: 2.75 * HR, baseball: 3.5 * HR,
  hockey: 2.75 * HR, tennis: 3.5 * HR, cricket: 9 * HR, 'motor-sports': 3.5 * HR,
  fight: 4 * HR, golf: 5 * HR, rugby: 2.25 * HR, darts: 4 * HR,
};

/** An event counts as "live" from 10 min before its start time (feeds flip the
 *  live flag late) until its typical runtime elapses — so the LIVE state shows
 *  even when the provider hasn't marked it yet. */
/** A 24/7 sports channel rather than a match (ppv.st tags them so). */
const isChannelEvent = (m: FeedEvent) => (m.league || '').toLowerCase().includes('24/7');

/** "Kick-off 20:30" today, "Kick-off Sat 20:30" later in the week. */
function kickOffLabel(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = d.toDateString() === new Date().toDateString();
  return `Kick-off ${today ? '' : d.toLocaleDateString([], { weekday: 'short' }) + ' '}${time}`;
}

function eventIsLive(m: FeedEvent): boolean {
  // Feed-confirmed live always shows (openEvent always adds a channel fallback,
  // so there's always something to watch).
  if (m.live) return true;
  if (!m.date) return false;
  const now = Date.now();
  const inWindow = now >= m.date - 10 * 60_000 && now <= m.date + (SPORT_DURATION_MS[m.category] ?? 3 * HR);
  // Only show an UPCOMING event as live early if it actually has stream servers —
  // never present a "live" event with nothing to watch.
  return inWindow && !!(m.embeds && m.embeds.length > 0);
}

// ── Native HLS player ──
// Reports `onUnplayable` when a source is dead (manifest 403/404/timeout, or it
// never produces a frame) so the parent can auto-skip to the next source. Brief
// in-stream network blips are retried, not treated as dead.
const HLSPlayer = ({ src, onUnplayable }: { src: string; onUnplayable?: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const deadRef = useRef(onUnplayable);
  deadRef.current = onUnplayable;
  // Renditions the stream offers, plus which one is pinned (-1 = automatic).
  // Exposed so the viewer can force max quality instead of trusting ABR.
  const Hls = useHls();
  const hlsRef = useRef<HlsT | null>(null);
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]);
  const [pinnedLevel, setPinnedLevel] = useState(-1);
  /** What the manifest actually declares for audio — null until known. */
  const [audioFmt, setAudioFmt] = useState<AudioFormat | null>(null);
  /** Highest rendition the source offers, for the upscale decision. */
  const [sourceHeight, setSourceHeight] = useState(0);
  const [upscaleOn, setUpscaleOn] = useState<boolean>(() => {
    try { return localStorage.getItem('sahrae.sports.upscale') !== 'off'; } catch { return true; }
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * Whether to upscale, recomputed when the source or the preference changes.
   *
   * devicePixelRatio matters: a 1440-CSS-pixel window on a 2x display is really
   * showing 2880 device pixels, and ignoring that would decline to upscale on
   * exactly the screens that would benefit most.
   */
  const decision = useMemo(() => {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const displayHeight = typeof window !== 'undefined' ? Math.round(window.screen.height * dpr) : 0;
    return upscaleDecision({
      sourceHeight,
      displayHeight,
      hardwareGpu: gpuReport().canRunShaders,
      enabled: upscaleOn,
    });
  }, [sourceHeight, upscaleOn]);

  /** True only once the GPU path has actually started — never merely intended. */
  const [upscaling, setUpscaling] = useState(false);

  useEffect(() => {
    setUpscaling(false);
    if (!decision.shouldUpscale) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video) return;

    // The canvas only exists once `upscaling` is true, so the first pass arms
    // it and the second attaches. Attaching to a canvas that is not mounted
    // would silently render into nothing.
    if (!canvas) { setUpscaling(true); return; }

    const handle = attachUpscaler(video, canvas, decision.targetHeight);
    if (!handle.active) {
      // GL refused. Fall straight back to the plain video rather than leaving a
      // blank canvas over a live match.
      setUpscaling(false);
      return;
    }
    return () => handle.detach();
  }, [decision.shouldUpscale, decision.targetHeight, upscaling]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !Hls) return;
    let dead = false;
    const giveUp = () => { if (!dead) { dead = true; deadRef.current?.(); } };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Deep buffer so a single slow segment never drains us to a stall.
        backBufferLength: 90,
        maxBufferLength: 60,
        maxMaxBufferLength: 180,
        maxBufferSize: 120 * 1000 * 1000,
        maxBufferHole: 0.5,
        startFragPrefetch: true,
        // Sit a few segments behind the live edge — much steadier than chasing it.
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 18,
        // Retry hard before giving up on a flaky CDN segment.
        manifestLoadingTimeOut: 15000, manifestLoadingMaxRetry: 4,
        levelLoadingTimeOut: 15000, levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 30000, fragLoadingMaxRetry: 8,
        nudgeMaxRetry: 10,
        // ── Quality-first tuning ──
        // Sport is the worst case for conservative ABR: fast motion on a low
        // rendition looks terrible, and the default ramp spends the first
        // minute climbing. So we open on the SHARPEST rendition (startLevel is
        // overridden to the top level on MANIFEST_PARSED below) and let ABR
        // step down only if the connection genuinely cannot hold it.
        startLevel: -1,
        capLevelToPlayerSize: false,      // never pick by the small player box
        abrEwmaDefaultEstimate: 6_000_000, // assume a healthy pipe until measured
        abrBandWidthFactor: 0.95,          // use more of the measured bandwidth
        abrBandWidthUpFactor: 0.9,         // and climb back up quickly
        maxStarvationDelay: 4,
        maxLoadingDelay: 4,
      });
      let started = false;
      let netRetries = 0;
      // If nothing plays within 14s, consider the source dead and move on.
      const watchdog = setTimeout(() => { if (!started) { hls.destroy(); giveUp(); } }, 14000);
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Start on the highest rendition the stream offers, then hand control
        // back to ABR. Without this hls.js begins low and takes a while to
        // climb, which is exactly the "picture is soft" complaint on live sport.
        try {
          if (hls.levels && hls.levels.length > 1) {
            hls.startLevel = hls.levels.length - 1;
            hls.nextLevel = hls.levels.length - 1;
            // Re-enable adaptation shortly after, so a weak connection can still
            // step down rather than stalling on a bitrate it cannot sustain.
            setTimeout(() => { try { if (hls.autoLevelEnabled !== false) hls.nextLevel = -1; } catch { /* destroyed */ } }, 8000);
          }
          setLevels((hls.levels || []).map((l, i) => ({ height: l.height || 0, index: i })));

          // Read what this stream ACTUALLY carries, from the manifest.
          //
          // Atmos in HLS is signalled by CHANNELS="16/JOC", not by the codec:
          // plain 5.1 is also ec-3, so trusting the codec alone would stamp
          // "Atmos" on ordinary surround. The badge additionally requires that
          // this device can decode it — a label for audio the WebView cannot
          // play is worse than no label.
          const at = (hls as any).audioTracks as { audioCodec?: string; channels?: string; name?: string }[] | undefined;
          if (at?.length) {
            const chosen = bestAudioTrack(
              at.map((t) => ({ codec: t.audioCodec || '', channels: t.channels || '', name: t.name })),
            );
            setAudioFmt(chosen ? readAudioFormat(chosen) : null);
          } else {
            // A muxed stream has no separate audio rendition; the video level
            // carries the codec. Still honest: no JOC means no Atmos claim.
            const lv = hls.levels?.[hls.currentLevel] || hls.levels?.[0];
            const codec = (lv as any)?.audioCodec || '';
            setAudioFmt(codec ? readAudioFormat({ codec, channels: '' }) : null);
          }

          // Upscale decision, from the source height and this display.
          setSourceHeight(bestHeight(hls.levels || []));
        } catch { /* level control is best-effort */ }
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => { started = true; });
      // A live stream can simply stop: no error, the picture just stays still.
      let lastTime = -1, frozenFor = 0;
      const frozen = setInterval(() => {
        if (!started || video.paused || document.hidden || navigator.onLine === false) { frozenFor = 0; return; }
        if (Math.abs(video.currentTime - lastTime) > 0.2) { lastTime = video.currentTime; frozenFor = 0; return; }
        frozenFor += 2;
        if (frozenFor >= 10) { clearInterval(frozen); hls.destroy(); giveUp(); }
      }, 2000);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        const d = String(data.details || '');
        const manifestDead = d.includes('manifestLoad') || d.includes('manifestParsing') || d.includes('manifestIncompatible');
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (manifestDead || netRetries >= 1) { hls.destroy(); giveUp(); }
          else { netRetries += 1; hls.startLoad(); }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.destroy();
          giveUp();
        }
      });
      hlsRef.current = hls;
      return () => { clearTimeout(watchdog); clearInterval(frozen); hlsRef.current = null; setLevels([]); hls.destroy(); };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      const onMeta = () => video.play().catch(() => {});
      const onErr = () => giveUp();
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('error', onErr);
      const watchdog = setTimeout(() => { if (video.readyState < 2) giveUp(); }, 14000);
      return () => { clearTimeout(watchdog); video.removeEventListener('loadedmetadata', onMeta); video.removeEventListener('error', onErr); };
    }
  }, [src, Hls]);
  /** Pin a rendition, or -1 to hand control back to ABR. */
  const pick = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    try {
      hls.nextLevel = index;
      // currentLevel switches immediately rather than at the next segment
      // boundary, which is what makes the change feel instant.
      if (index >= 0) hls.currentLevel = index;
      setPinnedLevel(index);
    } catch { /* player torn down mid-click */ }
  };

  return (
    <>
      {/* When upscaling, the canvas carries the picture and the <video> becomes
          the (invisible) decoder. Native controls cannot be used in that mode —
          a canvas drawn above them hides them — so the canvas takes a tap for
          play/pause. For a LIVE feed that is the whole of what the native bar
          offered anyway: there is nothing to seek to. */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-contain bg-black ${upscaling ? 'opacity-0 pointer-events-none' : ''}`}
        controls={!upscaling}
        autoPlay
        playsInline
      />
      {upscaling && (
        <canvas
          ref={canvasRef}
          onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play().catch(() => {}) : v.pause(); }}
          className="absolute inset-0 w-full h-full object-contain bg-black cursor-pointer"
        />
      )}
      {/* Honest capability badges.
          Each one is rendered only when the stream ACTUALLY carries it and this
          device can actually use it. The Dolby/Atmos badge in particular comes
          from the manifest's CHANNELS attribute plus a real decoder check — it
          is never inferred from a codec name, because plain 5.1 and Atmos share
          the ec-3 codec and guessing would mislabel ordinary surround. */}
      {(audioFmt?.label || upscaling) && (
        <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5">
          {upscaling && (
            <span
              title={decision.reason}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/90 text-amber-950 border border-amber-300/40"
            >
              {decision.targetHeight}p
            </span>
          )}
          {audioFmt?.label && (
            <span
              title={`codec ${audioFmt.codec || 'unknown'}${audioFmt.channels ? ` · channels ${audioFmt.channels}` : ''}`}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                audioFmt.showAtmos
                  ? 'bg-white/90 text-black border-white/40'
                  : audioFmt.showDolby
                    ? 'bg-zinc-200/90 text-black border-white/30'
                    : 'bg-black/70 text-zinc-300 border-white/10'
              }`}
            >
              {audioFmt.label}
            </span>
          )}
        </div>
      )}

      {/* Upscale toggle — only offered where it would genuinely do something. */}
      {(decision.shouldUpscale || upscaling) && (
        <button
          onClick={() => {
            const n = !upscaleOn;
            setUpscaleOn(n);
            try { localStorage.setItem('sahrae.sports.upscale', n ? 'on' : 'off'); } catch { /* ignore */ }
          }}
          className="absolute bottom-3 left-3 z-30 px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/70 backdrop-blur border border-white/10 text-zinc-200 hover:text-white"
          title={decision.reason}
        >
          Enhance {upscaleOn ? 'On' : 'Off'}
        </button>
      )}

      {/* Quality picker. Only rendered when the stream genuinely offers more
          than one rendition — listing "1080p" for a single-variant stream would
          be claiming a quality that is not there. */}
      {levels.length > 1 && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur px-1.5 py-1 border border-white/10">
          <button
            onClick={() => pick(-1)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
              pinnedLevel === -1 ? 'bg-amber-500 text-amber-950' : 'text-zinc-300 hover:text-white'
            }`}
            title="Adapt to your connection"
          >
            Auto
          </button>
          {[...levels].sort((a, b) => b.height - a.height).map((l) => (
            <button
              key={l.index}
              onClick={() => pick(l.index)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                pinnedLevel === l.index ? 'bg-amber-500 text-amber-950' : 'text-zinc-300 hover:text-white'
              }`}
              title={`Lock to ${l.height}p`}
            >
              {l.height}p
            </button>
          ))}
        </div>
      )}
    </>
  );
};

// Cricfy-style: every server is listed up-front and stays put. Only the
// match's own feeds are offered (no unrelated TV channels); the user can switch to any server at any time, and a dead source is marked (not
// removed) so the list never collapses to nothing.
/**
 * The player now holds engine `Stream` objects (services/sportsStreams.ts):
 * validated, health-scored and deterministically ranked, instead of a bare list
 * of URLs with a four-state flag. `failed` is the per-session loop guard that
 * stops failover bouncing between the same two dead sources.
 */
interface Playing {
  title: string;
  tokens: string[];
  sources: Stream[];
  idx: number;
  failed: Set<string>;
  /** Every source was asked and none had a stream for this match. */
  noFeeds?: boolean;
  /** Kick-off (ms) for a match that has not started: the header shows it instead of "Live". */
  startsAt?: number;
}

export default function SportsView() {
  const [tab, setTab] = useState<'events' | 'channels'>('events');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [sport, setSport] = useState('all');
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState<Playing | null>(null);
  // Mirror of `playing` for callbacks that must read current state WITHOUT
  // doing so inside a setState updater (React may run those more than once,
  // which duplicates network probes).
  const playingRef = useRef<Playing | null>(null);
  playingRef.current = playing;
  const playerRef = useRef<HTMLDivElement>(null);
  const [isSandboxed, setIsSandboxed] = useState(false);
  const [showAdNotice, setShowAdNotice] = useState(false);
  const [showServerDeadNotice, setShowServerDeadNotice] = useState(false);
  // Off by default: the events list shows only fixtures that actually have a
  // match feed, so nothing on screen is a dead end.
  const [showAllFixtures, setShowAllFixtures] = useState(false);
  // Ad Shield: sandboxes the sports embed on web (see services/adShield.ts).
  const [shieldOn, setShieldOn] = useState<boolean>(() => isShieldOn());
  // Held so the auto-dismiss can be cancelled: without this, leaving Sports
  // within four seconds left a timer running that set state on a gone component,
  // and rapid taps stacked one timer per tap.
  const deadNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsSandboxed(window.self !== window.top);
  }, []);

  useEffect(() => () => {
    if (deadNoticeTimerRef.current) clearTimeout(deadNoticeTimerRef.current);
  }, []);

  // Ad Shield redirect prevention for Live Sports
  useEffect(() => {
    if (!playing) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const msg = 'Ad Shield protected you from an external redirect attempt.';
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [playing]);

  // Block popups this document opens while a stream is up. Same crash as the
  // player had: the Android shell locks window.open, so assigning to it threw
  // in strict mode and killed the app.
  useEffect(() => {
    if (!playing) return;
    return suppressPopups((args) => {
      console.warn('[Sahrae] Blocked a popup from the app document:', args);
      setShowAdNotice(true);
      setTimeout(() => setShowAdNotice(false), 6000);
    });
  }, [playing]);

  // Detect clicks/interaction on the third-party iframe (blur of parent window)
  useEffect(() => {
    if (!playing) {
      setShowAdNotice(false);
      return;
    }

    const handleBlur = () => {
      setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) {
          setShowAdNotice(true);
          // Auto-hide after 8 seconds
          setTimeout(() => setShowAdNotice(false), 8000);
        }
      }, 100);
    };

    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
    };
  }, [playing]);

  /**
   * Load fixtures from the LIVE API (services/sportsFeed.ts), which carries a
   * stream for essentially every match, instead of the committed snapshot that
   * only had one for 10% of them. Caching, the snapshot fallback and the
   * last-known-good behaviour all live in that module now.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const data = await loadSportsFeed();
    if (data.events.length) setFeed(data);
    else setError(true);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 180000);
    return () => clearInterval(t);
  }, [load]);
  // Full window, for where the browser will not give the player real full
  // screen (an iPhone allows it only for a bare <video>). Esc leaves it first,
  // then closes the player.
  const [maxed, setMaxed] = useState(false);
  useEffect(() => { if (!playing) setMaxed(false); }, [playing]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !playing) return;
      if (maxed) setMaxed(false); else setPlaying(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, maxed]);

  // The player is full screen either way: the browser's own, or filling the window.
  const [nativeFull, setNativeFull] = useState(false);
  useEffect(() => {
    const sync = () => {
      const d = document as any;
      setNativeFull(!!(d.fullscreenElement || d.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); };
  }, []);
  const isFull = maxed || nativeFull;
  useEffect(() => {
    document.documentElement.classList.toggle('sports-full', isFull);
    return () => document.documentElement.classList.remove('sports-full');
  }, [isFull]);

  // On a TV the title, buttons and "Press OK" leave the picture half a second
  // after it goes full screen. An arrow brings them back for a few seconds; Up
  // brings the servers (TvServerStrip). OK is left alone: it plays and pauses the match.
  const [chromeHidden, setChromeHidden] = useState(false);
  const chromeTimer = useRef(0);
  const chromeBarRef = useRef<HTMLDivElement>(null);
  const hideChromeIn = (ms: number) => {
    window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => {
      setChromeHidden(true);
      // The buttons are gone: the remote goes back to the picture.
      const frame = sportFrameRef.current;
      if (frame && !document.activeElement?.closest('[data-tv-strip]')) tvFocus(frame);
    }, ms);
  };
  useEffect(() => {
    if (!isFull || !isTelevision()) { window.clearTimeout(chromeTimer.current); setChromeHidden(false); return; }
    hideChromeIn(TV_TITLES_MS);
    const onKey = (e: KeyboardEvent) => {
      if (!e.key.startsWith('Arrow')) return;
      setChromeHidden(false);
      hideChromeIn(TV_TITLES_BACK_MS);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(chromeTimer.current); };
  }, [isFull]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFullScreen = () => {
    haptics.tap();
    const doc = document as any;
    const el = playerRef.current as any;
    if (doc.fullscreenElement || doc.webkitFullscreenElement || maxed) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) { try { exit?.call(document)?.catch?.(() => {}); } catch { /* noop */ } }
      setMaxed(false);
      unlockOrientation();
      return;
    }
    const req = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (!req) { setMaxed(true); return; }
    try {
      const p = req.call(el);
      if (p && p.then) p.then(lockLandscape, () => setMaxed(true));
      else lockLandscape();
    } catch { setMaxed(true); }
  };

  // Turning a phone on its side fills the screen with the match; turning it
  // back restores the page.
  useEffect(() => {
    if (!playing || typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const mq = window.matchMedia('(orientation: landscape)');
    const onTurn = () => { if (!document.fullscreenElement) setMaxed(mq.matches); };
    mq.addEventListener?.('change', onTurn);
    return () => mq.removeEventListener?.('change', onTurn);
  }, [!!playing]);

  // Badge host. The live API serves team badges from its own origin.
  const base = 'https://streamed.pk';
  // A full address (StreamFree's crests) as it is; a bare id from the old API on its host.
  const badge = (b?: string) => (b ? (/^https:\/\//.test(b) ? b : `${base}/api/images/badge/${b}.webp`) : '');
  const eventTime = (d: number) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const formatEventDateTime = (d: number) => {
    const date = new Date(d);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const now = new Date();
    
    const isToday = date.toDateString() === now.toDateString();
    
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    
    if (isToday) {
      return `Today, ${timeStr}`;
    } else if (isTomorrow) {
      return `Tomorrow, ${timeStr}`;
    } else {
      const dayName = date.toLocaleDateString([], { weekday: 'short' });
      const monthName = date.toLocaleDateString([], { month: 'short' });
      const dayNum = date.getDate();
      return `${dayName}, ${monthName} ${dayNum} · ${timeStr}`;
    }
  };

  const matchTitle = (m: FeedEvent) =>
    m.teams?.home?.name && m.teams?.away?.name ? `${m.teams.home.name} vs ${m.teams.away.name}` : m.title;

  // Friendly, distinct name per source server, parsed from its embed URL
  const sourceLabel = (embed: string): string => {
    const m = embed.match(/\/embed\/([^/]+)\/(?:([^/]+)\/)?(\d+)?/);
    if (!m) return 'HD';
    const srv = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    const num = m[3] ? ` ${m[3]}` : (m[2] ? ` ${m[2]}` : '');
    return `${srv}${num}`;
  };

  const patchSource = (id: string, patch: Partial<Stream>) =>
    setPlaying((p) => (p ? { ...p, sources: p.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : p));

  /**
   * Validate one stream and fold the verdict back in, re-ranking as results
   * land so the best-known option floats up while the rest are still checking.
   *
   * `autoSwitch` promotes a freshly verified match server over the placeholder
   * channel — but only once, and never off a server the user chose themselves.
   */
  const checkStream = useCallback(async (id: string, autoSwitch: boolean) => {
    const target = playingRef.current?.sources.find((s) => s.id === id);
    if (!target) return;
    if (target.status === 'checking') return; // already in flight
    setPlaying((p) => (p
      ? { ...p, sources: p.sources.map((s) => (s.id === id ? { ...s, status: 'checking' } : s)) }
      : p));

    const updated = await validateStream(target);

    setPlaying((p) => {
      if (!p) return p;
      const sources = p.sources.map((s) => (s.id === id ? updated : s));
      const current = p.sources[p.idx];
      const onChannel = current?.kind === 'channel';
      // Promote a verified match feed over a filler channel automatically (§7).
      const promote = autoSwitch && onChannel && updated.kind === 'server'
        && (updated.status === 'working' || updated.status === 'unverified');
      const idx = promote ? sources.findIndex((s) => s.id === id) : p.idx;
      return { ...p, sources, idx };
    });
  }, []);

  const openEvent = (m: FeedEvent, initialServerIdx?: number) => {
    const tokens = eventTokens(m);
    
    // ONLY the embeds the feed actually published.
    //
    // This used to pad the list with URLs invented from the event id
    // (embed.st/embed/echo/<id>/1 and friends). For a fixture the feed had no
    // streams for, every one of those five "servers" was a guess, so the user
    // tapped Watch, saw Server 1..5, and none of them ever opened. That is the
    // "the event says it starts at 8 but nothing plays" complaint: the app was
    // manufacturing links it had no reason to believe in. If there are no
    // embeds, we say so instead ("No stream for this match yet").
    const rawEmbeds = m.embeds && m.embeds.length > 0 ? orderByProof([...m.embeds], hostOf, feedProofRef.current) : [];

    // When the API can give us the real per-stream list, do NOT also seed a
    // server from the feed's constructed URL. That placeholder is what showed up
    // as a dead "Server 1" alongside the properly named feeds: it is a guessed
    // `/1` URL for a source whose real streams are about to arrive, and it is
    // not always the same stream the provider actually serves.
    const hasApiDetail = (sourcesById.get(m.id)?.length || 0) > 0;
    const sources = buildStreams(
      m.id,
      hasApiDetail ? [] : rawEmbeds.slice(0, 8),
      // No TV channels: an event plays its own match feeds or nothing. A sports
      // channel showing something else is not the game the person tapped.
      [],
      m.feeds,
    );

    const idx = initialServerIdx !== undefined && initialServerIdx < sources.length ? initialServerIdx : 0;
    const opened = { title: matchTitle(m), tokens, sources, idx, failed: new Set<string>(), noFeeds: sources.length === 0 && !(sourcesById.get(m.id)?.length), startsAt: !eventIsLive(m) && m.date > Date.now() ? m.date : undefined };
    // checkStream reads the ref: point it at this match now, or the checks below
    // find nothing and the player waits on "Getting the stream ready" for ever.
    playingRef.current = opened;
    setPlaying(opened);

    // Expand the API's per-stream detail for this match: exact embed URLs plus
    // REAL hd/language flags. Quality is only ever labelled from what the
    // provider reports, never inferred from a name.
    const apiSources = sourcesById.get(m.id);
    if (apiSources?.length) {
      void (async () => {
        // Six, not four, and in ranked order (sportsFeed stores them ranked).
        //
        // A source that returns nothing now returns an EMPTY list rather than a
        // fabricated URL, so a slot spent on a dead source yields nothing at all
        // instead of a phantom server. Asking more sources is therefore the
        // difference between "no feeds for this event" and a working one — and
        // it costs nothing on fixtures whose first source answers, because the
        // requests run in parallel.
        const metas = (await Promise.all(
          apiSources.slice(0, 6).map((src) => fetchStreamsFor(src.source, src.id)),
        )).flat().filter(Boolean) as NonNullable<FeedEvent['streamMeta']>;
        if (!metas.length) {
          setPlaying((prev) => (prev && prev.sources.length === 0 ? { ...prev, noFeeds: true } : prev));
          return;
        }
        // Build the merged list from the ref, not inside a state updater, so the
        // ids we then validate are the SAME objects that land in state. Deriving
        // ids separately silently validated streams that did not exist.
        const p = playingRef.current;
        if (!p) return;
        const channels = p.sources.filter((s) => s.kind === 'channel');
        const servers: Stream[] = rankFeeds(metas).slice(0, 8).map((meta, i) => {
          // "admin · English" meant nothing to a viewer. Feeds are numbered in
          // the order offered, HD first, with the commentary language.
          const lang = meta.language ? meta.language.split(' - ')[0] : '';
          const label = `Feed ${i + 1}${lang ? ` · ${lang}` : ''}`;
          const existing = p.sources.find((s) => s.embed === meta.embedUrl);
          // Keep any health already measured, but take the API's label and
          // quality — otherwise the pre-expansion "Server 1" name lingers
          // beside properly named feeds.
          return existing
            ? { ...existing, label, quality: meta.hd ? 'HD' : existing.quality }
            : {
                id: `srv-${i}-${meta.source}-${meta.streamNo}`,
                eventId: m.id,
                source: hostOf(meta.embedUrl),
                embed: meta.embedUrl,
                kind: 'server' as const,
                type: 'hls' as const,
                label,
                quality: meta.hd ? 'HD' : undefined,
                status: 'unknown' as const,
                healthScore: 50,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
              };
        });
        const merged = [...servers, ...channels];
        const activeId = p.sources[p.idx]?.id;
        const idx = Math.max(0, merged.findIndex((s) => s.id === activeId));
        // checkStream looks its target up in the ref. Point the ref at the new
        // list now: waiting for the re-render meant every lookup missed, no
        // stream was ever checked, and the web player sat on "Loading…".
        playingRef.current = { ...p, sources: merged, idx };
        setPlaying((prev) => (prev ? { ...prev, sources: merged, idx } : prev));

        // Validate the expanded set by its REAL ids; the first may promote.
        servers.slice(0, 4).forEach((s, i) => {
          void checkStream(s.id, i === 0 && initialServerIdx === undefined);
        });
      })();
      return;
    }

    // No API detail (offline snapshot) — validate what the feed gave us (§8, §14).
    const servers = sources.filter((s) => s.kind === 'server');
    servers.forEach((s, sIdx) => {
      void checkStream(s.id, sIdx === 0 && initialServerIdx === undefined);
    });
  };

  // Tap a server → switch to it, and (re)validate on demand if its health is
  // stale or it previously failed. The list itself never reorders under the user.
  const selectSource = (i: number) => {
    haptics.tap();
    setPlaying((p) => (p ? { ...p, idx: i } : p));
    const s = playing?.sources[i];
    if (!s) return;
    if (needsCheck(s, DEFAULT_CONFIG, Date.now())) void checkStream(s.id, false);
  };

  /**
   * Move off the current stream because it is not delivering (§7).
   *
   * Shared by the manual "Dead server?" button and the player's own failure
   * detection. Health is recorded through the engine so the choice of successor
   * is deterministic — highest health, then proven successes, then latency —
   * and the failed id joins this session's guard set so failover cannot ping-pong
   * between the same two dead sources (§17).
   */
  const lastResorts = useRef(0);
  const [feedReload, setFeedReload] = useState(0);
  const refreshFeedsRef = useRef<() => void>(() => {});

  // What has lasted for other viewers, ready before a match is opened.
  const feedProofRef = useRef<ProofRow[]>([]);
  useEffect(() => { void fetchProof(FEED_PROOF_KEY).then((rows) => { feedProofRef.current = rows; }); }, []);

  // Links change during a game and sites add feeds: read the match again while
  // it plays and add what is new. Nothing that is playing is disturbed.
  const refreshFeeds = useCallback(async () => {
    const p = playingRef.current;
    const eventId = p?.sources[0]?.eventId;
    if (!p || !eventId) return;
    const feed = await loadSportsFeed().catch(() => null);
    const m = feed?.events.find((e) => e.id === eventId);
    const now = playingRef.current;
    if (!m?.embeds?.length || !now || now.sources[0]?.eventId !== eventId) return;
    const known = new Set(now.sources.flatMap((s) => [s.embed, s.url]).filter(Boolean));
    const fresh = m.embeds.filter((u) => !known.has(u)).slice(0, 8);
    if (!fresh.length) return;
    const added = buildStreams(eventId, fresh, [], m.feeds).map((s, i) => ({ ...s, id: `srv-new-${Date.now()}-${i}` }));
    const sources = [...now.sources, ...added];
    playingRef.current = { ...now, sources };
    setPlaying((prev) => (prev && prev.sources[0]?.eventId === eventId ? { ...prev, sources } : prev));
    added.forEach((s) => { void checkStream(s.id, false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  refreshFeedsRef.current = () => { void refreshFeeds(); };
  const watchingEvent = playing?.sources[0]?.eventId;
  useEffect(() => {
    if (!watchingEvent) return;
    const t = window.setInterval(() => { void refreshFeeds(); }, FEED_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [watchingEvent, refreshFeeds]);

  const failoverFrom = useCallback((reason: FailureReason, announce: boolean) => {
    // Read from the ref, not inside a state updater. React may invoke an
    // updater more than once, so scheduling validation from inside one fires
    // duplicate probes — the same class of bug fixed earlier in this file.
    const p = playingRef.current;
    if (p && p.sources.length > 0 && p.sources[p.idx]) {
      const current = p.sources[p.idx];
      const now = Date.now();
      // Mark it failed but KEEP the url. Clearing it meant that when no healthy
      // successor existed we stayed on this stream with nothing to render, and
      // the player sat on "Loading…" forever. A failed stream is excluded from
      // ranking anyway, so the url costs nothing and keeps the last resort
      // playable.
      const sources = p.sources.map((s) =>
        s.id === current.id ? markFailure(s, reason, DEFAULT_CONFIG, now) : s,
      );
      const failed = new Set(p.failed);
      failed.add(current.id);

      metrics.failovers++;
      const next = nextStream(sources, current.id, failed, now);
      if (!next) {
        // Every feed has failed once. Sitting on a dead one is the worst answer
        // mid-match: go round again from the one that failed longest ago, since
        // live feeds come back. A single feed reloads.
        lastResorts.current++;
        const again = lastResorts.current <= MAX_LAST_RESORTS ? longestSinceFailing(sources.filter((s) => s.kind === 'server' && (s.url || s.embed)), current.id) : null;
        const idx = again ? sources.findIndex((s) => s.id === again.id) : -1;
        const round = new Set<string>();
        playingRef.current = { ...p, sources, idx: idx >= 0 ? idx : p.idx, failed: round };
        setPlaying((prev) => (prev ? { ...prev, sources, idx: idx >= 0 ? idx : prev.idx, failed: round } : prev));
        if (!again && lastResorts.current <= MAX_LAST_RESORTS) setFeedReload((n) => n + 1);
        if (again) void checkStream(again.id, false);
        refreshFeedsRef.current();
      } else {
        metrics.failoversSucceeded++;
        const idx = sources.findIndex((s) => s.id === next.id);
        // Set now as well: the feed's watchdog reads this the moment the switch lands.
        playingRef.current = { ...p, sources, idx: idx >= 0 ? idx : p.idx, failed };
        setPlaying((prev) => (prev ? { ...prev, sources, idx: idx >= 0 ? idx : prev.idx, failed } : prev));
        if (needsCheck(next, DEFAULT_CONFIG, now)) void checkStream(next.id, false);
      }
    }

    if (announce) {
      setShowServerDeadNotice(true);
      if (deadNoticeTimerRef.current) clearTimeout(deadNoticeTimerRef.current);
      deadNoticeTimerRef.current = setTimeout(() => setShowServerDeadNotice(false), 4000);
    }
  }, [checkStream]);

  const reportCurrentSportsServerDead = () => {
    haptics.tap();
    failoverFrom('PLAYBACK_STALL', true);
  };

  /** The player could not get media out of the current source. */
  const onUnplayable = useCallback(() => {
    failoverFrom('PLAYBACK_STALL', false);
  }, [failoverFrom]);

  /**
   * Background health monitoring (§9), scoped to the open event.
   *
   * Availability changes mid-match: a server dies, a dead one comes back. This
   * re-checks whatever is stale or out of cooldown on a fixed cadence so the
   * picker reflects reality rather than a snapshot from when the event opened,
   * and a recovered stream can climb back out of `offline` (§18). Monitoring
   * stops the moment the player closes — there is no reason to keep probing an
   * event nobody is watching, and no server here to do it anyway.
   */
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const p = playingRef.current; // read from the ref; never probe from inside an updater
      if (!p) return;
      const now = Date.now();
      const due = p.sources.filter((s) => needsCheck(s, DEFAULT_CONFIG, now));
      // Bounded: only re-check a couple per tick so a long source list never
      // turns into a burst of parallel requests on a phone.
      due.slice(0, 2).forEach((s) => void checkStream(s.id, false));
    }, DEFAULT_CONFIG.healthCheckIntervalMs);
    return () => clearInterval(timer);
  }, [playing !== null, checkStream]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = feed?.events || [];
  // Only show what's live, in progress, or still to come — drop events that are
  // clearly finished (not live and started more than ~3.5h ago).
  // If a match is in the past, has no live flag, and started more than 20 minutes ago,
  // we assume it ended/was canceled and drop it promptly to avoid user frustration.
  /**
   * Identity of a fixture, independent of which feed row it came from.
   *
   * The upstream feed lists the same match several times under different ids,
   * which is why users saw "two events with the same name, one works and one
   * doesn't" — the working copy had embeds, the duplicate had none. Teams (order
   * -independent) plus a 30-minute bucket around kick-off identifies a fixture
   * without merging genuinely different matches between the same clubs.
   */
  const fixtureKey = (m: FeedEvent): string => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const home = m.teams?.home?.name ? norm(m.teams.home.name) : '';
    const away = m.teams?.away?.name ? norm(m.teams.away.name) : '';
    const who = home && away ? [home, away].sort().join('~') : norm(m.title || '');
    const bucket = m.date ? Math.round(m.date / (30 * 60_000)) : 0;
    return `${m.category}|${who}|${bucket}`;
  };

  const activeEvents = useMemo(() => {
    const now = Date.now();
    const kept = events.filter((m) => {
      if (!m.date) return true;          // no time → keep (always-on / unknown)
      if (m.date > now) return true;     // upcoming
      
      const dur = SPORT_DURATION_MS[m.category] ?? 3 * HR;
      // If typical duration has elapsed, definitely ended
      if (now - m.date > dur) return false;

      // If feed explicitly says it's live, keep it.
      if (m.live) return true;

      // If started more than 20 minutes ago and not marked live, it has ended or is unavailable.
      const pastGrace = now - m.date > 20 * 60_000;
      if (pastGrace) return false;

      return true;
    });

    // Collapse duplicate listings of the same fixture, keeping the richest one
    // (most embeds, then feed-confirmed live). Showing both is what produced the
    // "one works, the other doesn't" confusion.
    const best = new Map<string, FeedEvent>();
    for (const m of kept) {
      const key = fixtureKey(m);
      const prev = best.get(key);
      if (!prev) { best.set(key, m); continue; }
      const score = (x: FeedEvent) => (x.embeds?.length || 0) * 10 + (x.live ? 1 : 0);
      if (score(m) > score(prev)) best.set(key, m);
    }
    return Array.from(best.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed]);

  const sportsPresent: string[] = useMemo(() => {
    const order = ['football', 'basketball', 'fight', 'motor-sports', 'tennis', 'cricket', 'american-football', 'baseball', 'hockey', 'golf', 'rugby'];
    const arr = Array.from(new Set<string>(activeEvents.map((m) => m.category)));
    arr.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
    return arr;
  }, [activeEvents]);
  const filters = ['all', 'live', ...sportsPresent];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sportOrder = ['football', 'basketball', 'fight', 'motor-sports', 'tennis', 'cricket', 'american-football', 'baseball', 'hockey', 'golf', 'rugby'];
    
    return activeEvents
      // "Every match listed has a stream" is delivered by changing WHAT IS
      // LISTED, not by inventing links. 90% of feed rows publish no streams at
      // all, so by default only fixtures that actually carry a match feed are
      // shown; `showAllFixtures` opens it up for schedule browsing.
      .filter((m) => showAllFixtures || (m.embeds?.length || 0) > 0)
      .filter((m) => (sport === 'live' ? eventIsLive(m) : sport === 'all' ? true : m.category === sport))
      .filter((m) => !q || matchTitle(m).toLowerCase().includes(q))
      .sort((a, b) => {
        // First sort: Live events always come first
        const liveA = eventIsLive(a) ? 1 : 0;
        const liveB = eventIsLive(b) ? 1 : 0;
        if (liveB !== liveA) return liveB - liveA;
        
        // Second sort: Group by sport category order so there is no chaos!
        const catA = sportOrder.indexOf(a.category) < 0 ? 99 : sportOrder.indexOf(a.category);
        const catB = sportOrder.indexOf(b.category) < 0 ? 99 : sportOrder.indexOf(b.category);
        if (catA !== catB) return catA - catB;
        
        // Third sort: Sort by date
        return a.date - b.date;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvents, sport, search, showAllFixtures]);

  /** Fixtures hidden because the feed publishes no stream for them. */
  const withoutStreams = useMemo(
    () => activeEvents.filter((m) => (m.embeds?.length || 0) === 0).length,
    [activeEvents],
  );

  // Organised into shelves: Live Now first (grouped internally by sport), then grouped by sport.
  const eventGroups = useMemo(() => {
    const order = ['football', 'basketball', 'fight', 'motor-sports', 'tennis', 'cricket', 'american-football', 'baseball', 'hockey', 'golf', 'rugby'];
    const live = visible.filter((m) => eventIsLive(m));
    const groups: { title: string; live?: boolean; events: FeedEvent[] }[] = [];
    const channels247 = visible.filter(isChannelEvent);
    if (sport === 'all') {
      const liveMatches = live.filter((m) => !isChannelEvent(m));
      if (liveMatches.length) groups.push({ title: 'Live Now', live: true, events: liveMatches });
      const byCat = new Map<string, FeedEvent[]>();
      for (const m of visible) {
        if (eventIsLive(m) || isChannelEvent(m)) continue;
        if (!byCat.has(m.category)) byCat.set(m.category, []);
        byCat.get(m.category)!.push(m);
      }
      const cats = Array.from(byCat.keys()).sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
      for (const c of cats) groups.push({ title: SPORT_LABELS[c] || c, events: byCat.get(c)! });
      if (channels247.length) groups.push({ title: '24/7 sports channels', live: true, events: channels247 });
    } else if (sport === 'live') {
      groups.push({ title: 'Live Now', live: true, events: visible });
    } else {
      if (live.length) groups.push({ title: 'Live Now', live: true, events: live });
      const rest = visible.filter((m) => !eventIsLive(m));
      if (rest.length) groups.push({ title: 'Upcoming', events: rest });
    }
    return groups;
  }, [visible, sport]);

  // The spotlight: the most-watched live match with a feed, else the next big one.
  const featured = useMemo(() => {
    const withFeed = visible.filter((m) => (m.embeds?.length || 0) > 0 && !isChannelEvent(m));
    return withFeed.find((m) => eventIsLive(m) && m.popular)
      || withFeed.find((m) => eventIsLive(m))
      || withFeed.find((m) => m.popular)
      || withFeed[0] || null;
  }, [visible]);
  const liveCount = useMemo(() => visible.filter((m) => eventIsLive(m) && !isChannelEvent(m)).length, [visible]);

  const renderSpotlight = (m: FeedEvent) => {
    const home = m.teams?.home, away = m.teams?.away;
    const live = eventIsLive(m);
    const rgb = accentOf(m.category);
    return (
      <section key={'spot-' + m.id} onClick={() => openEvent(m)} onKeyDown={(e) => { if (e.key === 'Enter') openEvent(m); }}
        tabIndex={0} data-tv-focusable role="button" aria-label={`Watch ${matchTitle(m)}`}
        className="group relative mb-10 overflow-hidden rounded-[28px] border border-white/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[300px] md:min-h-[380px] isolate">
        {m.poster && <img src={m.poster} alt="" decoding="async" className="absolute inset-0 -z-20 w-full h-full object-cover scale-105 opacity-45 group-hover:scale-110 transition-transform duration-[1200ms] ease-out" />}
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: `radial-gradient(70% 90% at 50% 120%, rgba(${rgb},0.38), transparent 60%), radial-gradient(40% 60% at 12% 10%, rgba(${rgb},0.22), transparent 70%), linear-gradient(180deg, rgba(9,9,11,0.35) 0%, rgba(9,9,11,0.78) 55%, rgb(9,9,11) 100%)` }} />
        <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)' }} />

        <div className="relative h-full flex flex-col justify-between p-5 md:p-9 min-h-[300px] md:min-h-[380px]">
          <div className="flex items-center gap-2 flex-wrap">
            {live ? (
              <span className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-red-600 text-white text-[11px] font-extrabold uppercase tracking-[0.14em] shadow-[0_0_24px_rgba(239,68,68,0.55)]">
                <span className="relative flex w-2 h-2"><span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-75 animate-ping" /><span className="relative inline-flex w-2 h-2 rounded-full bg-white" /></span>Live
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur text-white text-[11px] font-bold tabular">{formatEventDateTime(m.date)}</span>
            )}
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-white/90 bg-black/30 backdrop-blur border border-white/10">{competitionOf(m)?.name || m.league || SPORT_LABELS[m.category] || m.category}</span>
            <span className="ml-auto hidden sm:inline text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Featured match</span>
          </div>

          {home?.name && away?.name && isTeamSport(m.category) ? (
            <div className="flex items-center justify-center gap-4 md:gap-14 py-4">
              <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
                <div className="relative grid place-items-center w-20 h-20 md:w-32 md:h-32 rounded-full bg-black/45 backdrop-blur-sm ring-1 ring-white/15" style={{ boxShadow: `0 0 0 6px rgba(${rgb},0.08), 0 12px 40px -10px rgba(${rgb},0.45)` }}>
                  <TeamLogo name={home.name} category={m.category} color={home.color} src={home.badge ? badge(home.badge) : undefined} size="w-12 h-12 md:w-20 md:h-20" />
                </div>
                <span className="text-sm md:text-xl font-display font-bold text-white text-center line-clamp-2 leading-tight">{home.name}</span>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] text-white/40">{live ? 'Now' : 'Kick-off'}</span>
                <span className="text-2xl md:text-4xl font-display font-black text-white/90 tracking-tight">{live ? 'VS' : eventTime(m.date)}</span>
              </div>
              <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
                <div className="relative grid place-items-center w-20 h-20 md:w-32 md:h-32 rounded-full bg-black/45 backdrop-blur-sm ring-1 ring-white/15" style={{ boxShadow: `0 0 0 6px rgba(${rgb},0.08), 0 12px 40px -10px rgba(${rgb},0.45)` }}>
                  <TeamLogo name={away.name} category={m.category} color={away.color} src={away.badge ? badge(away.badge) : undefined} size="w-12 h-12 md:w-20 md:h-20" />
                </div>
                <span className="text-sm md:text-xl font-display font-bold text-white text-center line-clamp-2 leading-tight">{away.name}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 md:gap-6 py-6">
              <CompetitionMark event={m} size="w-20 h-20 md:w-32 md:h-32" />
              <h3 className="min-w-0 text-2xl md:text-5xl font-display font-black text-white tracking-tight leading-tight max-w-3xl">{m.title}</h3>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm text-amber-950 bg-gradient-to-b from-amber-300 to-amber-500 shadow-[0_10px_30px_-8px_rgba(245,158,11,0.7)] group-hover:from-amber-200 group-hover:to-amber-400 transition-colors self-start">
              <Play className="w-4 h-4 fill-current" /> {live ? 'Watch live' : 'Open match'}
            </span>
            <span className="text-xs text-white/55">{(m.embeds?.length || 0) > 1 ? `${m.embeds!.length} feeds · ` : ''}HD where offered · switches feed by itself if one drops</span>
          </div>
        </div>
      </section>
    );
  };

  const renderEvent = (m: FeedEvent) => {
    const home = m.teams?.home, away = m.teams?.away;
    const live = eventIsLive(m);
    const hasFeed = (m.embeds?.length || 0) > 0;
    const rgb = accentOf(m.category);
    return (
      <div key={m.id} onClick={() => openEvent(m)} onKeyDown={(e) => { if (e.key === 'Enter') openEvent(m); }} tabIndex={0} data-tv-focusable role="button" aria-label={matchTitle(m)}
        className="group relative overflow-hidden rounded-2xl p-4 md:p-5 cursor-pointer flex flex-col gap-4 h-full bg-gradient-to-b from-white/[0.06] to-white/[0.015] border border-white/[0.07] hover:border-amber-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle, rgba(${rgb},0.22), transparent 70%)` }} />
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: `rgb(${rgb})` }} />{competitionOf(m)?.name || (m.league && !isChannelEvent(m) ? m.league : SPORT_LABELS[m.category] || m.category)}
          </span>
          {live ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-[0.14em] bg-red-500/15 text-red-300 ring-1 ring-red-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
            </span>
          ) : (
            <span className="text-[11px] text-zinc-400 font-semibold tabular">{formatEventDateTime(m.date)}</span>
          )}
        </div>

        {home?.name && away?.name && isTeamSport(m.category) ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex flex-col items-center gap-2 min-w-0">
              <div className="grid place-items-center w-14 h-14 rounded-full bg-white/[0.04] ring-1 ring-white/10"><TeamLogo name={home.name} category={m.category} color={home.color} src={home.badge ? badge(home.badge) : undefined} /></div>
              <span className="text-[13px] font-semibold text-zinc-100 text-center line-clamp-2 leading-snug">{home.name}</span>
            </div>
            <span className="text-[10px] font-black tracking-[0.25em] text-zinc-500">VS</span>
            <div className="flex flex-col items-center gap-2 min-w-0">
              <div className="grid place-items-center w-14 h-14 rounded-full bg-white/[0.04] ring-1 ring-white/10"><TeamLogo name={away.name} category={m.category} color={away.color} src={away.badge ? badge(away.badge) : undefined} /></div>
              <span className="text-[13px] font-semibold text-zinc-100 text-center line-clamp-2 leading-snug">{away.name}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <CompetitionMark event={m} size="w-14 h-14" />
            <h3 className="min-w-0 text-[15px] font-display font-bold text-white leading-snug line-clamp-3">{m.title}</h3>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
          {hasFeed ? (
            <>
              <span className="text-[11px] text-zinc-500">{(m.embeds?.length || 0) > 1 ? `${m.embeds!.length} feeds` : '1 feed'}</span>
              <span className="inline-flex items-center gap-1.5 pl-3 pr-3.5 py-1.5 rounded-full text-xs font-bold text-zinc-200 bg-white/[0.07] group-hover:bg-gradient-to-b group-hover:from-amber-300 group-hover:to-amber-500 group-hover:text-amber-950 transition-colors">
                <Play className="w-3.5 h-3.5 fill-current" /> {live ? 'Watch' : 'Open'}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-zinc-500">{live ? 'No match feed for this one yet' : 'Feed appears near kick-off'}</span>
          )}
        </div>
      </div>
    );
  };

  const activeSrc = playing ? playing.sources[playing.idx] : undefined;
  const activeUrl = activeSrc?.url;
  const isEmbedUrl = activeUrl ? (!activeUrl.includes('.m3u8') && activeSrc?.kind === 'server') : false;

  // A feed plays by itself once chosen, as films do. Its site's player waits
  // for a press on its play button, inside a frame Sahrae cannot click into;
  // the Android app presses it (services/nativeTap.ts). Only while no video
  // has started ('sahrae:embed-media' is the app seeing the stream flow), so a
  // feed that already plays is never paused; the second and third presses are
  // for players whose first press only clears an advert layer.
  const sportFrameRef = useRef<HTMLDivElement>(null);
  const [sportPointer, setSportPointer] = useState(false);

  // The next feed, opened out of sight and silent, so switching to it only has
  // to show it: the 2 seconds of black between feeds lost viewers the action
  // (owner, 2026-11-08). The Android apps only, where the helper in the frame
  // can keep it quiet. One at a time, and not on Data Saver. A TV opens the one
  // the remote is resting on; a phone or laptop the next in the list, once the
  // match is running.
  const [warmUrl, setWarmUrl] = useState<string | null>(null);
  const canWarm = () => canFrameKick() && !isDataSaver();
  const warmable = (i: number): string | null => {
    const p = playingRef.current;
    const s = p?.sources[i];
    return p && s?.url && s.kind === 'server' && !s.url.includes('.m3u8') && s.status !== 'offline' && s.url !== p.sources[p.idx]?.url ? s.url : null;
  };
  const stripWarmTimer = useRef(0);
  const warmServer = (i: number) => {
    window.clearTimeout(stripWarmTimer.current);
    stripWarmTimer.current = window.setTimeout(() => { if (canWarm()) setWarmUrl(warmable(i)); }, 120);
  };
  const sportPicture = () => sportFrameRef.current?.querySelector<HTMLIFrameElement>('iframe[data-on]');
  /** Was this feed reached by losing the last one? */
  const afterDrop = useRef(false);

  // Once a feed starts it goes full screen, as a film does: once per feed, so
  // leaving full screen is not undone. A real full screen where the browser
  // allows it (right after the tap that chose the feed), else the player fills
  // the window.
  const autoFsFor = useRef<string | null>(null);
  const goFull = () => {
    if (!activeUrl || autoFsFor.current === activeUrl) return;
    autoFsFor.current = activeUrl;
    const doc = document as any;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
    const el = playerRef.current as any;
    const req = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (!req) { setMaxed(true); return; }
    try {
      const p = req.call(el);
      if (p && p.then) p.then(lockLandscape, () => setMaxed(true));
      else lockLandscape();
    } catch { setMaxed(true); }
    // A request left unanswered (a browser asking permission): fill the window instead.
    window.setTimeout(() => { const d = document as any; if (!d.fullscreenElement && !d.webkitFullscreenElement) setMaxed(true); }, 1500);
  };
  const goFullRef = useRef(goFull);
  goFullRef.current = goFull;

  useEffect(() => {
    setSportPointer(false);
    setWarmUrl((w) => (!activeUrl || w === activeUrl ? null : w));
    if (!activeUrl || !isEmbedUrl) return;
    const frame = sportPicture;
    // Already waiting out of sight: sound on, and on with the match.
    tellFrame(frame(), 'wake');
    // The website cannot see inside the feed's page: it goes full screen once
    // the page has loaded (the iframe's onLoad, below), or after 6 s if that was missed.
    if (!canTap()) { const t = window.setTimeout(() => goFullRef.current(), 6000); return () => clearTimeout(t); }
    const pointerOut = () => document.documentElement.classList.contains('tv-pointer');
    let playing = false;
    let warmNext = 0;
    let heldUp = 0;
    // The player helper inside the feed's page (nativeTap.canFrameKick) starts it
    // itself and says when the picture really moves; Sahrae nudges it too. Only
    // if nothing moves after 15 s does a tap try the play button, once.
    if (canFrameKick()) {
      // A feed that never shows a picture, or stops showing one, gives way to the
      // next. Not before kick-off: a feed can be up and waiting for the match.
      const giveWay = () => {
        const p = playingRef.current;
        if (!p || p.startsAt || pointerOut()) return;
        // The viewer's own connection, not the feed: every feed would look dead.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        const host = feedServerId(hostOf(activeUrl));
        if (host.length > 1) reportPlay(FEED_PROOF_KEY, host, false);
        afterDrop.current = true;
        failoverFrom('PLAYBACK_STALL', true);
      };
      const onMsg = (e: MessageEvent) => {
        if (isFrameStalled(e, frame())) { giveWay(); return; }
        if (isFramePlaying(e, frame()) && !playing) {
          playing = true;
          goFullRef.current();
          afterDrop.current = false;
          lastResorts.current = 0;
          heldUp = window.setTimeout(() => { const host = feedServerId(hostOf(activeUrl)); if (host.length > 1) reportPlay(FEED_PROOF_KEY, host, true); }, HELD_UP_MS);
          if (!isTelevision() && !isLiteDevice() && canWarm()) warmNext = window.setTimeout(() => {
            const p = playingRef.current;
            if (!p) return;
            for (let n = 1; n < p.sources.length; n++) {
              const u = warmable((p.idx + n) % p.sources.length);
              if (u) { setWarmUrl(u); return; }
            }
          }, 8000);
        }
      };
      window.addEventListener('message', onMsg);
      const timers = [
        ...[0, 250, 700, 1500, 5000, 9000].map((ms) => setTimeout(() => { if (!playing) tellFrame(frame(), 'play'); }, ms)),
        setTimeout(() => { const el = sportFrameRef.current; if (!playing && el && !pointerOut()) tapCenterOf(el, isTelevision() ? el : null); }, 15000),
        setTimeout(() => { if (!playing) giveWay(); }, afterDrop.current ? NO_PICTURE_AFTER_DROP_MS : NO_PICTURE_MS),
      ];
      return () => { window.removeEventListener('message', onMsg); timers.forEach(clearTimeout); window.clearTimeout(warmNext); window.clearTimeout(heldUp); };
    }
    // An older WebView, no helper: taps, while the app has seen no video.
    // ('sahrae:embed-media' also fires for a player that only preloads, so
    // this can miss; the helper above is the dependable path.)
    const onStream = () => { playing = true; };
    window.addEventListener('sahrae:embed-media', onStream);
    const timers = [3500, 8000, 13000].map((ms) => setTimeout(() => {
      const el = sportFrameRef.current;
      if (playing || !el || pointerOut()) return;
      tapCenterOf(el, isTelevision() ? el : null);
    }, ms));
    timers.push(setTimeout(() => goFullRef.current(), 4500));
    return () => { window.removeEventListener('sahrae:embed-media', onStream); timers.forEach(clearTimeout); };
  }, [activeUrl, isEmbedUrl, feedReload]);

  // A TV: Up at the top of the picture brings the servers.
  const strip = useTvServerStrip(!!playing && !!activeUrl && isTelevision(), sportFrameRef);
  useEffect(() => {
    if (strip.open || !isTelevision()) return;
    window.clearTimeout(stripWarmTimer.current);
    setWarmUrl(null);
  }, [strip.open]);
  const sportChoices = useFrameChoices(sportPicture, isEmbedUrl && activeUrl ? activeUrl : null);

  // Every feed's address is looked up and connected to as soon as the match
  // opens: a slow first connection is most of a cold switch on a mobile line.
  const feedOrigins = (playing?.sources || []).flatMap((s) => {
    try { return s.url && s.kind === 'server' ? [new URL(s.url).origin] : []; } catch { return []; }
  }).filter((o, i, all) => all.indexOf(o) === i).slice(0, 8).join(' ');
  useEffect(() => {
    if (!feedOrigins) return;
    const links = feedOrigins.split(' ').map((href) => {
      const l = document.createElement('link');
      l.rel = 'preconnect';
      l.href = href;
      l.crossOrigin = 'anonymous';
      document.head.appendChild(l);
      return l;
    });
    return () => links.forEach((l) => l.remove());
  }, [feedOrigins]);

  useEffect(() => {
    document.documentElement.classList.toggle('sports-open', !!playing);
    return () => document.documentElement.classList.remove('sports-open');
  }, [!!playing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sports-page pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12 relative">
      {/* Aurora glow behind the header */}
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-64 -z-10 opacity-70"
        style={{ background: 'radial-gradient(60% 70% at 12% 0%, rgba(251,191,36,0.20), transparent 70%), radial-gradient(50% 60% at 85% 8%, rgba(244,63,94,0.16), transparent 72%)', filter: 'blur(8px)' }} />
      {/* Player */}
      {playing && (
        <div role="dialog" data-tv-layer className="sports-dialog fixed inset-0 z-[100] bg-black flex flex-col items-center justify-start md:justify-center p-0 md:p-10 overflow-y-auto">
          {/* Title and controls sit ABOVE the picture on a phone: laid over a
              375px-wide video they collided with each other and hid the
              match. Over the picture only on larger screens and full screen. */}
          <div className="md:hidden w-full flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
            <button onClick={() => setPlaying(null)} tabIndex={0} data-tv-focusable aria-label="Close" className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0"><X className="w-5 h-5" /></button>
            <div className="min-w-0 flex-1">
              {playing.startsAt
                ? <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">{kickOffLabel(playing.startsAt)}</p>
                : <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live</p>}
              <h3 className="text-white font-bold text-sm truncate">{playing.title}</h3>
            </div>
            <button onClick={toggleFullScreen} tabIndex={0} aria-label="Full screen" className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0"><Maximize className="w-5 h-5" /></button>
          </div>
          <div className="w-full max-w-5xl flex flex-col gap-3 px-3 md:px-0 pb-6">
            <div ref={playerRef} className={isFull
              ? 'fixed inset-0 z-[400] bg-black overflow-hidden'
              : 'w-full aspect-video bg-black rounded-xl shadow-2xl overflow-hidden relative border border-white/10'}>
              <div ref={chromeBarRef} className={`absolute top-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-b from-black/80 to-transparent z-10 justify-between items-center transition-opacity duration-300 ${isFull ? 'flex' : 'hidden md:flex'} ${chromeHidden ? 'opacity-0 pointer-events-none' : ''} ${strip.open ? 'invisible' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {playing.startsAt
                    ? <div className="bg-amber-500 text-amber-950 px-2.5 py-1 rounded-sm shrink-0 text-xs font-bold uppercase tracking-wider">{kickOffLabel(playing.startsAt)}</div>
                    : <div className="flex items-center gap-1.5 bg-red-500 text-white px-2.5 py-1 rounded-sm shrink-0"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span className="text-xs font-bold uppercase tracking-wider">Live</span></div>}
                  <h3 className="text-white font-bold text-sm md:text-lg drop-shadow-md truncate">{playing.title}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* TV: a pointer for the feed's own controls (quality, volume), which a remote cannot reach. */}
                  {isEmbedUrl && canTap() && isTelevision() && (
                    <button onClick={() => setSportPointer(true)} tabIndex={0} data-tv-focusable aria-label="Use the pointer on the player"
                      className="h-10 px-3 rounded-full bg-black/50 hover:bg-white/20 text-white text-sm font-semibold flex items-center gap-1.5 border border-white/10"><MousePointer2 className="w-4 h-4" /> Pointer</button>
                  )}
                  <button onClick={toggleFullScreen} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center border border-white/10"><Maximize className="w-5 h-5" /></button>
                  <button onClick={() => setPlaying(null)} tabIndex={0} data-tv-focusable data-tv-close className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
                </div>
              </div>
              {strip.open && (
                <TvServerStrip
                  servers={playing.sources.map((s) => ({ id: s.id, label: s.label, detail: s.quality || undefined, down: s.status === 'offline' }))}
                  active={playing.idx}
                  choices={sportChoices}
                  onFocusServer={warmServer}
                  onPick={(i) => { selectSource(i); strip.close(); }}>
                  {isEmbedUrl && canTap() && (
                    <button type="button" onClick={() => { strip.close(); setSportPointer(true); }} tabIndex={0} data-tv-focusable
                      className="shrink-0 h-12 px-5 rounded-full text-base font-bold flex items-center gap-2 bg-white/15 text-white"><MousePointer2 className="w-4 h-4" /> Pointer</button>
                  )}
                </TvServerStrip>
              )}
              {activeUrl && !isEmbedUrl ? (
                // In the app a feed's playlist plays through the relay with the
                // headers its own player sent: loaded directly the stream server
                // refused it (cross-site) or answered 404, so matches never
                // played in Sahrae's player. Channels already open to all pass
                // through unchanged on the web.
                <HLSPlayer src={activeSrc?.kind === 'server' && !activeUrl.startsWith('https://localhost/') ? proxied(activeUrl, activeSrc.referer || activeSrc.embed) : activeUrl} onUnplayable={onUnplayable} />
              ) : activeUrl && isEmbedUrl ? (
                // On a TV, OK here presses the stream site's own play button
                // (services/nativeTap.ts): its player is in a frame a remote cannot enter.
                <div ref={sportFrameRef} className="absolute inset-0 w-full h-full" data-tv-noring
                  {...(canTap() ? {
                    tabIndex: 0, 'data-tv-focusable': true, 'data-tv-autofocus': true, 'aria-label': 'Play the match',
                    // OK: play or pause through the player helper; a tap where there is none.
                    onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.detail !== 0) return; if (!tellFrame(e.currentTarget.querySelector<HTMLIFrameElement>('iframe[data-on]'), 'toggle')) tapCenterOf(e.currentTarget, e.currentTarget); },
                  } : {})}>
                  {/* In list order, so the frames never change places: moving an
                      iframe reloads it. The waiting one becomes the picture in place. */}
                  {playing.sources.filter((s, i, all) => (s.url === activeUrl || s.url === warmUrl) && all.findIndex((x) => x.url === s.url) === i).map((s) => { const on = s.url === activeUrl; return (
                  <iframe
                    // Re-mount when the shield flips: sandbox only applies at
                    // frame creation, so toggling has to rebuild the iframe.
                    key={`sports-${shieldOn ? 'shield' : 'open'}-${s.url}-${on ? feedReload : 0}`}
                    src={s.url}
                    name={on ? undefined : 'sahrae-warm'}
                    data-on={on || undefined}
                    tabIndex={on ? undefined : -1}
                    aria-hidden={on ? undefined : true}
                    // The website: full screen once the feed's page has loaded. (A
                    // listener added after rendering missed a page that loaded fast.)
                    onLoad={() => { if (on && !canTap()) window.setTimeout(() => goFullRef.current(), 1200); }}
                    className={`absolute inset-0 w-full h-full border-0 bg-black ${on ? 'z-[1]' : 'opacity-0 pointer-events-none'}`}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    // Ad Shield (web only). Sandboxing is the sole way a page can
                    // stop a cross-origin embed popping windows. Some providers
                    // refuse to run sandboxed and show the red "Remove sandbox
                    // attributes on the iframe tag" message — hence the toggle in
                    // the header and the server list as the escape hatch. On
                    // Android this is undefined: the native shell blocks popups
                    // already, without breaking any provider.
                    sandbox={activeSrc?.kind === 'server' ? undefined : playerSandbox(shieldOn, activeUrl)}
                  />); })}
                  {!chromeHidden && !strip.open && <span aria-hidden className="tv-ok-hint pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-20 items-center gap-2 px-4 py-2 rounded-full bg-black/75 text-white text-sm font-bold">Press OK to play</span>}
                  {sportPointer && <TvPointer area={sportFrameRef.current} onExit={() => setSportPointer(false)} />}
                  {isSandboxed && (
                    <div className="absolute top-0 left-0 w-full z-40 bg-amber-500/95 text-amber-950 text-xs md:text-sm font-bold px-4 py-3 flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4 text-center backdrop-blur shadow-2xl border-b border-amber-400/30 animate-in slide-in-from-top-2">
                      <AlertCircle className="w-5 h-5 shrink-0 animate-bounce" />
                      <span>This page is shown inside another site, which blocks the match. <b>Open Sahrae in its own tab to watch.</b></span>
                      <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="bg-amber-950 text-amber-50 px-4 py-1.5 rounded-full whitespace-nowrap hover:bg-amber-900 transition-colors shadow-lg active:scale-95 flex items-center gap-1 text-xs">
                        Open Sahrae in New Tab <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                  {!activeSrc && playing.noFeeds ? (
                    <>
                      <Radio className="w-9 h-9 text-zinc-500" />
                      <p className="text-white font-semibold">No stream for this match yet</p>
                      <p className="text-zinc-400 text-sm">Streams usually appear shortly before kick-off. Check back closer to the start.</p>
                    </>
                  ) : activeSrc?.status === 'offline' ? (
                    <>
                      <Radio className="w-9 h-9 text-zinc-500" />
                      <p className="text-white font-semibold">This server isn't responding</p>
                      <p className="text-zinc-400 text-sm">Pick another server below.</p>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-9 h-9 animate-spin text-amber-500" />
                      <p className="text-white font-medium">Loading {activeSrc?.label || 'stream'}…</p>
                    </>
                  )}
                </div>
              )}

              {showAdNotice && (
                <div className="absolute bottom-4 right-4 z-50 max-w-sm bg-zinc-950/95 border border-amber-500/30 text-white rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-500">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-amber-400">Ad Shield protected you</h4>
                        <button onClick={() => setShowAdNotice(false)} className="text-zinc-400 hover:text-white transition-colors ml-2">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                        A background pop-up was blocked or opened. <b>Simply close the ad tab</b> to resume watching without interruption!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {showServerDeadNotice && (
                <div className="absolute bottom-4 left-4 z-50 max-w-sm bg-zinc-950/95 border border-red-500/30 text-white rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-red-500/15 text-red-400">
                      <AlertTriangle className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-red-400">Moved to the next server</h4>
                        <button onClick={() => setShowServerDeadNotice(false)} className="text-zinc-400 hover:text-white transition-colors ml-2">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                        That feed stopped or would not start, so Sahrae switched for you.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Now playing ───────────────────────────────────────────────
                Replaces a permanent amber "Seeing an error?" banner that
                shouted at everyone even when playback was perfect. This states
                what is actually playing and how healthy it is, and only turns
                into a call to action when something is genuinely wrong. */}
            {activeSrc && (() => {
              const bad = activeSrc.status === 'offline' || activeSrc.status === 'degraded';
              return (
                <div className={`rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-lg border ${
                  bad ? 'bg-zinc-900/90 border-amber-500/30' : 'bg-zinc-900/70 border-white/10'
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      bad ? 'bg-amber-500/20 text-amber-400'
                      : activeSrc.status === 'working' ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-white/5 text-zinc-400'
                    }`}>
                      {activeSrc.status === 'checking'
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : bad ? <AlertCircle className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-zinc-200 font-semibold truncate">
                        {activeSrc.label}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {activeSrc.status === 'working' && `Stream checked${activeSrc.quality ? ` · ${activeSrc.quality}` : ''} · playing`}
                        {activeSrc.status === 'degraded' && 'This feed is slow. Try another one below'}
                        {activeSrc.status === 'unverified' && `Live${activeSrc.quality ? ` · ${activeSrc.quality}` : ''} · if it does not start, try another feed`}
                        {activeSrc.status === 'offline' && 'This feed is not responding. Pick another below'}
                        {activeSrc.status === 'checking' && 'Getting the stream ready…'}
                        {activeSrc.status === 'unknown' && 'Getting the stream ready…'}
                      </p>
                    </div>
                  </div>
                  {activeSrc.kind === 'server' && (
                    <button
                      onClick={reportCurrentSportsServerDead}
                      className={`font-bold px-3.5 py-1.5 rounded-lg shadow-md text-xs flex items-center gap-1.5 shrink-0 transition-transform active:scale-95 whitespace-nowrap ${
                        bad ? 'bg-amber-500 hover:bg-amber-400 text-amber-950'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{bad ? 'Switch feed' : 'Not playing?'}</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* ── Sources, grouped ──────────────────────────────────────────
                Match feeds and always-on channels are two different things and
                were previously one undifferentiated row distinguished only by a
                📺 in the label. Splitting them makes the choice obvious: the
                match itself, or a channel that is guaranteed to play. Within
                each group the engine's ranking order is preserved, so the
                healthiest sits first. */}
            {(() => {
              const groups: { key: string; title: string; hint: string; items: { s: Stream; i: number }[] }[] = [
                {
                  key: 'match',
                  title: 'Feeds',
                  hint: 'This match',
                  items: playing.sources.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'server'),
                },
                {
                  key: 'channel',
                  title: 'Sports channels',
                  hint: 'Always on',
                  items: playing.sources.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'channel'),
                },
              ].filter((g) => g.items.length > 0);

              return groups.map((g) => (
                <div key={g.key} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mr-1 flex items-baseline gap-1.5">
                    {g.title}
                    <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-600">{g.hint}</span>
                  </span>
                  {g.items.map(({ s, i }) => {
                const activeBtn = i === playing.idx;
                // Status shown as measured, never assumed (§11/§15/§23):
                // green = validated working, amber = degraded, grey dot =
                // reachable but unverifiable here, ↻ = failed and re-checkable.
                const dot =
                  s.status === 'working' ? 'bg-emerald-400'
                  : s.status === 'degraded' ? 'bg-amber-400'
                  : s.status === 'unverified' ? 'bg-zinc-400'
                  : null;
                return (
                  <button key={s.id} onClick={() => selectSource(i)} tabIndex={0} data-tv-focusable
                    title={
                      s.status === 'working' ? `Verified · ${s.healthScore}/100${s.latencyMs ? ` · ${s.latencyMs}ms` : ''}`
                      : s.status === 'degraded' ? 'Reachable but slow or unstable'
                      : s.status === 'unverified' ? 'Cannot be verified in a browser, but may still play'
                      : s.status === 'offline' ? `Failed${s.lastFailure ? ` (${s.lastFailure.reason})` : ''}. Tap to re-check`
                      : 'Not checked yet'
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                      activeBtn ? 'bg-amber-500 text-amber-950 border-amber-500'
                      : s.status === 'offline' ? 'bg-zinc-900/60 text-zinc-500 border-white/5 hover:bg-zinc-800'
                      : 'bg-zinc-800/80 text-zinc-300 border-white/10 hover:bg-zinc-700'}`}>
                    {s.status === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
                    {dot && !activeBtn && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
                    {s.label}
                    {/* Quality is only ever shown when it was read from the
                        manifest — never inferred from a label (§11). */}
                    {s.quality && <span className="opacity-70 font-normal">{s.quality}</span>}
                    {s.status === 'offline' && <span className="opacity-70">↻</span>}
                  </button>
                );
                  })}
                </div>
              ));
            })()}
            <p className="text-[11px] text-zinc-500 flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 shrink-0" />
              If the picture freezes, tap another feed. Sahrae also moves you on by itself when one drops.
            </p>
          </div>
        </div>
      )}

      {/* Header + tabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-400/90 mb-1.5 flex items-center gap-2"><Trophy className="w-3.5 h-3.5" /> Sahrae Sport</p>
          <h2 className="text-4xl md:text-5xl font-display font-black text-white leading-[1.02] tracking-tight">Live Sports</h2>
          <p className="mt-2 text-sm text-zinc-400 flex items-center gap-3">
            {liveCount > 0 && <span className="flex items-center gap-1.5 text-red-300 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{liveCount} live now</span>}
            {!loading && <span>{visible.length} matches with a feed</span>}
          </p>
        </div>
        <div className="flex p-1 rounded-full bg-white/[0.05] ring-1 ring-white/10 backdrop-blur self-start md:self-end">
          {(['events', 'channels'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} tabIndex={0} data-tv-focusable
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${tab === t ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_6px_18px_-6px_rgba(245,158,11,0.7)]' : 'text-zinc-400 hover:text-white'}`}>
              {t === 'events' ? <><Clapperboard className="w-4 h-4" /> Matches</> : <><Tv className="w-4 h-4" /> Channels</>}
            </button>
          ))}
        </div>
      </div>

      <Coachmark id="sports" text="Tap any event to watch the match. If a feed stalls, switch to another one below the player." />

      {tab === 'channels' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {CHANNELS.map((ch) => (
            <div key={ch.name} onClick={() => setPlaying({
              title: ch.name,
              tokens: [],
              sources: buildStreams(ch.name, [], [{ name: ch.name, url: ch.url }]),
              idx: 0,
              failed: new Set(),
            })} tabIndex={0} data-tv-focusable role="button" aria-label={ch.name}
              className="card-lift tier-card group relative rounded-3xl p-5 cursor-pointer flex flex-col focus:outline-none">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform"><Tv className="w-5 h-5 text-zinc-400 group-hover:text-amber-500 transition-colors" /></div>
                <div className="flex items-center gap-1.5 bg-red-500/10 text-red-500 px-2.5 py-1 rounded-full border border-red-500/20"><div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /><span className="text-[10px] font-bold uppercase tracking-wider">On Air</span></div>
              </div>
              <div className="flex-grow">
                <h3 className="text-xl font-bold text-white leading-tight mb-1 group-hover:text-amber-400 transition-colors">{ch.name}</h3>
                <p className="text-sm text-zinc-400 mb-4">{ch.desc}</p>
                <span className="px-2.5 py-1 bg-white/5 rounded-lg text-xs font-medium text-zinc-400">{ch.category}</span>
              </div>
              <button className="mt-4 w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold bg-white/10 text-white group-hover:bg-amber-500 group-hover:text-amber-950 transition-all pointer-events-none"><Play className="w-4 h-4 fill-current" /> Watch Live</button>
            </div>
          ))}
        </div>
      ) : loading ? (
        // Placeholder shapes of the spotlight and cards while the schedule loads.
        <div aria-busy="true" aria-label="Loading today's live sports">
          <div className="mb-10 rounded-[28px] border border-white/[0.06] bg-white/[0.03] min-h-[300px] md:min-h-[380px] p-6 md:p-9 flex flex-col justify-between animate-pulse">
            <div className="flex gap-2"><div className="h-6 w-16 rounded-full bg-white/10" /><div className="h-6 w-20 rounded-full bg-white/[0.07]" /></div>
            <div className="flex items-center justify-center gap-10 md:gap-16"><div className="w-20 h-20 md:w-32 md:h-32 rounded-full bg-white/[0.07]" /><div className="h-8 w-12 rounded bg-white/[0.07]" /><div className="w-20 h-20 md:w-32 md:h-32 rounded-full bg-white/[0.07]" /></div>
            <div className="h-11 w-40 rounded-full bg-white/10" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 h-[188px] flex flex-col justify-between animate-pulse">
                <div className="flex justify-between"><div className="h-3 w-20 rounded bg-white/10" /><div className="h-3 w-12 rounded bg-white/[0.07]" /></div>
                <div className="flex items-center justify-around"><div className="w-14 h-14 rounded-full bg-white/[0.07]" /><div className="w-14 h-14 rounded-full bg-white/[0.07]" /></div>
                <div className="h-7 w-20 rounded-full bg-white/[0.07] self-end" />
              </div>
            ))}
          </div>
        </div>
      ) : error || events.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3 text-center">
          <Radio className="w-10 h-10 text-zinc-600" />
          <p className="text-zinc-400 max-w-sm">Couldn't load the events feed right now. The Channels tab always has live HD sport.</p>
          <button onClick={load} tabIndex={0} data-tv-focusable className="px-6 py-3 bg-amber-500 text-amber-950 font-bold rounded-xl hover:bg-amber-400">Retry</button>
        </div>
      ) : (
        <>
          {featured && !search && renderSpotlight(featured)}
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
            <div className="relative md:w-80 shrink-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams or matches"
                className="w-full bg-white/[0.04] ring-1 ring-white/10 rounded-full pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-amber-400/60" />
            </div>
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
              {filters.map((f) => (
                <button key={f} onClick={() => setSport(f)} tabIndex={0} data-tv-focusable
                  className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ring-1 ${sport === f ? 'bg-white text-zinc-950 ring-white shadow-[0_6px_18px_-8px_rgba(255,255,255,0.6)]' : 'bg-white/[0.03] text-zinc-300 ring-white/10 hover:ring-white/25 hover:text-white'}`}>
                  {f === 'live' ? <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    : f !== 'all' && <span className="w-1.5 h-1.5 rounded-full" style={{ background: `rgb(${accentOf(f)})` }} />}
                  {f === 'all' ? 'All sports' : f === 'live' ? 'Live now' : SPORT_LABELS[f] || f}
                </button>
              ))}
            </div>
          </div>

          {/* Honest account of what is on screen and what is being held back. */}
          {withoutStreams > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4 text-[11px] text-zinc-500">
              <span>
                {showAllFixtures
                  ? `Showing the full schedule. ${withoutStreams} fixture${withoutStreams === 1 ? '' : 's'} have no match feed published yet.`
                  : `Showing only fixtures with a match feed. ${withoutStreams} more ${withoutStreams === 1 ? 'is' : 'are'} scheduled but have no stream yet.`}
              </span>
              <button
                onClick={() => { haptics.tap(); setShowAllFixtures((v) => !v); }}
                tabIndex={0} data-tv-focusable
                className="px-2.5 py-1 rounded-full bg-zinc-800/70 text-zinc-300 font-bold hover:bg-zinc-700 hover:text-white transition-colors border border-white/10"
              >
                {showAllFixtures ? 'Only with streams' : 'Show full schedule'}
              </button>
            </div>
          )}

          {visible.length === 0 ? (
            <p className="text-zinc-500 py-10 text-center">
              {showAllFixtures
                ? 'No events match. Try another sport or the Channels tab.'
                : 'No fixtures currently have a match feed. Tap “Show full schedule” to see what’s coming, or use the Channels tab for live sports channels.'}
            </p>
          ) : (
            <div className="space-y-10">
              {eventGroups.map((g) => (
                <section key={g.title}>
                  <div className="flex items-center gap-3 mb-4">
                    {g.live && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.8)]" />}
                    <h3 className="text-xl font-display font-black tracking-tight text-white">{g.title}</h3>
                    <span className="text-xs font-bold text-zinc-500 tabular px-2 py-0.5 rounded-full bg-white/[0.05]">{g.events.length}</span>
                    <span aria-hidden className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                    {g.events.map(renderEvent)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
