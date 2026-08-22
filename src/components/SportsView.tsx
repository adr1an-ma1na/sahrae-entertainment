import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Trophy, Play, X, Maximize, Loader2, Radio, Tv, Clapperboard, CalendarClock, Search, ShieldCheck, AlertCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import Hls from 'hls.js';
import { Capacitor } from '@capacitor/core';
import { haptics } from '../services/haptics';
import { playerSandbox, isShieldOn, setShieldOn as persistShield, shieldAppliesHere } from '../services/adShield';
import {
  DEFAULT_CONFIG, markFailure, needsCheck, nextStream,
  type FailureReason, type Stream,
} from '../services/sportsStreams';
import { buildStreams, validateStream, metrics, canValidateDeeply } from '../services/streamValidation';
import { loadSportsFeed, sourcesById, fetchStreamsFor, type Feed, type FeedEvent } from '../services/sportsFeed';
import { hostOf } from '../services/sportsStreams';
import Coachmark from './Coachmark';

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
  { name: 'CazeTV', category: 'Football', desc: 'Football & live tournaments', url: 'https://dfr80qz435crc.cloudfront.net/MNOP/Amagi/Caze/Caze_TV_BR/Caze_TV.m3u8' },
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
  const universal = ['Red Bull TV', 'Fubo Sports', 'Stadium Live', 'Pluto Sports HD', 'beIN Sports XTRA']
    .map((n) => CHANNELS.find((c) => c.name === n))
    .filter((c): c is Channel => !!c);
  const seen = new Set<string>();
  const out: Channel[] = [];
  for (const c of [primary, ...sameCat, ...universal]) if (c && !seen.has(c.name)) { seen.add(c.name); out.push(c); }
  return out;
}

const initials = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const SPORT_EMOJI: Record<string, string> = {
  football: '⚽', 'american-football': '🏈', basketball: '🏀', baseball: '⚾', hockey: '🏒',
  'motor-sports': '🏎️', fight: '🥊', tennis: '🎾', cricket: '🏏', golf: '⛳', rugby: '🏉', darts: '🎯', other: '🏆',
};
/** Team crest with a graceful fallback: shows the badge image, but if it's
 *  missing or 404s, draws the team's initials so every event has a logo. */
function TeamLogo({ name, src }: { name: string; src?: string }) {
  const [err, setErr] = useState(false);
  if (src && !err) return <img src={src} alt="" onError={() => setErr(true)} className="w-10 h-10 object-contain" loading="lazy" />;
  return <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border border-white/10 flex items-center justify-center text-[11px] font-extrabold text-white">{initials(name) || '?'}</div>;
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
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
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
        startLevel: -1,
        // Prefer higher quality: don't cap the level to the (small) player box, and
        // assume a healthy pipe up front so ABR opens on a sharp rendition for sport.
        capLevelToPlayerSize: false,
        abrEwmaDefaultEstimate: 2_500_000,
      });
      let started = false;
      let netRetries = 0;
      // If nothing plays within 14s, consider the source dead and move on.
      const watchdog = setTimeout(() => { if (!started) { hls.destroy(); giveUp(); } }, 14000);
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.FRAG_BUFFERED, () => { started = true; });
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
      return () => { clearTimeout(watchdog); hls.destroy(); };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      const onMeta = () => video.play().catch(() => {});
      const onErr = () => giveUp();
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('error', onErr);
      const watchdog = setTimeout(() => { if (video.readyState < 2) giveUp(); }, 14000);
      return () => { clearTimeout(watchdog); video.removeEventListener('loadedmetadata', onMeta); video.removeEventListener('error', onErr); };
    }
  }, [src]);
  return <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain bg-black" controls autoPlay playsInline />;
};

