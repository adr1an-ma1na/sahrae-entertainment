import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Trophy, Play, X, Maximize, Loader2, Radio, Tv, Clapperboard, CalendarClock, Search } from 'lucide-react';
import Hls from 'hls.js';
import { haptics } from '../services/haptics';

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
// Stored base64-encoded so a casual `strings`/grep of the APK doesn't surface
// the backing repo; decoded at runtime.
const FEED_URLS = [
  'aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2FkcjFhbi1tYTFuYS9zYWhyYWUtc3BvcnRzLWZlZWQvbWFpbi9mZWVkLmpzb24=',
  'aHR0cHM6Ly9jZG4uanNkZWxpdnIubmV0L2doL2FkcjFhbi1tYTFuYS9zYWhyYWUtc3BvcnRzLWZlZWRAbWFpbi9mZWVkLmpzb24=',
].map((s) => atob(s));
const FEED_CACHE_KEY = 'sahrae.sportsFeed.v1';
const proxied = (m3u8: string, referer?: string) =>
  `https://localhost/__hlsproxy?u=${encodeURIComponent(m3u8)}${referer ? `&r=${encodeURIComponent(referer)}` : ''}`;

/**
 * Resolve an embed URL → playable .m3u8 ON THIS DEVICE.
 * The native layer (/__embed2m3u8) loads the embed in a hidden WebView, lets its
 * player JS run, and captures the stream URL — so the CDN token binds to *this*
 * device's IP and actually plays (server-resolved tokens are IP-locked → 403).
 */
async function resolveEmbed(embed: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 16000);
    const r = await fetch(`https://localhost/__embed2m3u8?u=${encodeURIComponent(embed)}`, {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.m3u8 === 'string' && j.m3u8 ? j.m3u8 : null;
  } catch {
    return null;
  }
}

/**
 * Confirm a resolved stream actually serves a live playlist (filters dead /
 * 403 / slate sources before we ever show them) — fetched through the same
 * device-side proxy the player uses, so "it validated" means "it will play".
 */
