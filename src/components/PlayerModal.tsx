import { EyeOff, ChevronDown, X, ExternalLink, AlertCircle, Info, Star, Calendar, Clock, Play, RefreshCw, Plus, Check, Maximize, ArrowLeft, SkipBack, SkipForward, ThumbsUp, ThumbsDown, Download, Server, Waves, ShieldCheck, AlertTriangle, Gauge, Users } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { fetchMediaDetails, MediaDetails, getImageUrl, fetchSimilar, MediaItem, SeasonDetails, fetchSeasonDetails } from '../services/tmdb';
import { useWatchProgress } from '../hooks/useWatchProgress';
import { useMyList } from '../hooks/useMyList';
import { loadEq, saveEq, EQ_PRESETS, PRESET_EXTRAS } from '../services/eq';
import { haptics } from '../services/haptics';
import MovieDownloadModal from './MovieDownloadModal';
import { posterColor, cachedPosterColor } from '../services/posterColor';
import { playerSandbox, isShieldOn, setShieldOn as persistShield, shieldAppliesHere, refusesSandbox, playerReferrer } from '../services/adShield';
import { suppressPopups } from '../services/popupGuard';
import { lockLandscape, unlockOrientation } from '../services/fullscreen';
import CleanPlayer from './CleanPlayer';
import { canPlayClean, resolveFilmStream, relayUrl, cleanFirst, isCleanOn, setCleanOn } from '../services/cleanStream';
import { isTelevision } from '../tv/spatialNavigation';
import { NO_START_LIMIT_MS, COUNTDOWN_S, isPlaybackEvidence, markWorking, markDown, startServer } from '../services/serverHealth';
import { reportScreen } from '../services/remote';
import { t } from '../i18n';
import { reportRoomNow } from '../services/room';
import { OPEN_PARTY } from './WatchParty';
import { useServerPool, fill as fillTemplate, label as poolLabel, type PoolServer } from '../services/serverPool';
import { useDataSaver, usePicture, announcePlayerSource, canCapVideo, canMeasure, estimateText, formatBytes, readReceivedBytes } from '../services/dataSaver';
import { NO_CROWD, crowdChoice, fetchProof, fetchSeasonPlayable, nextServerRanked, reportPlay, titleKey, warmUp, type CrowdChoice, type ProofRow } from '../services/playProof';

/** How soon the crowd's answer must arrive to change the opening server; later it would interrupt a loading player. */
const CROWD_FOLLOW_MS = 4000;
/** No-start wait when another server is proven on this title: a known way out is worth taking sooner. */
const PROVEN_ALTERNATIVE_LIMIT_MS = 20000;
/** How long a server's page gets to load before it is reloaded once, then left (owner's call, 2026-10-25: 20 s). */
const SERVER_LOAD_MS = 20000;
/** Seconds between an episode ending and the next one starting by itself. */
const UP_NEXT_S = 3;

interface PlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId: number | null;
  mediaType: 'movie' | 'tv' | null;
  startInInfo?: boolean;
  initialSeason?: number;
  initialEpisode?: number;
  playTrailer?: boolean;
}

/** True when `src` is the provider's frame or a frame inside it. */
function fromFrame(root: Window | null | undefined, src: MessageEventSource | null): boolean {
  if (!root || !src) return false;
  const within = (w: Window, depth: number): boolean => {
    if (w === src) return true;
    if (depth >= 3) return false;
    try { for (let k = 0; k < w.frames.length; k++) if (within(w.frames[k] as Window, depth + 1)) return true; } catch { /* frame going away */ }
    return false;
  };
  return within(root, 0);
}

const nativeShell = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();
/** Sahrae's own player reached the end of an episode. */
const CLEAN_ENDED = 'sahrae:clean-ended';