// Cricfy-style: every server is listed up-front and stays put. A reliable
// channel plays instantly while match servers resolve in the background; the
// user can switch to any server at any time, and a dead source is marked (not
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

  // Ad Shield: Intercept window.open popup attempts globally while playing sports
  useEffect(() => {
    if (!playing) return;
    const originalOpen = window.open;
    window.open = function (...args: any[]) {
      console.warn('[Ad Shield Sports] Intercepted and blocked popup attempt:', args);
      setShowAdNotice(true);
      setTimeout(() => setShowAdNotice(false), 6000);
      return null;
    };
    return () => {
      window.open = originalOpen;
    };
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && playing) setPlaying(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) playerRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  // Badge host. The live API serves team badges from its own origin.
  const base = 'https://streamed.pk';
  const badge = (b?: string) => (b ? `${base}/api/images/badge/${b}.webp` : '');
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
    // embeds, we say so instead — the real fallback channels below still play.
    const rawEmbeds = m.embeds && m.embeds.length > 0 ? [...m.embeds] : [];

    // Build the normalised stream set: the feed's real servers plus this sport's
    // verified always-on channels, so an event never opens with nothing at all.
    const sources = buildStreams(
      m.id,
      rawEmbeds.slice(0, 8),
      fallbackChannels(m.category).map((ch) => ({ name: `📺 ${ch.name}`, url: ch.url })),
    );

    const idx = initialServerIdx !== undefined && initialServerIdx < sources.length ? initialServerIdx : 0;
    setPlaying({ title: matchTitle(m), tokens, sources, idx, failed: new Set() });

    // Expand the API's per-stream detail for this match: exact embed URLs plus
    // REAL hd/language flags. Quality is only ever labelled from what the
    // provider reports, never inferred from a name.
    const apiSources = sourcesById.get(m.id);
    if (apiSources?.length) {
      void (async () => {
        const metas = (await Promise.all(
          apiSources.slice(0, 4).map((src) => fetchStreamsFor(src.source, src.id)),
        )).flat().filter(Boolean) as NonNullable<FeedEvent['streamMeta']>;
        if (!metas.length) return;
        // Build the merged list from the ref, not inside a state updater, so the
        // ids we then validate are the SAME objects that land in state. Deriving
        // ids separately silently validated streams that did not exist.
        const p = playingRef.current;
        if (!p) return;
        const channels = p.sources.filter((s) => s.kind === 'channel');
        const servers: Stream[] = metas.slice(0, 8).map((meta, i) => {
          const label = meta.language
            ? `${meta.source} · ${meta.language.split(' - ')[0]}`
            : `${meta.source} ${meta.streamNo}`;
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
        setPlaying((prev) => (prev ? { ...prev, sources, failed } : prev)); // nothing left; stay put
      } else {
        metrics.failoversSucceeded++;
        const idx = sources.findIndex((s) => s.id === next.id);
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
    if (sport === 'all') {
      if (live.length) groups.push({ title: 'Live Now', live: true, events: live });
      const byCat = new Map<string, FeedEvent[]>();
      for (const m of visible) {
        if (eventIsLive(m)) continue;
        if (!byCat.has(m.category)) byCat.set(m.category, []);
        byCat.get(m.category)!.push(m);
      }
      const cats = Array.from(byCat.keys()).sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
      for (const c of cats) groups.push({ title: SPORT_LABELS[c] || c, events: byCat.get(c)! });
    } else if (sport === 'live') {
      groups.push({ title: 'Live Now', live: true, events: visible });
    } else {
      if (live.length) groups.push({ title: 'Live Now', live: true, events: live });
      const rest = visible.filter((m) => !eventIsLive(m));
      if (rest.length) groups.push({ title: 'Upcoming', events: rest });
    }
    return groups;
  }, [visible, sport]);

  const renderEvent = (m: FeedEvent) => {
    const home = m.teams?.home, away = m.teams?.away;
    return (
      <div key={m.id} onClick={() => openEvent(m)} tabIndex={0} data-tv-focusable role="button" aria-label={m.title}
        className="card-lift tier-card group relative rounded-2xl p-5 cursor-pointer focus:outline-none flex flex-col justify-between h-full border border-white/5 bg-zinc-900/40 hover:border-amber-500/30 transition-all duration-300">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${getSportBadgeClass(m.category)}`}>
              <span>{SPORT_EMOJI[m.category] || '🏆'}</span> 
              <span>{SPORT_LABELS[m.category] || m.category}</span>
            </span>
            {eventIsLive(m) ? (
              <span className="live-badge flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-zinc-400 font-medium tabular"><CalendarClock className="w-3.5 h-3.5 text-zinc-500" /> {formatEventDateTime(m.date)}</span>
            )}
          </div>
          
          {home?.name && away?.name ? (
            <div className="flex items-center justify-center gap-4 py-3 my-1">
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <TeamLogo name={home.name} src={home.badge ? badge(home.badge) : undefined} />
                <span className="text-xs font-semibold text-zinc-200 text-center line-clamp-2 leading-snug group-hover:text-white transition-colors">{home.name}</span>
              </div>
              <span className="text-zinc-600 text-xs font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5">vs</span>
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <TeamLogo name={away.name} src={away.badge ? badge(away.badge) : undefined} />
                <span className="text-xs font-semibold text-zinc-200 text-center line-clamp-2 leading-snug group-hover:text-white transition-colors">{away.name}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-3 my-1 min-h-[56px]">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">{SPORT_EMOJI[m.category] || '🏆'}</div>
              <h3 className="text-sm font-bold text-zinc-200 leading-snug line-clamp-2 group-hover:text-amber-400 transition-colors">{m.title}</h3>
            </div>
          )}
        </div>

        <div>
          {/* Directly show Server Pills on the card - doesn't need to wait for scheduled time to show! */}
          {m.embeds && m.embeds.length > 0 && (
            <div className="mt-2 pt-3 border-t border-white/5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mr-1">Feeds:</span>
              {m.embeds.slice(0, 4).map((embed, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    openEvent(m, idx);
                  }}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-amber-500 hover:text-amber-950 text-[10px] font-bold text-zinc-300 transition-all border border-white/5 hover:border-amber-500/50 shadow-sm"
                  title={`Open Feed Server ${idx + 1}`}
                >
                  Server {idx + 1}
                </button>
              ))}
            </div>
          )}

          {/* Say which of the two situations this is, instead of promising
              "Watch Main" for a fixture with no streams. A card that offers a
              match feed it does not have is how users end up staring at dead
              servers. */}
          {(m.embeds?.length || 0) > 0 ? (
            <button className="mt-4 w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold bg-white/5 text-zinc-300 group-hover:bg-amber-500 group-hover:text-amber-950 hover:bg-white/10 transition-all duration-300 pointer-events-none">
              <Play className="w-4 h-4 fill-current" /> Watch Main
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 group-hover:bg-amber-900/20 group-hover:text-amber-950/80 font-bold tracking-wider">
                HD
              </span>
            </button>
          ) : (
            <button className="mt-4 w-full py-2.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-sm font-bold bg-white/5 text-zinc-400 group-hover:bg-white/10 transition-all duration-300 pointer-events-none">
              <span className="flex items-center gap-2"><Tv className="w-4 h-4" /> Sports channels</span>
              <span className="text-[9px] font-medium text-zinc-500 tracking-wide">
                {eventIsLive(m) ? 'No match feed for this one yet' : 'Match feed appears near kick-off'}
              </span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const activeSrc = playing ? playing.sources[playing.idx] : undefined;
  const activeUrl = activeSrc?.url;
  const isEmbedUrl = activeUrl ? (!activeUrl.includes('.m3u8') && activeSrc?.kind === 'server') : false;

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12 relative">
      {/* Aurora glow behind the header */}
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-64 -z-10 opacity-70"
        style={{ background: 'radial-gradient(60% 70% at 12% 0%, rgba(245,158,11,0.20), transparent 70%), radial-gradient(50% 60% at 85% 8%, rgba(244,63,94,0.16), transparent 72%)', filter: 'blur(8px)' }} />
      {/* Player */}
      {playing && (
        <div role="dialog" data-tv-layer className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-sm p-3 md:p-10">
          <div className="w-full max-w-5xl flex flex-col gap-3">
            <div ref={playerRef} className="w-full aspect-video bg-black rounded-lg shadow-2xl overflow-hidden relative border border-white/10">
              <div className="absolute top-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center gap-1.5 bg-red-500 text-white px-2.5 py-1 rounded-sm shrink-0"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span className="text-xs font-bold uppercase tracking-wider">Live</span></div>
                  <h3 className="text-white font-bold text-sm md:text-lg drop-shadow-md truncate">{playing.title}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Reflects the REAL state. This used to read "Ad Shield
                      Protected" unconditionally, including on the web where
                      nothing was blocking anything — a badge claiming
                      protection the build did not have. It is now a live
                      toggle on web and a plain status on Android. */}
                  {isEmbedUrl && (shieldAppliesHere() ? (
                    <button
                      onClick={() => { const n = !shieldOn; setShieldOn(n); persistShield(n); haptics.tap(); }}
                      role="switch"
                      aria-checked={shieldOn}
                      title={shieldOn
                        ? "Ad Shield on — pop-ups blocked. If this stream won't start, turn it off or try another server."
                        : 'Ad Shield off — provider pop-ups are NOT blocked.'}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 shadow-sm transition-colors ${
                        shieldOn
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'text-zinc-400 bg-zinc-900/80 border-white/10 hover:text-white'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Ad Shield {shieldOn ? 'On' : 'Off'}
                    </button>
                  ) : (
                    <div className="text-xs font-bold text-emerald-400 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5 shadow-sm">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Ad Shield Protected
                    </div>
                  ))}
                  {activeSrc?.kind === 'server' && (
                    <button
                      onClick={reportCurrentSportsServerDead}
                      className="px-3 py-1.5 text-xs font-bold bg-zinc-900/80 hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 text-zinc-300 hover:text-red-400 rounded-lg flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                      title="Report stream dead or slow and auto-switch to the next server"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" /> Dead Server?
                    </button>
                  )}
                  <button onClick={toggleFullScreen} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center border border-white/10"><Maximize className="w-5 h-5" /></button>
                  <button onClick={() => setPlaying(null)} tabIndex={0} data-tv-focusable data-tv-close className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
                </div>
              </div>
              {activeUrl && !isEmbedUrl ? (
                <HLSPlayer src={activeUrl} onUnplayable={onUnplayable} />
              ) : activeUrl && isEmbedUrl ? (
                <div className="absolute inset-0 w-full h-full">
                  <iframe
                    // Re-mount when the shield flips: sandbox only applies at
                    // frame creation, so toggling has to rebuild the iframe.
                    key={`sports-${shieldOn ? 'shield' : 'open'}`}
                    src={activeUrl}
                    className="absolute inset-0 w-full h-full border-0 bg-black"
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
                    sandbox={playerSandbox(shieldOn)}
                  />
                  {isSandboxed && (
                    <div className="absolute top-0 left-0 w-full z-40 bg-amber-500/95 text-amber-950 text-xs md:text-sm font-bold px-4 py-3 flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4 text-center backdrop-blur shadow-2xl border-b border-amber-400/30 animate-in slide-in-from-top-2">
                      <AlertCircle className="w-5 h-5 shrink-0 animate-bounce" />
                      <span>Google AI Studio's preview window blocks nested sports streams. <b>Sahrae plays flawlessly on its own tab!</b></span>
                      <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="bg-amber-950 text-amber-50 px-4 py-1.5 rounded-full whitespace-nowrap hover:bg-amber-900 transition-colors shadow-lg active:scale-95 flex items-center gap-1 text-xs">
                        Open Sahrae in New Tab <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                  {activeSrc?.status === 'offline' ? (
                    <>
                      <Radio className="w-9 h-9 text-zinc-500" />
                      <p className="text-white font-semibold">This server isn't responding</p>
                      <p className="text-zinc-400 text-sm">Pick another server below; the 📺 channel always works.</p>
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
                        <h4 className="text-sm font-bold text-red-400">Server marked dead</h4>
                        <button onClick={() => setShowServerDeadNotice(false)} className="text-zinc-400 hover:text-white transition-colors ml-2">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                        We've marked that feed down in your session and successfully switched you to the next available server.
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
                        {activeSrc.kind === 'channel' ? 'Channel' : 'Match feed'} · {activeSrc.label}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {activeSrc.status === 'working' && `Verified${activeSrc.quality ? ` · ${activeSrc.quality}` : ''}${activeSrc.latencyMs ? ` · ${activeSrc.latencyMs}ms` : ''} · health ${activeSrc.healthScore}/100`}
                        {activeSrc.status === 'degraded' && 'Reachable but slow — a better feed may be available below'}
                        {activeSrc.status === 'unverified' && 'Not verifiable in a browser — playing unchecked'}
                        {activeSrc.status === 'offline' && `Not responding${activeSrc.lastFailure ? ` (${activeSrc.lastFailure.reason})` : ''}`}
                        {activeSrc.status === 'checking' && 'Checking this feed…'}
                        {activeSrc.status === 'unknown' && 'Not checked yet'}
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
                  title: 'Match feeds',
                  hint: 'The actual game',
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
                      : s.status === 'unverified' ? 'Cannot be verified in a browser — may still play'
                      : s.status === 'offline' ? `Failed${s.lastFailure ? ` (${s.lastFailure.reason})` : ''} — tap to re-check`
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
              <Radio className="w-3.5 h-3.5" />
              {canValidateDeeply()
                ? 'Feeds are checked before they are offered, and the healthiest plays first. A dot means verified; the app switches automatically if one drops.'
                : 'A browser cannot verify these streams (cross-origin), so they are offered unverified. The Android app validates each one before playing it.'}
            </p>
          </div>
        </div>
      )}

      {/* Header + tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20"><Trophy className="w-6 h-6 text-white" /></div>
          <div>
            <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Live Sports</h2>
            <p className="text-sm text-zinc-400">Full schedule · F1 · Football · Cricket · Tennis · NBA · UFC</p>
          </div>
        </div>
        <div className="flex gap-1 glass p-1 rounded-xl self-start">
          {(['events', 'channels'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} tabIndex={0} data-tv-focusable
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${tab === t ? 'bg-amber-500 text-amber-950' : 'text-zinc-400 hover:text-white'}`}>
              {t === 'events' ? <><Clapperboard className="w-4 h-4" /> Live Events</> : <><Tv className="w-4 h-4" /> Channels</>}
            </button>
          ))}
        </div>
      </div>

      <Coachmark id="sports" text="Tap any event: a reliable channel plays instantly while the exact match servers load. Switch servers any time." />

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
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-zinc-400"><Loader2 className="w-10 h-10 animate-spin text-amber-500" /><span>Loading today's live sports…</span></div>
      ) : error || events.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3 text-center">
          <Radio className="w-10 h-10 text-zinc-600" />
          <p className="text-zinc-400 max-w-sm">Couldn't load the events feed right now. The Channels tab always has live HD sport.</p>
          <button onClick={load} tabIndex={0} data-tv-focusable className="px-6 py-3 bg-amber-500 text-amber-950 font-bold rounded-xl hover:bg-amber-400">Retry</button>
        </div>
      ) : (
        <>
          <div className="relative mb-4 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams, leagues…"
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>
          <div className="flex overflow-x-auto gap-2 pb-2 mb-6 scrollbar-hide">
            {filters.map((f) => (
              <button key={f} onClick={() => setSport(f)} tabIndex={0} data-tv-focusable
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${sport === f ? 'bg-white text-zinc-950 shadow-md' : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                {f === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                {f === 'all' ? 'All' : f === 'live' ? 'Live Now' : SPORT_LABELS[f] || f}
              </button>
            ))}
          </div>

          {/* Honest account of what is on screen and what is being held back. */}
          {withoutStreams > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4 text-[11px] text-zinc-500">
              <span>
                {showAllFixtures
                  ? `Showing the full schedule — ${withoutStreams} fixture${withoutStreams === 1 ? '' : 's'} have no match feed published yet.`
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
            <div className="space-y-8">
              {eventGroups.map((g) => (
                <section key={g.title}>
                  <div className="flex items-center gap-2 mb-3">
                    {g.live && <span className="live-dot w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                    <h3 className={`text-lg font-display font-bold tracking-tight ${g.live ? 'text-red-400' : 'text-white'}`}>{g.title}</h3>
                    <span className="text-xs text-zinc-500 tabular">{g.events.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