async function validateStream(proxiedUrl: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(proxiedUrl, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return false;
    const txt = await r.text();
    return txt.includes('#EXTM3U') && txt.length > 40;
  } catch {
    return false;
  }
}

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
  { name: 'FIFA+', category: 'Football', desc: 'Football, live & archive', url: 'https://a62dad94.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0ZJRkFQbHVzRW5nbGlzaF9ITFM/playlist.m3u8' },
  { name: 'Real Madrid TV', category: 'Football', desc: 'Los Blancos 24/7', url: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8' },
  { name: 'CazeTV', category: 'Football', desc: 'Football & more', url: 'https://dfr80qz435crc.cloudfront.net/MNOP/Amagi/Caze/Caze_TV_BR/Caze_TV.m3u8' },
  { name: 'DAZN Combat', category: 'Combat', desc: 'Boxing, MMA & combat', url: 'https://dazn-combat-rakuten.amagi.tv/hls/amagi_hls_data_rakutenAA-dazn-combat-rakuten/CDN/master.m3u8' },
  { name: 'GLORY Kickboxing', category: 'Combat', desc: 'Kickboxing events', url: 'https://6f972d29.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0dsb3J5S2lja2JveGluZ19ITFM/playlist.m3u8' },
  { name: 'Cricket Gold', category: 'Cricket', desc: 'Cricket, all formats', url: 'https://streams2.sofast.tv/ptnr-yupptv/title-cricketgold/v1/master/611d79b11b77e2f571934fd80ca1413453772ac7/b2048bb8-1686-4432-aa50-647245383e0c/manifest.m3u8' },
  { name: 'Tennis Channel', category: 'Tennis', desc: 'ATP / WTA tennis', url: 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01444-tennischannelth-tennischannelnl-samsungnl/playlist.m3u8' },
  { name: 'Red Bull TV', category: 'Motorsport', desc: 'Motorsport & action', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8' },
  { name: 'ESPN8: The Ocho', category: 'General', desc: 'Wild & wonderful sports', url: 'https://d3b6q2ou5kp8ke.cloudfront.net/ESPNTheOcho.m3u8' },
  { name: 'Stadium', category: 'General', desc: 'Live US sports', url: 'https://wurl120sports.global.transmit.live/hls/679a907dce42a042c23ace37/v1/stadium_gracenote/samsung_us/latest/main/hls/playlist.m3u8' },
  { name: 'Fubo Sports', category: 'General', desc: 'Live sports & talk', url: 'https://dnf08l6u6uxnz.cloudfront.net/master.m3u8' },
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
  const universal = ['Red Bull TV', 'Fubo Sports', 'Stadium', 'FIFA+']
    .map((n) => CHANNELS.find((c) => c.name === n))
    .filter((c): c is Channel => !!c && c.name !== primary.name);
  return [primary, ...universal];
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

interface FeedEvent {
  id: string;
  title: string;
  category: string;
  date: number;
  popular?: boolean;
  live?: boolean;
  teams?: { home?: { name?: string; badge?: string }; away?: { name?: string; badge?: string } } | null;
  /** Embed URLs (streamed.su/embed.st) — resolved to a playable stream on-device. */
  embeds?: string[];
}
interface Feed { updated: number; base?: string; count: number; resolved?: number; events: FeedEvent[] }

const SPORT_LABELS: Record<string, string> = {
  football: 'Football', 'american-football': 'NFL', basketball: 'Basketball', baseball: 'Baseball',
  hockey: 'Hockey', 'motor-sports': 'Motorsport', fight: 'Combat', tennis: 'Tennis', cricket: 'Cricket',
  golf: 'Golf', rugby: 'Rugby', darts: 'Darts', other: 'Other',
};

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
        abrEwmaDefaultEstimate: 1_200_000,
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
        const manifestDead = d.includes('manifestLoad') || d.includes('manifestParsing');
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (manifestDead || netRetries >= 2) { hls.destroy(); giveUp(); }
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
type SrcStatus = 'ready' | 'idle' | 'loading' | 'failed';
interface Source { id: string; label: string; kind: 'channel' | 'server'; embed?: string; url?: string; status: SrcStatus }
interface Playing { title: string; tokens: string[]; sources: Source[]; idx: number }

export default function SportsView() {
  const [tab, setTab] = useState<'events' | 'channels'>('events');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [sport, setSport] = useState('all');
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState<Playing | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);

    const tryFetch = async (): Promise<Feed | null> => {
      for (const url of FEED_URLS) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 11000);
          const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
          clearTimeout(to);
          if (res.ok) {
            const data = (await res.json()) as Feed;
            if (data && Array.isArray(data.events)) return data;
          }
        } catch {
          /* try the next mirror */
        }
      }
      return null;
    };

    let data = await tryFetch();
    if (!data) {
      await new Promise((r) => setTimeout(r, 1500));
      data = await tryFetch();
    }

    if (data) {
      try { localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
      setFeed(data);
    } else {
      // Never strand the user on an error if we've ever loaded a feed before.
      let cached: Feed | null = null;
      try {
        const s = localStorage.getItem(FEED_CACHE_KEY);
        cached = s ? (JSON.parse(s) as Feed) : null;
      } catch { /* ignore */ }
      if (cached) setFeed(cached);
      else setError(true);
    }
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

  const base = feed?.base || 'https://streamed.pk';
  const badge = (b?: string) => (b ? `${base}/api/images/badge/${b}.webp` : '');
  const eventTime = (d: number) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const matchTitle = (m: FeedEvent) =>
    m.teams?.home?.name && m.teams?.away?.name ? `${m.teams.home.name} vs ${m.teams.away.name}` : m.title;

  // Friendly, distinct name per source server, parsed from its embed URL
  // (embed.st/embed/{server}/{id}/{streamNo}) so switching to find the right
  // match is obvious — the free providers occasionally mislabel a feed.
  const sourceLabel = (embed: string): string => {
    const m = embed.match(/\/embed\/([^/]+)\/[^/]+\/(\d+)/);
    if (!m) return 'HD';
    return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} ${m[2]}`;
  };

  const patchSource = (id: string, patch: Partial<Source>) =>
    setPlaying((p) => (p ? { ...p, sources: p.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : p));

  // Resolve a server's embed → playable stream (on-device, so the token binds to
  // this IP). `autoSwitch` upgrades from the channel to the FIRST matching server
  // on its own, but never pulls the user off a server they picked.
  const resolveServer = useCallback(async (id: string, embed: string, tokens: string[], autoSwitch: boolean) => {
    patchSource(id, { status: 'loading' });
    const m3u8 = await resolveEmbed(embed);
    let url: string | null = null;
    if (m3u8) {
      const u = proxied(m3u8, 'https://embed.st/');
      if (await validateStream(u)) url = u;
    }
    if (!url) { patchSource(id, { status: 'failed' }); return; }
    const matched = m3u8 ? streamMatchesEvent(m3u8, tokens) : false;
    setPlaying((p) => {
      if (!p) return p;
      const sources = p.sources.map((s) => (s.id === id ? { ...s, status: 'ready' as SrcStatus, url: url!, label: matched && !s.label.endsWith('✓') ? `${s.label} ✓` : s.label } : s));
      const onChannel = p.sources[p.idx]?.kind === 'channel';
      const idx = autoSwitch && onChannel && matched ? sources.findIndex((s) => s.id === id) : p.idx;
      return { ...p, sources, idx };
    });
  }, []);

  const openEvent = (m: FeedEvent) => {
    const tokens = eventTokens(m);
    const servers: Source[] = (m.embeds || []).slice(0, 6).map((embed, i) => ({
      id: `srv-${i}`, label: `Server ${i + 1}`, kind: 'server', embed, status: 'idle',
    }));
    // MULTIPLE guaranteed channels so a live event NEVER opens with nothing to
    // watch — and if one channel is down it cascades to the next.
    const channels: Source[] = fallbackChannels(m.category).map((ch, i) => ({
      id: `ch-${i}`, label: `📺 ${ch.name}`, kind: 'channel', url: ch.url, status: 'ready',
    }));
    const sources = [...servers, ...channels];

    // The first reliable channel plays the INSTANT you open — no spinner, no
    // waiting. Servers are all listed immediately; we quietly resolve the first
    // few so the exact match can take over on its own, any server one tap away.
    setPlaying({ title: matchTitle(m), tokens, sources, idx: servers.length });
    servers.slice(0, 3).forEach((s) => resolveServer(s.id, s.embed!, tokens, true));
  };

  // Tap a server → switch to it; resolve on demand if it isn't ready yet (and
  // retry a previously-failed one). The list itself never changes.
  const selectSource = (i: number) => {
    haptics.tap();
    setPlaying((p) => (p ? { ...p, idx: i } : p));
    const s = playing?.sources[i];
    if (s && s.kind === 'server' && !s.url && (s.status === 'idle' || s.status === 'failed') && s.embed) {
      resolveServer(s.id, s.embed, playing!.tokens, false);
    }
  };

  // A playing source died → mark it failed (keep it in the list for retry) and
  // fall back to the always-reliable channel. Never collapses to nothing.
  const onUnplayable = useCallback(() => {
    setPlaying((p) => {
      if (!p) return p;
      const sources = p.sources.map((s, i) => (i === p.idx ? { ...s, status: 'failed' as SrcStatus, url: undefined } : s));
      // Cascade to the next working channel after the current one (or the first
      // working channel) so we never strand the viewer on a dead source.
      const chans = sources.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'channel' && x.s.status !== 'failed');
      const next = chans.find((x) => x.i > p.idx) || chans[0];
      return { ...p, sources, idx: next ? next.i : p.idx };
    });
  }, []);

  const events = feed?.events || [];
  // Only show what's live, in progress, or still to come — drop events that are
  // clearly finished (not live and started more than ~3.5h ago).
  const activeEvents = useMemo(() => {
    const now = Date.now();
    return events.filter((m) => {
      if (!m.date) return true;          // no time → keep (always-on / unknown)
      if (m.date > now) return true;     // upcoming
      if (m.live) return true;           // feed says it's on → always show it
      const dur = SPORT_DURATION_MS[m.category] ?? 3 * HR;
      // Non-live past events: keep until their runtime elapses, then drop.
      return now - m.date <= dur;
    });
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
    return activeEvents
      .filter((m) => (sport === 'live' ? eventIsLive(m) : sport === 'all' ? true : m.category === sport))
      .filter((m) => !q || matchTitle(m).toLowerCase().includes(q))
      .sort((a, b) => (eventIsLive(b) ? 1 : 0) - (eventIsLive(a) ? 1 : 0) || ((b.embeds?.length || 0) ? 1 : 0) - ((a.embeds?.length || 0) ? 1 : 0) || a.date - b.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvents, sport, search]);

  // Organised into shelves: Live Now first, then grouped by sport.
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
        className="card-lift tier-card group relative rounded-2xl p-4 cursor-pointer focus:outline-none">
        <div className="flex items-center justify-between mb-2">
          <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-bold uppercase tracking-wider text-amber-400">{SPORT_LABELS[m.category] || m.category}</span>
          {eventIsLive(m) ? (
            <span className="live-badge flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"><span className="live-dot w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE</span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-zinc-400 tabular"><CalendarClock className="w-3 h-3" /> {eventTime(m.date)}</span>
          )}
        </div>
        {home?.name && away?.name ? (
          <div className="flex items-center justify-center gap-3 py-1">
            <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
              <TeamLogo name={home.name} src={home.badge ? badge(home.badge) : undefined} />
              <span className="text-xs font-semibold text-white text-center line-clamp-2">{home.name}</span>
            </div>
            <span className="text-zinc-500 text-xs font-bold">vs</span>
            <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
              <TeamLogo name={away.name} src={away.badge ? badge(away.badge) : undefined} />
              <span className="text-xs font-semibold text-white text-center line-clamp-2">{away.name}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-1 min-h-[40px]">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl shrink-0">{SPORT_EMOJI[m.category] || '🏆'}</div>
            <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 group-hover:text-amber-400 transition-colors">{m.title}</h3>
          </div>
        )}
        <button className="mt-3 w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-bold bg-white/10 text-white group-hover:bg-amber-500 group-hover:text-amber-950 transition-all pointer-events-none">
          <Play className="w-4 h-4 fill-current" /> Watch
          {(m.embeds?.length || 0) > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 group-hover:bg-amber-900/20 group-hover:text-amber-900 font-bold">HD FEED</span>}
        </button>
      </div>
    );
  };

  const activeSrc = playing ? playing.sources[playing.idx] : undefined;
  const activeUrl = activeSrc?.url;

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
                  <button onClick={toggleFullScreen} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center border border-white/10"><Maximize className="w-5 h-5" /></button>
                  <button onClick={() => setPlaying(null)} tabIndex={0} data-tv-focusable data-tv-close className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
                </div>
              </div>
              {activeUrl ? (
                <HLSPlayer src={activeUrl} onUnplayable={onUnplayable} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                  {activeSrc?.status === 'failed' ? (
                    <>
                      <Radio className="w-9 h-9 text-zinc-500" />
                      <p className="text-white font-semibold">This server isn't responding</p>
                      <p className="text-zinc-400 text-sm">Pick another server below — the 📺 channel always works.</p>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-9 h-9 animate-spin text-amber-500" />
                      <p className="text-white font-medium">Loading {activeSrc?.label || 'stream'}…</p>
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Server picker — every source is always here; tap to switch. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mr-1">Servers:</span>
              {playing.sources.map((s, i) => {
                const activeBtn = i === playing.idx;
                return (
                  <button key={s.id} onClick={() => selectSource(i)} tabIndex={0} data-tv-focusable
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                      activeBtn ? 'bg-amber-500 text-amber-950 border-amber-500'
                      : s.status === 'failed' ? 'bg-zinc-900/60 text-zinc-500 border-white/5 hover:bg-zinc-800'
                      : 'bg-zinc-800/80 text-zinc-300 border-white/10 hover:bg-zinc-700'}`}>
                    {s.status === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
                    {s.status === 'ready' && s.kind === 'server' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    {s.label}
                    {s.status === 'failed' && <span className="opacity-70">↻</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-500 flex items-center gap-2"><Radio className="w-3.5 h-3.5" /> The 📺 channel plays instantly. Tap a server for the exact match feed — switch any time.</p>
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

      {tab === 'channels' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {CHANNELS.map((ch) => (
            <div key={ch.name} onClick={() => setPlaying({ title: ch.name, sources: [{ label: 'HD', url: ch.url }], idx: 0 })} tabIndex={0} data-tv-focusable role="button" aria-label={ch.name}
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

          {visible.length === 0 ? (
            <p className="text-zinc-500 py-10 text-center">No events match. Try another sport or the Channels tab.</p>
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