export default function PlayerModal({ isOpen, onClose, mediaId, mediaType, startInInfo = false, initialSeason, initialEpisode, playTrailer = false }: PlayerModalProps) {
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [seasonDetails, setSeasonDetails] = useState<SeasonDetails | null>(null);
  const [similar, setSimilar] = useState<MediaItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [infoTab, setInfoTab] = useState<'details' | 'similar' | 'episodes'>('details');
  const [playingTrailer, setPlayingTrailer] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState(initialSeason || 1);
  const [selectedEpisode, setSelectedEpisode] = useState(initialEpisode || 1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentMediaId, setCurrentMediaId] = useState<number | null>(mediaId);
  const [currentMediaType, setCurrentMediaType] = useState<'movie' | 'tv' | null>(mediaType);
  const [isSandboxed, setIsSandboxed] = useState(false);
  // Up next: the seconds left before the next episode starts on its own, like
  // Netflix, once this one ends. null when no countdown is running.
  const [upNext, setUpNext] = useState<number | null>(null);
  const upNextTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // An episode's end is acted on once, even though players repeat the news.
  const endHandledRef = useRef(false);
  const [showControls, setShowControls] = useState(true);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [offlineBlobUrl, setOfflineBlobUrl] = useState<string | null>(null);
  const [showDownload, setShowDownload] = useState(false);
  // Ad Shield: sandboxes the embed on web (the only real popup block a page
  // has). Re-keys the iframe so toggling it takes effect immediately.
  const [shieldOn, setShieldOn] = useState<boolean>(() => isShieldOn());

  // Download = open the REAL VidVault provider page (MovieDownloadModal). The
  // previous build faked this by generating a canvas "offline player" clip and
  // storing it in IndexedDB, so every download played a placeholder instead of
  // the movie. That whole fake path (videoDownloads.download / localUrl / the
  // IndexedDB status polling) is gone; the actual file now comes from VidVault
  // and, in the Android app, is captured by the native DownloadListener into the
  // app's own storage.
  const handleOpenDownload = () => {
    if (!currentMediaId || !currentMediaType || !details) return;
    setShowDownload(true);
  };
  // VidVault is the download provider only — deliberately not in SERVERS.
  const downloadUrl = currentMediaId && currentMediaType
    ? (currentMediaType === 'movie'
        ? `https://vidvault.to/movie/${currentMediaId}`
        : `https://vidvault.to/tv/${currentMediaId}/${selectedSeason}/${selectedEpisode}`)
    : '';
  // Colour lifted from this title's own poster, used to tint the detail header.
  const [headerTint, setHeaderTint] = useState<string | null>(null);
  useEffect(() => {
    const art = details?.poster_path || details?.backdrop_path;
    if (!art) { setHeaderTint(null); return; }
    const url = getImageUrl(art, 'w185'); // small file — fast to fetch and decode
    setHeaderTint(cachedPosterColor(url));
    let alive = true;
    posterColor(url).then((c) => { if (alive) setHeaderTint(c); });
    return () => { alive = false; };
  }, [details?.poster_path, details?.backdrop_path]);

  const [showXRay, setShowXRay] = useState(false);
  // Loading indicator + slow-load recovery for the video embed.
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  // Audio enhancement (native global EQ / virtualizer — affects the movie audio too).
  const [eqPreset, setEqPreset] = useState<string>(() => loadEq().preset);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showAdNotice, setShowAdNotice] = useState(false);
  const [failedServers, setFailedServers] = useState<string[]>([]);
  const [showServerDeadNotice, setShowServerDeadNotice] = useState(false);

  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadTimerRef = useRef<NodeJS.Timeout | null>(null);
  const slowTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoRetriedRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const heardRef = useRef(false);
  const engagedRef = useRef(false);
  const noStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepTryingRef = useRef<() => void>(() => {});
  const [countdown, setCountdown] = useState<{ from: string; to: string; left: number } | null>(null);
  const failedServersRef = useRef<string[]>([]);
  const [switchNotice, setSwitchNotice] = useState<{ from: string; to: string } | null>(null);
  // What other viewers saw play for this exact title (services/playProof.ts).
  const [crowd, setCrowd] = useState<CrowdChoice>(NO_CROWD);
  const crowdRef = useRef<{ choice: CrowdChoice; rows: ProofRow[] }>({ choice: NO_CROWD, rows: [] });
  const [seasonPlayable, setSeasonPlayable] = useState<Set<number>>(() => new Set());
  const [dataSaver, setDataSaverOn] = useDataSaver();
  // Films play at Best (the owner removed the choice, 2026-10-26); Data Saver still caps them.
  const [picture] = usePicture();
  // Data this viewing has used, measured by the Android app; null where it cannot be.
  const [usedBytes, setUsedBytes] = useState<number | null>(null);
  // A server the viewer picked by hand is theirs; the crowd never overrides it.
  const manualPickRef = useRef(false);
  const pickServer = (idx: number) => { manualPickRef.current = true; setSelectedServer(idx); };

  // Go fullscreen AFTER the embed has loaded and started playing (fired from the
  // iframe's onLoad), not the instant Play is tapped. Tapping Play then waiting
  // for the embed to autostart and only then fullscreening avoids the old
  // "fullscreen first → tap play → drops out of fullscreen" double-tap mess.
  const enterFullscreen = useCallback(() => {
    if (nativeShell) { setMaxed(true); return; }
    if (document.fullscreenElement) return; // already fullscreen — don't re-request
    playerContainerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // ── Full screen is the PLAYER's, never the provider's ────────────────────
  // A provider's own full-screen button used to put just its iframe over the
  // whole screen, hiding Sahrae's bar; some providers drop out of it on pause,
  // so the bar flickered in and out. In the Android app the shell declines the
  // provider's request and calls __sahraePlayerFullscreen instead, so every
  // route to full screen (theirs, ours, the automatic one) lands on the same
  // view: the provider's frame filling the screen above Sahrae's bar.
  const [maxed, setMaxed] = useState(false);
  const maxedRef = useRef(false);
  maxedRef.current = maxed;

  useEffect(() => {
    setIsSandboxed(window.self !== window.top);
  }, []);

  // Ad Shield redirect prevention for Movies and Series
  useEffect(() => {
    if (!isOpen || !isPlaying) return;

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
  }, [isOpen, isPlaying]);

  // Detect clicks/interaction on the third-party iframe (blur of parent window)
  useEffect(() => {
    if (!isOpen || !isPlaying) {
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
  }, [isOpen, isPlaying]);

  // Catch popups opened by OUR OWN page while the player is up.
  //
  // Scope note, because the previous version of this was branded "Ad Shield" and
  // oversold: overriding window.open here only affects code running in THIS
  // document. An ad inside the embed calls the iframe's own window.open, which
  // this cannot see or touch — cross-origin, by design. The thing that actually
  // blocks those is the iframe `sandbox` attribute (see services/adShield.ts).
  useEffect(() => {
    if (!isOpen || !isPlaying) return;
    // Via suppressPopups rather than assigning window.open directly. The Android
    // shell locks that property non-writable, and a direct assignment therefore
    // THREW in strict mode — taking the whole app to the error screen on every
    // Play, in the APK only.
    return suppressPopups((args) => {
      console.warn('[Sahrae] Blocked a popup from the app document:', args);
      setShowAdNotice(true);
      setTimeout(() => setShowAdNotice(false), 6000);
    });
  }, [isOpen, isPlaying]);

  useEffect(() => {
    setCurrentMediaId(mediaId);
    setCurrentMediaType(mediaType);
    setFailedServers([]);
  }, [mediaId, mediaType]);
  
  const { saveProgress } = useWatchProgress();
  const { toggleMyList, isInMyList } = useMyList();
  const wakeLockRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Where the browser will not put the player full screen (an iPhone allows it
  // only for a bare <video>; an embedded preview may forbid it), the button used
  // to do nothing at all. It now falls back to filling the window, and the same
  // button, Esc or Back brings it out again.
  const toggleFullScreen = () => {
    if (nativeShell) { setMaxed((m) => !m); return; }
    const doc = document as any;
    const el = playerContainerRef.current as any;
    const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (fsEl || maxedRef.current) {
      if (fsEl) {
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
        try { exit?.call(document); } catch { /* noop */ }
      }
      setMaxed(false);
      return;
    }
    if (!el) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const fallback = () => setMaxed(true);
    if (!req) { fallback(); return; }
    try {
      const p = req.call(el);
      if (p && p.then) p.then(lockLandscape, fallback);
      else lockLandscape();
    } catch { fallback(); }
  };

  // Tell the Android shell when the movie/series player is up, so it knows a
  // provider's full-screen request is to be taken over (trailers, Live TV and
  // Sports keep the WebView's own full screen).
  const playerUp = isOpen && isPlaying && !playingTrailer;
  useEffect(() => {
    if (!nativeShell) return;
    fetch(`https://localhost/__player?open=${playerUp ? 1 : 0}`, { cache: 'no-store' }).catch(() => {});
    if (!playerUp) setMaxed(false);
  }, [playerUp]);

  // Turning a phone on its side fills the screen with the picture, and turning
  // it back restores the page, as every streaming app does. Only a turn this
  // player caused is undone: full screen chosen with the button stays.
  const rotatedInRef = useRef(false);
  useEffect(() => {
    if (!playerUp || typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(pointer: coarse)').matches || isTelevision()) return;
    const mq = window.matchMedia('(orientation: landscape)');
    const onTurn = () => {
      if (mq.matches && !maxedRef.current && !document.fullscreenElement) {
        rotatedInRef.current = true;
        setMaxed(true);
      } else if (!mq.matches && rotatedInRef.current) {
        rotatedInRef.current = false;
        setMaxed(false);
      }
    };
    mq.addEventListener?.('change', onTurn);
    return () => mq.removeEventListener?.('change', onTurn);
  }, [playerUp]);

  // Esc leaves the full-window fallback in a browser (the real full screen
  // already answers to it).
  useEffect(() => {
    if (nativeShell || !maxed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaxed(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maxed]);

  // System bars hide with the full-screen player and come back with it.
  useEffect(() => {
    if (!nativeShell) return;
    fetch(`https://localhost/__immersive?on=${maxed ? 1 : 0}`, { cache: 'no-store' }).catch(() => {});
  }, [maxed]);

  useEffect(() => {
    const w = window as unknown as {
      __sahraePlayerFullscreen?: (on: boolean) => void;
      __sahraeExitPlayerFs?: () => boolean;
    };
    w.__sahraePlayerFullscreen = (on: boolean) => setMaxed(on);
    // Back leaves full screen before it leaves the player.
    w.__sahraeExitPlayerFs = () => {
      if (barHiddenRef.current) { setBarHidden(false); return true; }
      if (maxedRef.current) { setMaxed(false); return true; }
      return false;
    };
    return () => { delete w.__sahraePlayerFullscreen; delete w.__sahraeExitPlayerFs; };
  }, []);

  // In a browser the provider's iframe can take full screen itself; hand it
  // straight to the whole player so the bar stays with it.
  useEffect(() => {
    if (nativeShell || !playerUp) return;
    const onFs = () => {
      const el = document.fullscreenElement;
      const shell = playerContainerRef.current;
      if (!el || !shell || el === shell || el.tagName !== 'IFRAME' || !shell.contains(el)) return;
      document.exitFullscreen()
        .then(() => shell.requestFullscreen())
        .catch(() => setMaxed(true));
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [playerUp]);

  // ── In full screen the bar gets out of the way ──────────────────────────
  // It covered the bottom of the picture. Now, in full screen, the picture
  // takes the whole screen and the bar is an overlay at the TOP (the provider's
  // own controls live at the bottom): shown for a moment on entering, hidden
  // while the film plays, back whenever it is paused.
  const [docFs, setDocFs] = useState(false);
  useEffect(() => {
    const onFs = () => {
      const on = !!document.fullscreenElement && document.fullscreenElement === playerContainerRef.current;
      setDocFs(on);
      if (!on) { setBarHidden(false); unlockOrientation(); }
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const fsActive = (maxed || docFs) && !playingTrailer;

  /** true = paused, false = playing, null = this server does not say. */
  const [paused, setPaused] = useState<boolean | null>(null);
  useEffect(() => {
    setPaused(null);
    if (!playerUp) return;
    const onMsg = (e: MessageEvent) => {
      let d: unknown = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      const m = d as { type?: string; event?: string; data?: { event?: string } } | null;
      if (!m || m.type !== 'PLAYER_EVENT') return;
      if (!fromFrame(iframeRef.current?.contentWindow, e.source)) return;
      const ev = m.data?.event ?? m.event;
      if (ev === 'pause' || ev === 'ended') setPaused(true);
      else if (ev === 'play' || ev === 'playing' || ev === 'timeupdate') setPaused(false);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [playerUp, selectedServer, refreshKey]);

  // A short look at the bar when full screen starts, or when asked for.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekBar = useCallback((ms = 3000) => {
    setPeek(true);
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), ms);
  }, []);
  useEffect(() => { if (fsActive) peekBar(3000); }, [fsActive, peekBar]);
  useEffect(() => () => { if (peekTimer.current) clearTimeout(peekTimer.current); }, []);
  // The viewer can hide the bar altogether ("Hide"); a pause, Escape, Back,
  // or leaving full screen brings it back.
  const [barHidden, setBarHidden] = useState(false);
  const barHiddenRef = useRef(false);
  barHiddenRef.current = barHidden;
  useEffect(() => { if (paused === true) setBarHidden(false); }, [paused]);
  useEffect(() => { if (!playerUp) setBarHidden(false); }, [playerUp]);
  const barVisible = !barHidden && (!fsActive || peek || paused === true || showAudioMenu);
  const showBar = () => { setBarHidden(false); peekBar(5000); };

  const reportCurrentMovieServerDead = () => {
    haptics.tap();
    const currentServerId = SERVERS[selectedServer]?.id;
    if (!currentServerId) return;
    markDown(currentServerId);
    // A viewer saying so is the surest failure signal there is.
    if (currentMediaType && currentMediaId) reportPlay(titleKey(currentMediaType, currentMediaId, selectedSeason, selectedEpisode), currentServerId, false);

    const failed = new Set([...failedServers, currentServerId]);
    setFailedServers([...failed]);

    // Switch to the server most likely to have this title.
    const ids = SERVERS.map((sv) => sv.id);
    const nextIdx = nextServerRanked(ids, selectedServer, failed, crowdRef.current.choice, crowdRef.current.rows)
      ?? (selectedServer + 1) % SERVERS.length;
    manualPickRef.current = false;
    setSelectedServer(nextIdx);
    setShowServerDeadNotice(true);
    setTimeout(() => setShowServerDeadNotice(false), 4000);
  };

  // When a movie/show starts playing, silence music & radio (claim the speaker).
  useEffect(() => {
    if (isOpen && isPlaying) {
      window.dispatchEvent(new CustomEvent('sahrae:audioclaim', { detail: 'video' }));
    }
  }, [isOpen, isPlaying]);

  // Prevent screen from sleeping while video is active
  useEffect(() => {
    const acquireWakeLock = async () => {
      if ('wakeLock' in navigator && isOpen && isPlaying) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.log('Wake Lock permission denied or not supported');
        }
      }
    };

    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquireWakeLock();
    };

    if (isOpen && isPlaying) {
      acquireWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isOpen, isPlaying]);

  // Streaming servers: the pool in src/data/servers.json, in the owner's order
  // (VidLink Pro first), leaving out any that are down or failing for viewers
  // (services/serverPool.ts). The published copy of that file is updated by a
  // daily check, so the list keeps itself current.
  // VidVault is the download source only, never a stream server.
  //
  // The list is fixed for as long as one title is open: a ranking that changed
  // mid-film would move every index and switch the player under the viewer.
  const brand = 'FBBF24';
  const livePool = useServerPool(currentMediaType === 'tv' ? 'tv' : 'movie');
  const poolKey = `${isOpen}|${currentMediaId}|${currentMediaType}`;
  const poolSnap = useRef<{ key: string; list: PoolServer[] }>({ key: '', list: livePool });
  // In Sahrae's own player every server plays without its adverts, so the
  // clearest picture (highest bitrate, measured) goes first.
  if (poolSnap.current.key !== poolKey) poolSnap.current = { key: poolKey, list: nativeShell && canPlayClean() && isCleanOn() ? cleanFirst(livePool) : livePool };
  // Every server in the pool is offered (the owner's list stays whole). With
  // Ad Shield on (web), the servers that play inside it come first; the ones
  // that refuse it follow and load without it (playerSandbox), with a note
  // saying so under the player.
  const refuses = (p: PoolServer) => shieldAppliesHere() && shieldOn && refusesSandbox(p.movie.replace('{id}', '1'));
  const shielded = poolSnap.current.list
    // Some servers' own pages are not fit to show on the web; the app hides the page.
    .filter((p) => nativeShell || p.web !== false)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(refuses(a.p)) - Number(refuses(b.p)) || a.i - b.i)
    .map((x) => x.p);
  const SERVERS = (shielded.length ? shielded : poolSnap.current.list).map((p) => ({
    id: p.id,
    name: poolLabel(p),
    getUrl: (type: string, id: number, s: number, e: number) => fillTemplate(type === 'movie' ? p.movie : p.tv, id, s, e, brand),
    type: 'iframe',
  }));

  useEffect(() => { failedServersRef.current = failedServers; }, [failedServers]);

  // ── Sahrae's own player (Android app) ────────────────────────────────────
  // The server's page runs out of sight and hands over its stream, which plays
  // here without the page's adverts and on its sharpest rendition. 'resolving'
  // while the page is asked, 'ready' with the stream, 'failed' (or 'off') and
  // the provider's own player shows as before.
  const [cleanOn, setCleanOnState] = useState<boolean>(() => isCleanOn());
  const [clean, setClean] = useState<{ state: 'off' | 'resolving' | 'ready' | 'failed'; url?: string; why?: string }>({ state: 'off' });
  const cleanServer = SERVERS[selectedServer];
  const cleanSrc = cleanServer && currentMediaType && currentMediaId
    ? cleanServer.getUrl(currentMediaType, currentMediaId, selectedSeason, selectedEpisode) : '';
  useEffect(() => {
    if (!nativeShell || !canPlayClean() || !cleanOn || !isOpen || !isPlaying || playingTrailer || !cleanSrc) { setClean({ state: 'off' }); return; }
    let live = true;
    setClean({ state: 'resolving' });
    resolveFilmStream(cleanSrc).then((r) => {
      if (!live) return;
      // Logged so a test run on a device can read why a server fell back.
      console.info('[sahrae-player]', JSON.stringify({ server: cleanServer?.id, ms: r.ms, ok: !!r.m3u8, why: r.why }));
      setClean(r.m3u8 ? { state: 'ready', url: relayUrl(r.m3u8, r.referer) } : { state: 'failed', why: r.why });
    });
    return () => { live = false; };
  }, [cleanSrc, cleanOn, isOpen, isPlaying, playingTrailer, refreshKey]);

  // Move on from a server that never started, so the viewer does not have to
  // diagnose it. The failed one is skipped for this title and remembered, and
  // when every server has been tried the manual Reload / Next buttons appear.
  const autoSwitch = () => {
    const ids = SERVERS.map((sv) => sv.id);
    const current = ids[selectedServer];
    if (!current) return;
    markDown(current);
    // Only the APK sees a silent player's stream, so only it can tell "did not
    // play" from "waiting for a tap". Elsewhere a failure is not reported.
    const canSee = (window as unknown as { __sahraeCaps?: { streams?: boolean } }).__sahraeCaps?.streams === true;
    if (canSee && currentMediaType && currentMediaId) reportPlay(titleKey(currentMediaType, currentMediaId, selectedSeason, selectedEpisode), current, false);
    const failed = new Set([...failedServersRef.current, current]);
    failedServersRef.current = [...failed];
    setFailedServers([...failed]);
    const next = nextServerRanked(ids, selectedServer, failed, crowdRef.current.choice, crowdRef.current.rows);
    if (next === null) { setSlowLoad(true); return; }
    setSwitchNotice({ from: SERVERS[selectedServer].name, to: SERVERS[next].name });
    setSelectedServer(next);
  };

  useEffect(() => {
    if (!switchNotice) return;
    const t = setTimeout(() => setSwitchNotice(null), 6000);
    return () => clearTimeout(t);
  }, [switchNotice]);

  // Move on from a server that never shows it has the film. Proof is a real
  // media event from the player or, in the APK, the player fetching its video
  // stream (seen natively, so it covers players that never post a message, and
  // ready-but-paused ones). Chatter is not proof: a refusing VidFast and Videasy
  // both kept posting MEDIA_DATA. Without proof after NO_START_LIMIT_MS the
  // viewer gets a countdown they can stop, because some players wait for a tap
  // on their own play button and are working fine.
  useEffect(() => {
    if (!isOpen || !isPlaying || playingTrailer) return;
    // The hidden page is still being asked for its stream: nothing to judge yet.
    if (clean.state === 'resolving') return;
    const id = SERVERS[selectedServer]?.id;
    // Only a native shell that reports the player's stream fetches can see a
    // silent player working (it sets window.__sahraeCaps.streams). Without that,
    // as in the PWA and the June 7 shell, a viewer who taps the player is trusted.
    const canSeeStreams = (window as unknown as { __sahraeCaps?: { streams?: boolean } }).__sahraeCaps?.streams === true;
    heardRef.current = false;
    engagedRef.current = false;
    setCountdown(null);
    const stopCountdown = () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setCountdown(null);
    };
    const clearTimers = () => {
      if (noStartTimerRef.current) clearTimeout(noStartTimerRef.current);
      noStartTimerRef.current = null;
      stopCountdown();
    };
    const armedAt = Date.now();
    const proven = () => {
      // Stragglers from the previous server (a last event or stream request in
      // flight as it was torn down) must not count for this one. No real player
      // loads its page and starts playing within this window.
      if (heardRef.current || Date.now() - armedAt < 1500) return;
      heardRef.current = true;
      clearTimers();
      if (id) markWorking(id);
      if (id && currentMediaType && currentMediaId) reportPlay(titleKey(currentMediaType, currentMediaId, selectedSeason, selectedEpisode), id, true);
    };
    const fromPlayer = (src: MessageEventSource | null) => {
      const root = iframeRef.current?.contentWindow;
      if (!root || !src) return false;
      const within = (w: Window, depth: number): boolean => {
        if (w === src) return true;
        if (depth >= 3) return false;
        try {
          for (let k = 0; k < w.frames.length; k++) if (within(w.frames[k] as Window, depth + 1)) return true;
        } catch { /* a frame that is going away */ }
        return false;
      };
      return within(root, 0);
    };
    const onMessage = (e: MessageEvent) => { if (fromPlayer(e.source) && isPlaybackEvidence(e.data)) proven(); };
    const onStream = () => proven();
    const onNoStart = () => {
      if (heardRef.current) return;
      // The web cannot see a silent player's stream, so once the viewer has
      // tapped into the player they are trusted to judge it themselves.
      if (!canSeeStreams && engagedRef.current) return;
      const ids = SERVERS.map((sv) => sv.id);
      const next = nextServerRanked(ids, selectedServer, new Set([...failedServersRef.current, ids[selectedServer]]), crowdRef.current.choice, crowdRef.current.rows);
      if (next === null) return;
      // Take focus back, so a later tap inside the player registers as a tap.
      try { iframeRef.current?.blur(); window.focus(); } catch { /* noop */ }
      let left = COUNTDOWN_S;
      setCountdown({ from: SERVERS[selectedServer].name, to: SERVERS[next].name, left });
      countdownTimerRef.current = setInterval(() => {
        left -= 1;
        if (left <= 0) { clearTimers(); autoSwitch(); }
        else setCountdown((c) => (c ? { ...c, left } : c));
      }, 1000);
    };
    const arm = () => {
      if (noStartTimerRef.current) clearTimeout(noStartTimerRef.current);
      // When others watched this title on another server, there is a known
      // way out, so a silent player gets less time before it is offered.
      const choice = crowdRef.current.choice;
      const provenElsewhere = [...choice.good].some((g) => g !== id);
      const limit = provenElsewhere && !choice.good.has(id || '') ? PROVEN_ALTERNATIVE_LIMIT_MS : NO_START_LIMIT_MS;
      noStartTimerRef.current = setTimeout(onNoStart, limit);
    };
    keepTryingRef.current = () => {
      engagedRef.current = true;
      stopCountdown();
      arm();
    };
    // A tap inside the player moves focus into its iframe, which the page sees
    // as its own window losing focus.
    const onBlur = () => setTimeout(() => {
      if (!heardRef.current && document.activeElement === iframeRef.current) keepTryingRef.current();
    }, 0);
    window.addEventListener('message', onMessage);
    window.addEventListener('sahrae:embed-media', onStream);
    window.addEventListener('blur', onBlur);
    arm();
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('sahrae:embed-media', onStream);
      window.removeEventListener('blur', onBlur);
      clearTimers();
    };
  }, [isOpen, isPlaying, playingTrailer, selectedServer, selectedSeason, selectedEpisode, refreshKey, currentMediaId, clean.state]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (barHiddenRef.current) { setBarHidden(false); return; }
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      setIsPlaying(!startInInfo && !playTrailer); 
      setPlayingTrailer(null);
      setSelectedServer(startServer(SERVERS.map((sv) => sv.id)));
      setSelectedSeason(initialSeason || 1);
      setSelectedEpisode(initialEpisode || 1);
      setRating(null);
      if (currentMediaId && currentMediaType) {
        fetchMediaDetails(currentMediaId, currentMediaType).then(data => {
          setDetails(data);
          
          if (playTrailer && data.videos && data.videos.results) {
            const t = data.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'en') 
                   || data.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
            if (t) setPlayingTrailer(t.key);
          }
          
          if (!startInInfo && !playTrailer) {
            saveProgress(currentMediaId, currentMediaType, data, initialSeason || 1, initialEpisode || 1);
          }
        }).catch(console.error);
        
        fetchSimilar(currentMediaId, currentMediaType).then(data => {
          setSimilar(data);
        }).catch(console.error);
      }
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
      setDetails(null);
      setPlayingTrailer(null);
    };
  }, [isOpen, onClose, currentMediaId, currentMediaType, startInInfo, initialSeason, initialEpisode, playTrailer]);

  // Update progress when season/episode changes or when switching from info to player
  useEffect(() => {
    if (isOpen && isPlaying && details && currentMediaId && currentMediaType) {
      saveProgress(currentMediaId, currentMediaType, details, selectedSeason, selectedEpisode);
    }
  }, [selectedSeason, selectedEpisode, isPlaying, isOpen, details, currentMediaId, currentMediaType]);

  // What other viewers saw play for this title. When it arrives in the first
  // seconds, before this server has proven itself and unless the viewer chose
  // it, open on the server that played it for them instead.
  useEffect(() => {
    if (!isOpen || !currentMediaId || !currentMediaType) return;
    const key = titleKey(currentMediaType, currentMediaId, selectedSeason, selectedEpisode);
    const startedAt = Date.now();
    let live = true;
    manualPickRef.current = false;
    crowdRef.current = { choice: NO_CROWD, rows: [] };
    setCrowd(NO_CROWD);
    fetchProof(key).then((rows) => {
      if (!live) return;
      const ids = SERVERS.map((sv) => sv.id);
      const choice = crowdChoice(ids, rows);
      crowdRef.current = { choice, rows };
      setCrowd(choice);
      if (manualPickRef.current || heardRef.current || Date.now() - startedAt > CROWD_FOLLOW_MS) return;
      setSelectedServer((cur) => {
        if (choice.best !== null && !failedServersRef.current.includes(ids[choice.best])) return choice.best;
        if (choice.bad.has(ids[cur])) return nextServerRanked(ids, cur, new Set(failedServersRef.current), choice, rows) ?? cur;
        return cur;
      });
    });
    return () => { live = false; };
    // SERVERS is rebuilt every render but its ids are fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentMediaId, currentMediaType, selectedSeason, selectedEpisode]);

  // What this viewing has cost so far, from the Android app's own byte count.
  // Starts at zero for each title and episode.
  useEffect(() => {
    setUsedBytes(null);
    if (!isOpen || !playerUp || !canMeasure()) return;
    let base: number | null = null;
    let live = true;
    const tick = async () => {
      const rx = await readReceivedBytes();
      if (!live || rx === null) return;
      if (base === null) base = rx;
      setUsedBytes(Math.max(0, rx - base));
    };
    void tick();
    const t = setInterval(tick, 10000);
    return () => { live = false; clearInterval(t); };
  }, [isOpen, playerUp, currentMediaId, selectedSeason, selectedEpisode]);

  // Tell a paired phone what is on screen, and let it switch the server.
  useEffect(() => {
    if (!isOpen || !details || !currentMediaId || !currentMediaType) { reportScreen({ view: 'browse' }); return; }
    reportScreen({
      title: details.title || details.name, type: currentMediaType, id: currentMediaId,
      ...(currentMediaType === 'tv' ? { s: selectedSeason, e: selectedEpisode } : {}),
      servers: SERVERS.map((sv) => sv.name), server: selectedServer, view: isPlaying ? 'playing' : 'details',
    });
    // SERVERS is fixed while a title is open (poolSnap).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, details, currentMediaId, currentMediaType, selectedSeason, selectedEpisode, selectedServer, isPlaying]);
  useEffect(() => {
    const onServer = (e: Event) => {
      const idx = (e as CustomEvent<number>).detail;
      if (isOpen && typeof idx === 'number' && idx >= 0 && idx < SERVERS.length) { pickServer(idx); setIsPlaying(true); }
    };
    window.addEventListener('sahrae:remote-server', onServer);
    return () => window.removeEventListener('sahrae:remote-server', onServer);
  });

  // Watch together: say what is playing, and take the host's server when a guest.
  useEffect(() => {
    if (!isOpen || !isPlaying || playingTrailer || !details || !currentMediaId || !currentMediaType) { reportRoomNow(null); return; }
    reportRoomNow({
      type: currentMediaType, id: currentMediaId, title: details.title || details.name || '',
      server: SERVERS[selectedServer]?.id || '',
      ...(currentMediaType === 'tv' ? { s: selectedSeason, e: selectedEpisode } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPlaying, playingTrailer, details, currentMediaId, currentMediaType, selectedServer, selectedSeason, selectedEpisode]);
  useEffect(() => {
    const onRoomServer = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const idx = SERVERS.findIndex((sv) => sv.id === id);
      if (isOpen && idx >= 0 && idx !== selectedServer) pickServer(idx);
    };
    window.addEventListener('sahrae:room-server', onRoomServer);
    return () => window.removeEventListener('sahrae:room-server', onRoomServer);
  });

  // A new server or episode has a new menu of qualities: have the Android app
  // apply the picture setting to it.
  useEffect(() => {
    if (isOpen && isPlaying && !playingTrailer) announcePlayerSource();
  }, [isOpen, isPlaying, playingTrailer, selectedServer, selectedSeason, selectedEpisode, refreshKey, currentMediaId]);

  // Which episodes of this season played for someone in the last two days.
  useEffect(() => {
    if (!isOpen || currentMediaType !== 'tv' || !currentMediaId) { setSeasonPlayable(new Set()); return; }
    let live = true;
    fetchSeasonPlayable(currentMediaId, selectedSeason).then((p) => { if (live) setSeasonPlayable(p); });
    return () => { live = false; };
  }, [isOpen, currentMediaType, currentMediaId, selectedSeason]);

  // Open the connection to the likely fallback early, so a switch answers fast.
  useEffect(() => {
    if (!isOpen || !isPlaying || !currentMediaId || !currentMediaType) return;
    const ids = SERVERS.map((sv) => sv.id);
    const next = nextServerRanked(ids, selectedServer, new Set(failedServers), crowd, crowdRef.current.rows);
    if (next !== null) warmUp(SERVERS[next].getUrl(currentMediaType, currentMediaId, selectedSeason, selectedEpisode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPlaying, selectedServer, crowd, currentMediaId, currentMediaType, selectedSeason, selectedEpisode]);

  // Fetch season details when season changes
  useEffect(() => {
    if (isOpen && currentMediaType === 'tv' && currentMediaId) {
      setSeasonDetails(null);
      fetchSeasonDetails(currentMediaId, selectedSeason)
        .then(data => {
          if (data && data.episodes) {
            setSeasonDetails(data);
          } else {
            setSeasonDetails({ episodes: [], ...data });
          }
        })
        .catch(console.error);
    }
  }, [isOpen, currentMediaType, currentMediaId, selectedSeason]);

  const handleSkipEpisode = (direction: 'next' | 'prev') => {
    if (currentMediaType === 'tv' && details?.seasons) {
      const currentSeasonData = details.seasons.find(s => s.season_number === selectedSeason);
      if (direction === 'next') {
        if (currentSeasonData && selectedEpisode < currentSeasonData.episode_count) {
          setSelectedEpisode(prev => prev + 1);
        } else {
          const nextSeasonData = details.seasons.find(s => s.season_number === selectedSeason + 1);
          if (nextSeasonData) {
            setSelectedSeason(selectedSeason + 1);
            setSelectedEpisode(1);
          }
        }
      } else {
        if (selectedEpisode > 1) {
          setSelectedEpisode(prev => prev - 1);
        } else if (selectedSeason > 1) {
          const prevSeasonData = details.seasons.find(s => s.season_number === selectedSeason - 1);
          if (prevSeasonData) {
            setSelectedSeason(selectedSeason - 1);
            setSelectedEpisode(prevSeasonData.episode_count);
          }
        }
      }
      setRefreshKey(prev => prev + 1);
    }
  };

  const hasNextEpisode = () => {
    if (currentMediaType !== 'tv' || !details?.seasons) return false;
    const currentSeasonData = details.seasons.find(s => s.season_number === selectedSeason);
    if (!currentSeasonData) return false;
    
    if (selectedEpisode < currentSeasonData.episode_count) return true;
    return !!details.seasons.find(s => s.season_number === selectedSeason + 1);
  };
  
  const hasPrevEpisode = () => {
    if (currentMediaType !== 'tv' || !details?.seasons) return false;
    if (selectedEpisode > 1) return true;
    return !!details.seasons.find(s => s.season_number === selectedSeason - 1);
  };

  const stopUpNext = () => {
    if (upNextTimerRef.current) clearInterval(upNextTimerRef.current);
    upNextTimerRef.current = null;
    setUpNext(null);
  };
  const playNextNow = () => { stopUpNext(); handleSkipEpisode('next'); };

  // When an episode ends, the next one starts by itself after UP_NEXT_S
  // seconds, unless the viewer cancels. "Ended" is the player saying so, or its
  // clock reaching the last second (some players never say). A press of the
  // player's own Next button skips the wait. Only players that report their
  // clock can be followed: VidLink and VidZee do (measured 2026-10-21); VidRock
  // reports nothing, so there the episode simply stops.
  useEffect(() => {
    endHandledRef.current = false;
    stopUpNext();
    if (!isOpen || !isPlaying || playingTrailer || currentMediaType !== 'tv') return;
    const onMessage = (e: MessageEvent, trusted = false) => {
      if (!trusted && !fromFrame(iframeRef.current?.contentWindow, e.source)) return;
      let d: unknown = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      const m = d as { type?: string; data?: { event?: string; currentTime?: number; duration?: number } } | null;
      if (!m || m.type !== 'PLAYER_EVENT' || !m.data) return;
      const { event, currentTime = 0, duration = 0 } = m.data;
      if (event === 'next_episode') { if (hasNextEpisode()) playNextNow(); return; }
      const atEnd = event === 'ended' || (event === 'timeupdate' && duration > 60 && currentTime >= duration - 1.5);
      if (!atEnd || endHandledRef.current || !hasNextEpisode()) return;
      endHandledRef.current = true;
      let left = UP_NEXT_S;
      setUpNext(left);
      upNextTimerRef.current = setInterval(() => {
        left -= 1;
        if (left <= 0) playNextNow();
        else setUpNext(left);
      }, 1000);
    };
    // Sahrae's own player says "ended" directly.
    const onCleanEnd = () => onMessage({ data: { type: 'PLAYER_EVENT', data: { event: 'ended' } } } as MessageEvent, true);
    const onMsg = (e: MessageEvent) => onMessage(e);
    window.addEventListener('message', onMsg);
    window.addEventListener(CLEAN_ENDED, onCleanEnd);
    return () => { window.removeEventListener('message', onMsg); window.removeEventListener(CLEAN_ENDED, onCleanEnd); stopUpNext(); };
    // hasNextEpisode and handleSkipEpisode read details and the episode, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPlaying, playingTrailer, currentMediaType, details, selectedSeason, selectedEpisode, selectedServer, refreshKey]);

  // Loading indicator + slow-load recovery. We can't read inside the cross-origin
  // embed, so progress is a smooth simulation that completes when the iframe fires
  // `load`; after ~12s with no load we surface Reload / Next-server. That's the
  // in-app fix for the transient "no content available" — a reload usually clears
  // it, so users don't have to close and reopen the whole app.
  useEffect(() => {
    if (!isPlaying) { setVideoLoaded(false); setLoadPct(0); setSlowLoad(false); return; }
    if (clean.state === 'ready') { setVideoLoaded(true); setLoadPct(100); setSlowLoad(false); return; }
    setVideoLoaded(false); setLoadPct(8); setSlowLoad(false);
    if (clean.state === 'resolving') {
      // The ring fills while the stream is fetched; the resolver's own limit stops it.
      if (loadTimerRef.current) clearInterval(loadTimerRef.current);
      loadTimerRef.current = setInterval(() => { setLoadPct(p => (p >= 92 ? p : p + Math.max(0.4, (92 - p) * 0.03))); }, 250);
      return () => { if (loadTimerRef.current) clearInterval(loadTimerRef.current); };
    }
    if (loadTimerRef.current) clearInterval(loadTimerRef.current);
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    loadTimerRef.current = setInterval(() => { setLoadPct(p => (p >= 92 ? p : p + Math.max(0.7, (92 - p) * 0.05))); }, 250);
    // First: silently remount once (the embed 'load' fires fast on any reachable
    // provider, so no load in 20 s = a real failure — a remount usually fixes it,
    // like closing/reopening the app). If it STILL fails, show manual recovery.
    slowTimerRef.current = setTimeout(() => {
      if (!autoRetriedRef.current) { autoRetriedRef.current = true; setRefreshKey(k => k + 1); }
      else { autoSwitch(); }
    }, SERVER_LOAD_MS);
    return () => { if (loadTimerRef.current) clearInterval(loadTimerRef.current); if (slowTimerRef.current) clearTimeout(slowTimerRef.current); };
  }, [isPlaying, selectedServer, selectedSeason, selectedEpisode, refreshKey, clean.state]);

  // Reset the one-shot auto-retry when the content or server actually changes.
  useEffect(() => { autoRetriedRef.current = false; }, [isPlaying, selectedServer, selectedSeason, selectedEpisode]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  // Curated audio-enhancement presets for the player (map to the global native EQ).
  const AUDIO_PRESETS: { key: string; label: string }[] = [
    { key: 'Off', label: 'Off' },
    { key: 'Cinema', label: 'Cinema · Spatial' },
    { key: 'Premium', label: 'Premium' },
    { key: 'Bass Boost', label: 'Bass Boost' },
    { key: 'Vocal', label: 'Dialogue Clarity' },
  ];
  const applyAudioPreset = (name: string) => {
    if (name === 'Off') saveEq({ on: false, bands: [0, 0, 0, 0, 0], bass: 0, spatial: 0, loud: 0, preset: 'Off' });
    else {
      const extra = PRESET_EXTRAS[name] || { bass: 0, spatial: 0, loud: 0 };
      saveEq({ on: true, bands: EQ_PRESETS[name] || [0, 0, 0, 0, 0], ...extra, preset: name });
    }
    setEqPreset(name);
    setShowAudioMenu(false);
  };
  const audioOn = eqPreset !== 'Off' && eqPreset !== 'Flat';

  if (!isOpen || !currentMediaId || !currentMediaType || !details) return null;

  const dynamicServers = [...SERVERS];

  const currentServerObj = dynamicServers[selectedServer] || dynamicServers[0];
  const src = currentServerObj.getUrl(currentMediaType, currentMediaId || 0, selectedSeason, selectedEpisode);

  
  const videos = details?.videos?.results || [];
  const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'en')
    || videos.find(v => v.site === 'YouTube' && v.type === 'Trailer')
    || videos.find(v => v.site === 'YouTube' && v.iso_639_1 === 'en')
    || videos.find(v => v.site === 'YouTube');

  return (
    <>
      <div id="player-modal-container" role="dialog" data-tv-layer className="fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm overflow-y-auto scroll-smooth py-[5vh] px-4 custom-scrollbar" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="relative w-full max-w-[900px] bg-zinc-950 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 ring-1 ring-zinc-800 h-fit">
          {!(isPlaying || playingTrailer) && <button onClick={onClose} data-tv-close className="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center bg-zinc-950/60 hover:bg-zinc-800 backdrop-blur rounded-full text-white ring-1 ring-white/20 transition-all">
            <X className="w-5 h-5"/>
          </button>}

          {(isPlaying || playingTrailer) ? (
            // Two zones that never overlap. The server's player owns the whole
            // video frame, its own controls included; Sahrae's controls live in
            // the bar beneath it. They used to float over the frame, on top of
            // the provider's buttons, and on a phone (no hover) they stayed
            // invisible yet still took the taps meant for the player.
            <div ref={playingTrailer ? undefined : playerContainerRef} className={`player-shell relative flex flex-col bg-black${maxed && !playingTrailer ? ' is-max' : ''}`}>
              <div className="player-frame relative w-full aspect-video bg-black">
                {playingTrailer ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${playingTrailer}?autoplay=1&rel=0&showinfo=0&modestbranding=1&iv_load_policy=3`}
                    className="w-full h-full border-none bg-black"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <>
                    {clean.state === 'ready' && clean.url ? (
                      <CleanPlayer
                        key={clean.url}
                        src={clean.url}
                        picture={dataSaver ? 'saver' : picture}
                        onPlaying={() => { window.dispatchEvent(new Event('sahrae:embed-media')); setTimeout(enterFullscreen, 300); }}
                        onProgress={() => { /* progress is saved per episode, as for every server */ }}
                        onEnded={() => window.dispatchEvent(new Event(CLEAN_ENDED))}
                        onFail={(why) => { console.info('[sahrae-player]', JSON.stringify({ server: cleanServer?.id, playFailed: why })); setClean({ state: 'failed', why }); }}
                      />
                    ) : clean.state === 'resolving' ? null : (
                    <iframe
                      key={`player-${refreshKey}-${shieldOn ? 'shield' : 'open'}-${currentServerObj.id}`}
                      ref={iframeRef}
                      src={src}
                      frameBorder="0"
                      // `clipboard-write` was granted to the embeds and is now gone:
                      // it let a hostile ad script silently replace the contents of
                      // the user's clipboard, and no player needs it.
                      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                      referrerPolicy={playerReferrer(src)}
                      // Ad Shield. On the WEB this sandbox is the only thing that
                      // can actually stop a cross-origin embed popping windows or
                      // hijacking the tab — no parent-page JS can reach inside it.
                      // On ANDROID it is left off: the native shell already blocks
                      // popups properly, and sandboxing there only trips the
                      // providers' anti-tamper check for no gain. Some providers
                      // refuse to play when sandboxed, which is why this is a
                      // toggle and why the server picker sits right below.
                      sandbox={playerSandbox(shieldOn, src)}
                      // Auto-fullscreen once the embed has loaded + autostarted
                      // (media playback no longer needs a separate gesture), so a
                      // single Play tap ends up fullscreen and playing.
                      onLoad={() => { setVideoLoaded(true); setLoadPct(100); if (loadTimerRef.current) clearInterval(loadTimerRef.current); if (slowTimerRef.current) clearTimeout(slowTimerRef.current); setTimeout(enterFullscreen, 600); }}
                      className="w-full h-full absolute inset-0 bg-black"
                      title="Video Player"
                    />
                    )}
                    {/* Netflix-style loading ring + slow-load recovery (Reload / Next server) */}
                    {!videoLoaded && (
                      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 pointer-events-none">
                        <div className="relative w-20 h-20">
                          <svg viewBox="0 0 48 48" className="w-20 h-20 -rotate-90">
                            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="4" />
                            <circle cx="24" cy="24" r="20" fill="none" style={{ stroke: 'var(--acc-400)', transition: 'stroke-dashoffset 0.3s ease' }} strokeWidth="4" strokeLinecap="round" strokeDasharray={125.66} strokeDashoffset={125.66 * (1 - loadPct / 100)} />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">{Math.round(loadPct)}%</span>
                        </div>
                        <p className="text-zinc-300 text-sm mt-4 font-medium px-6 text-center max-w-full truncate">Loading {details.title || details.name}…</p>
                        {slowLoad && (
                          <div className="pointer-events-auto mt-5 flex flex-col items-center gap-3 px-6">
                            <p className="text-zinc-400 text-xs text-center max-w-xs">Still loading? Reload, or switch to another server.</p>
                            <div className="flex gap-2">
                              <button onClick={() => setRefreshKey(k => k + 1)} data-tv-focusable className="px-4 py-2 bg-white text-black text-sm font-bold rounded-full flex items-center gap-2 active:scale-95"><RefreshCw className="w-4 h-4" /> Reload</button>
                              <button onClick={() => setSelectedServer(s => (s + 1) % dynamicServers.length)} data-tv-focusable className="px-4 py-2 bg-zinc-800 text-white text-sm font-bold rounded-full flex items-center gap-2 border border-white/15 active:scale-95"><Server className="w-4 h-4" /> Next server</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {upNext !== null && (() => {
                      const sameSeason = details.seasons?.find((x) => x.season_number === selectedSeason);
                      const nextInSeason = !!sameSeason && selectedEpisode < sameSeason.episode_count;
                      const nS = nextInSeason ? selectedSeason : selectedSeason + 1;
                      const nE = nextInSeason ? selectedEpisode + 1 : 1;
                      const nextName = nextInSeason ? seasonDetails?.episodes?.find((x) => x.episode_number === nE)?.name : undefined;
                      return (
                        <div role="alert" className="absolute bottom-6 right-6 z-40 w-[min(20rem,calc(100%-3rem))] bg-zinc-950/95 border border-white/15 text-white rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Next episode in {upNext}</p>
                          <p className="text-sm font-bold mt-1 truncate">S{nS} E{nE}{nextName ? ` · ${nextName}` : ''}</p>
                          <div className="h-1 mt-3 rounded-full bg-white/15 overflow-hidden">
                            <div className="h-full bg-amber-400 transition-[width] duration-1000 ease-linear" style={{ width: `${((UP_NEXT_S - upNext + 1) / UP_NEXT_S) * 100}%` }} />
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button onClick={playNextNow} data-tv-focusable data-tv-autofocus
                              className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-bold flex items-center gap-1.5 active:scale-95"><Play className="w-3.5 h-3.5 fill-current" /> {t('Play now')}</button>
                            <button onClick={stopUpNext} data-tv-focusable
                              className="px-3.5 py-1.5 rounded-full bg-zinc-800 text-white text-xs font-bold border border-white/15 active:scale-95">Cancel</button>
                          </div>
                        </div>
                      );
                    })()}
                    {isSandboxed && (['superembed', 'vidsrcpro', '2embed', 'vidbinge', 'multiembed', 'vidsrcnet', 'vidsrcme', 'embedsu'].includes(currentServerObj.id)) && (
                      <div className="absolute top-0 left-0 w-full z-40 bg-[#e50914]/95 text-white text-xs md:text-sm font-bold px-4 py-3 flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4 text-center backdrop-blur shadow-2xl border-b border-white/20 animate-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <span>This page is shown inside another site, which blocks the player. <b>Open Sahrae in its own tab to watch.</b></span>
                        <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="bg-white text-[#e50914] px-4 py-1.5 rounded-full whitespace-nowrap hover:bg-zinc-200 transition-colors shadow-lg active:scale-95 flex items-center gap-1">
                          Open Sahrae App Natively <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </>
                )}
              </div>

              {!playingTrailer && (
                <div className="flex flex-col gap-2 px-2 pt-2 empty:hidden">
                  {showAdNotice && (
                    <div className="bg-zinc-950/95 border border-amber-500/30 text-white rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
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

                  {countdown && (
                    <div role="alert" className="bg-zinc-950/95 border border-amber-400/40 text-white rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-amber-400/15 text-amber-300">
                          <Server className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-amber-300">{countdown.from} isn't starting</h4>
                          <p className="text-xs text-zinc-300 mt-1 leading-relaxed">Switching to {countdown.to} in {countdown.left}…</p>
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => { if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; setCountdown(null); autoSwitch(); }} data-tv-focusable data-tv-autofocus
                              className="px-3.5 py-1.5 rounded-full bg-amber-400 text-amber-950 text-xs font-bold active:scale-95">Switch now</button>
                            <button onClick={() => keepTryingRef.current()} data-tv-focusable
                              className="px-3.5 py-1.5 rounded-full bg-zinc-800 text-white text-xs font-bold border border-white/15 active:scale-95">Keep trying</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {switchNotice && (
                    <div role="status" aria-live="polite" className="bg-zinc-950/95 border border-amber-400/30 text-white rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-amber-400/15 text-amber-300">
                          <Server className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-amber-300">Switched server</h4>
                          <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                            {switchNotice.from} didn't start, so you're now on {switchNotice.to}.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {showServerDeadNotice && (
                    <div className="bg-zinc-950/95 border border-red-500/30 text-white rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-red-500/15 text-red-400">
                          <AlertTriangle className="w-5 h-5 animate-pulse" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-red-400">Server marked offline</h4>
                            <button onClick={() => setShowServerDeadNotice(false)} className="text-zinc-400 hover:text-white transition-colors ml-2">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                            We've flagged that server down in your session and successfully switched you to the next server.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!barVisible && paused === null && (barHidden || fsActive) && (
                // This server does not report pause, so offer a quiet way back to the bar.
                <button onClick={showBar} data-tv-focusable title="Show controls" aria-label="Show controls"
                  className="dark absolute top-2 left-2 z-30 w-8 h-8 grid place-items-center rounded-full bg-black/40 text-white/70 hover:text-white">
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}
              <div className={`flex flex-wrap items-center gap-1.5 px-2 py-2 ${fsActive
                ? `dark absolute inset-x-0 top-0 z-30 pb-8 bg-gradient-to-b from-black/90 via-black/60 to-transparent transition-opacity duration-300 ${barVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
                : barHidden ? 'hidden' : 'relative bg-zinc-950 border-t border-white/10'}`}>
                <button onClick={() => { if (playingTrailer) { setPlayingTrailer(null); return; } setIsPlaying(false); const d = document as any; if (d.fullscreenElement || d.webkitFullscreenElement) { try { (d.exitFullscreen || d.webkitExitFullscreen)?.call(document); } catch { /* noop */ } } }}
                  data-tv-focusable tabIndex={0} title="Back to details" className="h-9 px-3 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">{t('Back')}</span>
                </button>
                {playingTrailer ? <div className="flex-1" /> : (
                  <>
                    <div className="contents">
                      {/* Switch server while watching: the fix for "content isn't available". */}
                      <select value={selectedServer} onChange={e => pickServer(Number(e.target.value))} data-tv-focusable aria-label="Switch server" title="Switch server if it won't play"
                        className="h-9 shrink-0 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-full px-3 border-none outline-none cursor-pointer appearance-none">
                        {dynamicServers.map((server, idx) => {
                          const isDown = failedServers.includes(server.id);
                          return (
                            <option key={server.id} value={idx} className="bg-zinc-900 text-white">
                              {`${(server.name || `Server ${idx + 1}`).split(' · ')[0]}${isDown ? ' (down)' : crowd.good.has(server.id) ? ' · works for others' : ''}`}
                            </option>
                          );
                        })}
                      </select>
                      {currentServerObj.type !== 'youtube' && (
                        <button onClick={reportCurrentMovieServerDead} data-tv-focusable title="Report this server broken and switch to the next one" aria-label="Report this server broken and switch to the next one" className="h-9 px-3 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                          <AlertTriangle className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t('Not working?')}</span>
                        </button>
                      )}
                      <button onClick={() => { setShowAudioMenu(false); setPeek(false); setBarHidden(true); }} data-tv-focusable
                        title="Hide these controls. Pause, Escape or Back brings them back."
                        className="h-9 px-3 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors active:scale-95">
                        <EyeOff className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t('Hide')}</span>
                      </button>
                      <button onClick={() => window.dispatchEvent(new Event(OPEN_PARTY))} data-tv-focusable
                        title="Watch together with friends"
                        className="h-9 px-3 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors active:scale-95">
                        <Users className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t('Together')}</span>
                      </button>
                    </div>
                    {usedBytes !== null && (
                      <span className="ml-auto h-9 px-3 shrink-0 rounded-full bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5 tabular-nums" title="Data this viewing has used so far">
                        <Gauge className="w-3.5 h-3.5" />{formatBytes(usedBytes)}
                      </span>
                    )}
                    <button onClick={() => setShowAudioMenu(v => !v)} data-tv-focusable title="Audio enhancement" aria-label="Audio enhancement"
                      className={`ml-auto w-9 h-9 shrink-0 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${audioOn ? '!bg-amber-500 !text-amber-950' : ''}`}><Waves className="w-4 h-4" /></button>
                    <button onClick={() => setRefreshKey(prev => prev + 1)} data-tv-focusable title="Reload video" aria-label="Reload video" className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"><RefreshCw className="w-4 h-4" /></button>
                    <button onClick={toggleFullScreen} data-tv-focusable title="Full screen" aria-label="Full screen" className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"><Maximize className="w-4 h-4" /></button>
                  </>
                )}
                <button onClick={onClose} data-tv-focusable data-tv-close title="Close" aria-label="Close" className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"><X className="w-4 h-4" /></button>
                {!playingTrailer && showAudioMenu && (
                    <div className={`absolute ${fsActive ? 'top-full mt-1' : 'bottom-full mb-2'} right-2 z-50 w-56 bg-zinc-950/95 backdrop-blur rounded-xl border border-white/15 shadow-2xl p-2 animate-in fade-in slide-in-from-top-2 duration-200`}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 px-2 pt-1 pb-2 flex items-center gap-1.5"><Waves className="w-3.5 h-3.5" /> Audio Enhancement</p>
                      {AUDIO_PRESETS.map(p => (
                        <button key={p.key} onClick={() => applyAudioPreset(p.key)} data-tv-focusable className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-between transition-colors ${eqPreset === p.key ? 'bg-amber-500 text-amber-950' : 'text-white hover:bg-white/10'}`}>
                          {p.label} {eqPreset === p.key && <Check className="w-4 h-4"/>}
                        </button>
                      ))}
                      <p className="text-[10px] text-zinc-500 px-2 pt-2 leading-snug">Enhances all app audio: movies, music &amp; podcasts.</p>
                    </div>
                )}
              </div>
            </div>
          ) : (
            <div className="relative w-full aspect-video md:aspect-[2.2/1] bg-black">
              <>
                <img loading="lazy" decoding="async" src={getImageUrl(details.backdrop_path, 'original')} className="w-full h-full object-cover opacity-80" />
                {/* Tint drawn from the artwork itself, so every title feels
                    like its own page instead of the same grey chrome. Fades in
                    only once the colour resolves, and stays absent entirely if
                    the image can't be read — no flash of arbitrary colour. */}
                {headerTint && (
                  <div
                    className="absolute inset-0 pointer-events-none transition-opacity duration-700"
                    style={{
                      // Single hue fading upward. (An alpha suffix cannot be
                      // appended to an hsl() string — the gradient's own
                      // transparent stop does the fade.)
                      background: `linear-gradient(to top, ${headerTint} 0%, transparent 70%)`,
                      opacity: 0.85,
                    }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 md:via-zinc-950/20 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/80 via-zinc-950/40 md:via-transparent to-transparent" />
  
                <div className="absolute bottom-8 left-8 md:bottom-10 md:left-10 pr-12 flex flex-col gap-4 z-10 w-full max-w-2xl">
                  <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-extrabold text-white tracking-tight leading-none drop-shadow-2xl">
                    {details.title || details.name}
                  </h1>
                  <div className="flex gap-3 items-center flex-wrap mt-2">
                    <button data-tv-autofocus onClick={() => { setIsPlaying(true); }} className="px-6 md:px-8 py-2 md:py-3 bg-white text-black font-bold rounded flex items-center gap-2 hover:bg-white/80 transition-colors shadow-lg text-sm md:text-base whitespace-nowrap">
                      <Play className="w-5 h-5 md:w-6 md:h-6 fill-current"/>
                      {currentMediaType === 'tv' ? `Play S${selectedSeason} E${selectedEpisode}` : 'Play'}
                    </button>
                    {trailer && (
                      <button onClick={() => setPlayingTrailer(trailer.key)} className="px-6 md:px-8 py-2 md:py-3 bg-zinc-900/90 text-white font-semibold rounded flex items-center gap-2 hover:bg-zinc-800 transition-colors border border-zinc-600/60 shadow-lg text-sm md:text-base whitespace-nowrap">
                        <Play className="w-5 h-5 md:w-6 md:h-6 fill-current text-white"/> Trailer
                      </button>
                    )}
                    <button onClick={() => toggleMyList(details)} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center border border-zinc-600/60 bg-zinc-900/90 text-white rounded-full hover:bg-white/10 hover:border-white transition-colors shadow-lg shrink-0" title="My List" aria-label="My List">
                      {isInMyList(details.id) ? <Check className="w-5 h-5 md:w-6 md:h-6"/> : <Plus className="w-5 h-5 md:w-6 md:h-6"/>}
                    </button>
                    <button onClick={() => setRating(rating === 'up' ? null : 'up')} className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center border border-zinc-600/60 bg-zinc-900/90 rounded-full transition-colors shadow-lg shrink-0 ${rating === 'up' ? 'text-green-400 bg-zinc-800 border-green-500/50' : 'text-white hover:bg-white/10 hover:border-white'}`} title="Like" aria-label="Like">
                      <ThumbsUp className="w-4 h-4 md:w-5 md:h-5"/>
                    </button>
                    <button onClick={() => setRating(rating === 'down' ? null : 'down')} className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center border border-zinc-600/60 bg-zinc-900/90 rounded-full transition-colors shadow-lg shrink-0 ${rating === 'down' ? 'text-red-400 bg-zinc-800 border-red-500/50' : 'text-white hover:bg-white/10 hover:border-white'}`} title="Not for me" aria-label="Not for me">
                      <ThumbsDown className="w-4 h-4 md:w-5 md:h-5"/>
                    </button>
                    <button
                      onClick={handleOpenDownload}
                      className="group px-6 md:px-8 py-2 md:py-3 font-bold flex items-center justify-center gap-2 border rounded transition-colors shadow-lg ml-2 border-zinc-600/60 bg-zinc-900/90 text-white hover:bg-zinc-800"
                      title="Download this title from VidVault"
                    >
                      <Download className="w-5 h-5 group-hover:animate-bounce"/>
                      <span className="text-sm">Download</span>
                    </button>
                  </div>
                  {(() => {
                    const ep = currentMediaType === 'tv' ? seasonDetails?.episodes?.find((x) => x.episode_number === selectedEpisode) : null;
                    const minutes = (currentMediaType === 'tv' ? (ep?.runtime || details.episode_run_time?.[0]) : details.runtime) || 0;
                    const est = estimateText(minutes, dataSaver, canCapVideo(), picture);
                    if (!est) return null;
                    return (
                      <p className="text-xs text-zinc-300 flex items-center gap-2 flex-wrap" title="An estimate: the player picks the quality to suit your connection">
                        <Gauge className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{est} for {minutes} min</span>
                        <button onClick={() => { setDataSaverOn(!dataSaver); haptics.tap(); }} data-tv-focusable
                          className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold transition-colors ${dataSaver ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10' : 'border-zinc-600 text-zinc-300 hover:text-white'}`}>
                          Data Saver {dataSaver ? 'on' : 'off'}
                        </button>
                      </p>
                    );
                  })()}
                </div>
              </>
            </div>
          )}

            <div className="p-8 md:p-10 pb-16">
              {/* Pick-a-server-before-you-play. Shown for BOTH movies and series
                  (the old prominent picker was movies-only, and the series one
                  was a small dropdown that appeared only after playback began).
                  Chips are far more discoverable than a <select> on TV + touch,
                  and the choice is made here, before Play is ever pressed. */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Server className="w-4 h-4 text-amber-400 shrink-0" />
                  <h4 className="text-white font-bold text-sm">{t('Choose your server')}</h4>
                  <span className="text-xs text-zinc-500">Pick one before you play, and switch anytime if a title won't load</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x">
                  {dynamicServers.map((server, idx) => (
                    <button key={server.id} onClick={() => pickServer(idx)} data-tv-focusable
                      aria-pressed={selectedServer === idx}
                      className={`shrink-0 snap-start px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                        selectedServer === idx
                          ? 'bg-amber-500 text-amber-950 border-amber-400'
                          : 'bg-zinc-900/80 text-zinc-300 border-zinc-700 hover:bg-zinc-800 hover:text-white'
                      }`}>
                      {server.name}
                      {crowd.good.has(server.id) && (
                        <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 align-middle" title="Played this for other viewers recently" aria-label="works for others" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Ad Shield toggle — web only. On Android the native shell
                    already blocks ads, so there is no trade to offer. */}
                {nativeShell && canPlayClean() && (
                  <div className="mt-4 flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-zinc-900/50">
                    <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${cleanOn ? 'text-emerald-400' : 'text-zinc-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">Sahrae player {cleanOn ? 'on' : 'off'}</p>
                      <p className="text-xs text-zinc-400 leading-snug mt-0.5">
                        {cleanOn
                          ? (clean.state === 'failed'
                            ? `This server would not hand over its stream (${clean.why || 'no reason given'}), so its own player is showing, adverts and all. Another server usually works in Sahrae's player.`
                            : "No adverts, and the sharpest picture the server has. The badge on the picture shows the real quality. Turn it off to use the server's own player, for its subtitles.")
                          : "The server's own player, with its adverts and its own quality choice."}
                      </p>
                    </div>
                    <button
                      onClick={() => { const n = !cleanOn; setCleanOnState(n); setCleanOn(n); haptics.tap(); }}
                      role="switch"
                      aria-checked={cleanOn}
                      aria-label="Sahrae player"
                      data-tv-focusable
                      className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors ${cleanOn ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                    >
                      <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${cleanOn ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                )}
                {shieldAppliesHere() && (
                  // A browser cannot reach inside a server's page, so its adverts
                  // and its quality choice stay. The Android app plays the stream
                  // itself, with neither.
                  <a href="https://github.com/adr1an-ma1na/sahrae-entertainment/releases/download/preview/Sahrae-release.apk" target="_blank" rel="noopener noreferrer" data-tv-focusable
                    className="mt-4 flex items-center gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 transition-colors">
                    <Download className="w-5 h-5 shrink-0 text-amber-400" />
                    <span className="text-xs text-zinc-300 leading-snug"><b className="block text-sm text-white">No adverts, sharpest picture: the Sahrae app</b>On Android phones and TVs Sahrae plays the film in its own player, without the server's adverts, at its best quality. Tap to download.</span>
                  </a>
                )}
                {shieldAppliesHere() && refusesSandbox(src) && (
                  // Saying "on" here was untrue: this server will not play
                  // with the shield, so it plays without it.
                  <div className="mt-4 flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-zinc-900/50">
                    <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-zinc-500" />
                    <p className="text-xs text-zinc-400 leading-snug">
                      <span className="block text-sm font-bold text-white">Ad Shield does not work on this server</span>
                      It will not play with the shield on, so it plays without it. If an advert opens, close it and you are back here. VidZee plays with the shield.
                    </p>
                  </div>
                )}
                {shieldAppliesHere() && !refusesSandbox(src) && (
                  <div className="mt-4 flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-zinc-900/50">
                    <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${shieldOn ? 'text-emerald-400' : 'text-zinc-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">
                        Ad Shield {shieldOn ? 'on' : 'off'}
                      </p>
                      <p className="text-xs text-zinc-400 leading-snug mt-0.5">
                        {shieldOn
                          ? "Blocks this player's pop-ups and tab hijacks. A few servers refuse to run with it on. If a title won't start, pick another server above, or switch the shield off for it."
                          : 'Pop-ups from the streaming provider are NOT blocked. Turn this back on unless a server needs it off.'}
                      </p>
                    </div>
                    <button
                      onClick={() => { const n = !shieldOn; setShieldOn(n); persistShield(n); haptics.tap(); }}
                      role="switch"
                      aria-checked={shieldOn}
                      aria-label="Toggle Ad Shield"
                      data-tv-focusable
                      className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors ${shieldOn ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                    >
                      <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${shieldOn ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-col lg:flex-row gap-10">
                <div className="lg:w-2/3 space-y-5">
                  <div className="flex items-center gap-3 text-sm font-semibold text-zinc-400">
                    {details.vote_average ? <span className="text-green-500 font-bold">{Math.round(details.vote_average * 10)}% Match</span> : null}
                    <span className="text-white">{(details.release_date || details.first_air_date)?.slice(0, 4)}</span>
                    {details.seasons ? <span>{details.seasons.filter(s => s.season_number > 0).length} Seasons</span> : details.runtime ? <span>{details.runtime} min</span> : null}
                    <span className="px-1 border border-zinc-600 rounded text-xs leading-5 uppercase">HD</span>
                  </div>
                  <p className="text-white text-base leading-relaxed font-medium">{details.overview}</p>
                </div>
                <div className="lg:w-1/3 text-sm space-y-4">
                  <p className="text-white"><span className="text-zinc-500">Genres: </span>{details.genres?.slice(0, 3).map(g => g.name).join(', ')}</p>
                  <p className="text-white"><span className="text-zinc-500">Director: </span>{details.credits?.crew?.find(c => c.job === 'Director')?.name || 'N/A'}</p>
                </div>
              </div>

              {details.credits?.cast && details.credits.cast.length > 0 && (
                <div className="mt-12">
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight mb-6">Cast</h3>
                  <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar snap-x">
                    {details.credits.cast.slice(0, 15).map(actor => (
                      <div key={actor.id} className="flex-shrink-0 w-28 md:w-32 snap-start group cursor-pointer">
                        <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-zinc-800 mb-2 relative">
                          {actor.profile_path ? (
                            <img src={getImageUrl(actor.profile_path, 'w185')} alt={actor.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-900 border border-zinc-700/50">
                              <span className="text-zinc-500 text-xs">No Image</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                        </div>
                        <p className="text-white text-sm font-bold truncate">{actor.name}</p>
                        <p className="text-zinc-500 text-xs truncate">{actor.character}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentMediaType === 'tv' && (
                <div className="mt-12">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight">Episodes</h3>
                    <div className="flex items-center gap-4">
                      {isPlaying && (
                        <select value={selectedServer} onChange={e => pickServer(Number(e.target.value))} className="bg-zinc-900 text-white font-bold outline-none cursor-pointer rounded px-3 py-2 border border-zinc-800 text-sm md:max-w-[200px]">
                          {dynamicServers.map((server, idx) => <option key={server.id} value={idx}>{server.name}</option>)}
                        </select>
                      )}
                      <div className="bg-zinc-900 rounded px-4 py-2 border border-zinc-800 hover:bg-zinc-800 transition-colors">
                        <select value={selectedSeason} onChange={e => setSelectedSeason(Number(e.target.value))} className="bg-transparent text-white font-bold outline-none w-full cursor-pointer">
                          {details.seasons?.filter(s => s.season_number > 0).map( season => (
                            <option key={season.id} value={season.season_number}>Season {season.season_number}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  {!seasonDetails ? (
                    <div className="flex flex-col gap-0 border-t border-zinc-800">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex flex-col md:flex-row items-center gap-4 py-4 md:py-6 border-b border-zinc-800 animate-pulse">
                          <div className="w-12 hidden md:block"></div>
                          <div className="w-full md:w-48 aspect-video shrink-0 bg-zinc-800 rounded"></div>
                          <div className="flex-1 w-full space-y-3">
                            <div className="h-5 bg-zinc-800 rounded w-1/3"></div>
                            <div className="h-4 bg-zinc-800 rounded w-full"></div>
                            <div className="h-4 bg-zinc-800 rounded w-5/6"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : seasonDetails?.episodes && seasonDetails.episodes.length > 0 ? (
                    <div className="flex flex-col gap-0 border-t border-zinc-800">
                      {seasonDetails.episodes.map(episode => (
                        <div key={episode.id} onClick={() => { setSelectedEpisode(episode.episode_number); setIsPlaying(true); document.getElementById('player-modal-container')?.scrollTo({top: 0, behavior: 'smooth'}); }} className={`flex flex-col md:flex-row items-center gap-4 py-4 md:py-6 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/50 transition-colors group ${selectedEpisode === episode.episode_number && isPlaying ? 'bg-zinc-800/30' : ''}`}>
                          <div className="text-4xl font-light text-zinc-500 w-12 text-center shrink-0 hidden md:block opacity-60">
                            {episode.episode_number}
                          </div>
                          <div className="w-full md:w-48 aspect-video shrink-0 relative rounded overflow-hidden bg-zinc-800">
                            {episode.still_path ? <img loading="lazy" decoding="async" src={getImageUrl(episode.still_path)} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center opacity-50"><Play className="w-8 h-8 text-white"/></div>}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity"><Play className="w-8 h-8 text-white fill-current shadow-lg drop-shadow"/></div>
                          </div>
                          <div className="flex-1 min-w-0 md:pr-4">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-base font-bold text-white line-clamp-1">{episode.name}</h4>
                              <span className="text-sm font-bold text-white shrink-0 ml-4 flex items-center gap-2">
                                {seasonPlayable.has(episode.episode_number) && (
                                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400" title="Someone watched this episode here in the last 48 hours">Plays</span>
                                )}
                                {episode.runtime ? `${episode.runtime}m` : ''}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-400 line-clamp-3 md:line-clamp-2 leading-snug w-11/12">{episode.overview || 'No description available for this episode.'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-zinc-500 py-10 text-center font-semibold">Episodes currently unavailable for this season.</div>
                  )}
                </div>
              )}

              {videos.filter(v => v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip').length > 0 && (
                <div className="mt-12">
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight mb-6">Trailers & Extras</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {videos.filter(v => v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip').slice(0, 6).map(v => (
                      <div key={v.id} onClick={() => { setPlayingTrailer(v.key); document.getElementById('player-modal-container')?.scrollTo({top: 0, behavior: 'smooth'}); }} className="cursor-pointer group relative rounded overflow-hidden aspect-video bg-zinc-800">
                         <img loading="lazy" decoding="async" src={`https://img.youtube.com/vi/${v.key}/maxresdefault.jpg`} onError={(e) => { e.currentTarget.src = `https://img.youtube.com/vi/${v.key}/hqdefault.jpg`; e.currentTarget.onerror = null; }} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 opacity-80 group-hover:opacity-100" />
                         <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-all"><Play className="w-12 h-12 text-white fill-current shadow-lg drop-shadow"/></div>
                         <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                           <p className="text-white text-sm font-bold line-clamp-1">{v.name}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {similar.length > 0 && (
                <div className="mt-12">
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight mb-6">More Like This</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {similar.slice(0, 9).map(item => (
                      <div key={item.id} onClick={() => { setDetails(null); setSimilar([]); setCurrentMediaId(item.id); setCurrentMediaType(item.media_type || currentMediaType); setSelectedSeason(1); setSelectedEpisode(1); document.getElementById('player-modal-container')?.scrollTo({top: 0}); }}
                        className="cursor-pointer group relative rounded overflow-hidden bg-zinc-800 transition-transform duration-300 hover:scale-[1.03] shadow-lg">
                        <div className="relative w-full aspect-[16/9]">
                          <img src={getImageUrl(item.backdrop_path || item.poster_path)} className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                        </div>
                        <div className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-white font-bold text-sm leading-tight">{item.title || item.name}</p>
                          </div>
                          <p className="text-xs text-zinc-400 line-clamp-3">{item.overview}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {showDownload && downloadUrl && (
          <MovieDownloadModal
            url={downloadUrl}
            title={(details?.title || details?.name || 'Title') + (currentMediaType === 'tv' ? ` · S${selectedSeason} E${selectedEpisode}` : '')}
            onClose={() => setShowDownload(false)}
          />
        )}
    </>
  );
}
