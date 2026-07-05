import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { Track, ytmusic } from '../services/ytmusic';
import { songRadio, diverseSample } from '../services/recommend';
import { haptics } from '../services/haptics';
import { downloads } from '../services/downloads';

type Repeat = 'off' | 'one' | 'all';

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  tracks: Track[];
}

interface MusicCtx {
  queue: Track[];
  index: number;
  current: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: Repeat;
  expanded: boolean;
  buffering: boolean;
  active: boolean;
  autoplay: boolean;
  toggleAutoplay: () => void;
  queueSource: string;
  playQueue: (tracks: Track[], startIndex?: number, source?: string) => void;
  addToQueue: (t: Track) => void;
  playNext: (t: Track) => void;
  startRadio: (seed: Track) => void;
  removeFromQueue: (i: number) => void;
  jumpTo: (i: number) => void;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  setRate: (n: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleLike: (t: Track) => void;
  isLiked: (id: string) => boolean;
  likedTracks: Track[];
  setExpanded: (v: boolean) => void;
  // Library
  playlists: Playlist[];
  recentlyPlayed: Track[];
  // Cold-start taste (from first-run onboarding) — seeds the recommender before
  // there's any listening history, so Sauti is personal from the first open.
  tasteSeeds: Track[];
  onboarded: boolean;
  addTasteSeeds: (tracks: Track[]) => void;
  completeOnboarding: () => void;
  createPlaylist: (name: string) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (id: string, track: Track) => void;
  removeFromPlaylist: (id: string, trackId: string) => void;
  // Add-to-playlist sheet
  addSheetTrack: Track | null;
  openAddSheet: (t: Track) => void;
  closeAddSheet: () => void;
}

const Ctx = createContext<MusicCtx | undefined>(undefined);
const LIKED_KEY = 'sahrae.music.liked.v1';
const PL_KEY = 'sahrae.music.playlists.v1';
const RECENT_KEY = 'sahrae.music.recent.v1';
const SEEDS_KEY = 'sahrae.music.tasteSeeds.v1';
const ONBOARD_KEY = 'sahrae.music.onboarded.v1';
const loadLS = <T,>(k: string, fb: T): T => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch { return fb; } };
const saveLS = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

/* eslint-disable @typescript-eslint/no-explicit-any */
let apiLoading = false;
function loadYT(): Promise<any> {
  return new Promise((resolve) => {
    const w = window as any;
    if (w.YT && w.YT.Player) { resolve(w.YT); return; }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(w.YT); };
    if (!apiLoading) {
      apiLoading = true;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const extendingRef = useRef<string | null>(null);
  // Offline playback: a downloaded track plays from this local <audio> element
  // instead of the YouTube IFrame. Streaming is untouched when not local.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const usingLocalRef = useRef(false);
  // Latest control fns + live position, for the OS MediaSession handlers (which
  // are registered once but must always act on current state).
  const ctrlRef = useRef<{ next: () => void; prev: () => void; stop: () => void; seek: (s: number) => void }>({ next: () => {}, prev: () => {}, stop: () => {}, seek: () => {} });
  const liveRef = useRef({ position: 0, duration: 0 });

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>('off');
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [queueSource, setQueueSource] = useState('');
  const [likedTracks, setLikedTracks] = useState<Track[]>(() => {
    try { return JSON.parse(localStorage.getItem(LIKED_KEY) || '[]'); } catch { return []; }
  });
  const [playlists, setPlaylists] = useState<Playlist[]>(() => loadLS<Playlist[]>(PL_KEY, []));
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>(() => loadLS<Track[]>(RECENT_KEY, []));
  const [tasteSeeds, setTasteSeeds] = useState<Track[]>(() => loadLS<Track[]>(SEEDS_KEY, []));
  const [onboarded, setOnboarded] = useState<boolean>(() => loadLS<boolean>(ONBOARD_KEY, false));
  const [addSheetTrack, setAddSheetTrack] = useState<Track | null>(null);

  const current = queue[index] || null;

  // Track recently played (most recent first, de-duped, capped).
  useEffect(() => {
    const c = queue[index];
    if (!c) return;
    setRecentlyPlayed((prev) => {
      const nextList = [c, ...prev.filter((t) => t.id !== c.id)].slice(0, 40);
      saveLS(RECENT_KEY, nextList);
      return nextList;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Library mutations
  const createPlaylist = (name: string): string => {
    const p: Playlist = { id: `pl_${Date.now()}`, name: name.trim() || 'New Playlist', createdAt: Date.now(), tracks: [] };
    setPlaylists((prev) => { const n = [p, ...prev]; saveLS(PL_KEY, n); return n; });
    return p.id;
  };
  const deletePlaylist = (id: string) => setPlaylists((prev) => { const n = prev.filter((p) => p.id !== id); saveLS(PL_KEY, n); return n; });
  const renamePlaylist = (id: string, name: string) => setPlaylists((prev) => { const n = prev.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)); saveLS(PL_KEY, n); return n; });
  const addToPlaylist = (id: string, track: Track) => {
    haptics.tap();
    setPlaylists((prev) => {
      const n = prev.map((p) => (p.id === id && !p.tracks.some((t) => t.id === track.id) ? { ...p, tracks: [...p.tracks, track] } : p));
      saveLS(PL_KEY, n);
      return n;
    });
  };
  const removeFromPlaylist = (id: string, trackId: string) => setPlaylists((prev) => { const n = prev.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p)); saveLS(PL_KEY, n); return n; });
  const openAddSheet = (t: Track) => setAddSheetTrack(t);
  const closeAddSheet = () => setAddSheetTrack(null);

  // Merge onboarding / discovery picks into the taste-seed pool (deduped, capped).
  const addTasteSeeds = (tracks: Track[]) => {
    setTasteSeeds((prev) => {
      const seen = new Set(prev.map((t) => t.id));
      const merged = [...prev];
      for (const t of tracks) { if (t && !seen.has(t.id)) { seen.add(t.id); merged.push(t); } }
      const capped = merged.slice(0, 40);
      saveLS(SEEDS_KEY, capped);
      return capped;
    });
  };
  const completeOnboarding = () => { setOnboarded(true); saveLS(ONBOARD_KEY, true); };

  // ── transport (fresh closures kept on refs so the YT callbacks see latest state) ──
  const next = () => {
    if (!queue.length) return;
    haptics.tap();
    let ni = shuffle ? Math.floor(Math.random() * queue.length) : index + 1;
    if (ni >= queue.length) {
      if (repeat === 'all') ni = 0;
      else { playerRef.current?.pauseVideo?.(); return; }
    }
    setIndex(ni);
  };
  const handleEnded = () => {
    if (repeat === 'one') { playerRef.current?.seekTo?.(0, true); playerRef.current?.playVideo?.(); return; }
    next();
  };
  const endedRef = useRef(handleEnded); endedRef.current = handleEnded;
  const skipRef = useRef(next); skipRef.current = next;

  // ── Hidden YouTube player via a PLAIN EMBED + postMessage ──
  // The IFrame API (YT.Player) loads but refuses to play on the Capacitor
  // https://localhost origin (0:00). A plain /embed/ iframe plays reliably (it's
  // what the podcast "Watch" uses), so we drive that directly with postMessage.
  // `playerRef.current` is a SHIM exposing the same methods the rest of the code
  // already calls (loadVideoById / playVideo / pauseVideo / seekTo / getCurrentTime
  // / getDuration), so no other call site changes.
  useEffect(() => {
    const f = document.getElementById('sahrae-yt') as HTMLIFrameElement | null;
    if (!f) return;
    const post = (msg: unknown) => { try { f.contentWindow?.postMessage(JSON.stringify(msg), '*'); } catch { /* ignore */ } };
    const cmd = (func: string, args: unknown[] = []) => post({ event: 'command', func, args });

    playerRef.current = {
      loadVideoById: (id: string) => {
        // Set the embed src per track — the proven-reliable path. (The
        // postMessage loadVideoById switch was faster but didn't actually play
        // on this WebView, so we keep the reliable reload.)
        f.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&playsinline=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3`;
      },
      playVideo: () => cmd('playVideo'),
      pauseVideo: () => cmd('pauseVideo'),
      stopVideo: () => cmd('stopVideo'),
      seekTo: (s: number) => cmd('seekTo', [s, true]),
      setPlaybackRate: (r: number) => cmd('setPlaybackRate', [r]),
      getCurrentTime: () => liveRef.current.position,
      getDuration: () => liveRef.current.duration,
    };
    readyRef.current = true;

    // The embed starts posting state once it receives a 'listening' message.
    const onFrameLoad = () => post({ event: 'listening', id: 1, channel: 'widget' });
    f.addEventListener('load', onFrameLoad);

    const onMsg = (e: MessageEvent) => {
      if (typeof e.data !== 'string' || e.origin.indexOf('youtube') < 0) return;
      let d: { event?: string; info?: { currentTime?: number; duration?: number; playerState?: number } };
      try { d = JSON.parse(e.data); } catch { return; }
      if (!d || !d.event) return;
      if (d.event === 'onError') { skipRef.current(); return; }
      if ((d.event === 'infoDelivery' || d.event === 'onStateChange') && d.info) {
        const info = d.info;
        if (typeof info.currentTime === 'number') { liveRef.current.position = info.currentTime; setPosition(info.currentTime); }
        if (typeof info.duration === 'number' && info.duration > 0) { liveRef.current.duration = info.duration; setDuration(info.duration); }
        if (typeof info.playerState === 'number') {
          const s = info.playerState; // -1 unstarted · 0 ended · 1 playing · 2 paused · 3 buffering · 5 cued
          if (s === 1) { setIsPlaying(true); setBuffering(false); setActive(true); window.dispatchEvent(new CustomEvent('sahrae:audioclaim', { detail: 'music' })); }
          else if (s === 2) { setIsPlaying(false); }
          else if (s === 3) { setBuffering(true); }
          else if (s === 0) { endedRef.current(); }
        }
      }
    };
    window.addEventListener('message', onMsg);

    if (pendingRef.current) { playerRef.current.loadVideoById(pendingRef.current); pendingRef.current = null; }

    return () => { window.removeEventListener('message', onMsg); f.removeEventListener('load', onFrameLoad); };
  }, []);

  // ── the offline <audio> element (downloaded tracks play here) ──
  useEffect(() => {
    const a = new Audio();
    a.preload = 'auto';
    audioElRef.current = a;
    const onPlay = () => { setIsPlaying(true); setBuffering(false); setActive(true); window.dispatchEvent(new CustomEvent('sahrae:audioclaim', { detail: 'music' })); };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onEnded = () => endedRef.current();
    const onTime = () => { if (usingLocalRef.current) { setPosition(a.currentTime || 0); if (a.duration && isFinite(a.duration)) setDuration(a.duration); } };
    a.addEventListener('play', onPlay); a.addEventListener('playing', onPlay);
    a.addEventListener('pause', onPause); a.addEventListener('waiting', onWaiting);
    a.addEventListener('ended', onEnded); a.addEventListener('timeupdate', onTime);
    return () => { try { a.pause(); a.removeAttribute('src'); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── load the active track whenever it actually changes (guarded so that
  //    appending radio tracks to the queue never restarts the current song) ──
  useEffect(() => {
    const c = queue[index];
    if (!c || loadedIdRef.current === c.id) return;
    loadedIdRef.current = c.id;
    setPosition(0); setDuration(0);
    // Real-file lane: a downloaded file, OR a direct audio URL (podcast RSS /
    // owned catalog). Both play through the <audio> element, which keeps playing
    // in the BACKGROUND (the YouTube iframe can't). YouTube tracks have no
    // audioUrl → fall through to the unchanged iframe path.
    const local = downloads.localSrc(c.id) || c.audioUrl || null;
    const a = audioElRef.current;
    if (local && a) {
      usingLocalRef.current = true;
      try { playerRef.current?.pauseVideo?.(); } catch { /* ignore */ }
      a.src = local; a.play().catch(() => {});
      setActive(true);
    } else {
      usingLocalRef.current = false;
      try { if (a) { a.pause(); a.removeAttribute('src'); a.load(); } } catch { /* ignore */ }
      if (readyRef.current && playerRef.current) {
        playerRef.current.loadVideoById(c.id);
        // Nudge play in case autoplay doesn't kick in on the WebView.
        const nid = c.id;
        setTimeout(() => { try { if (loadedIdRef.current === nid && !usingLocalRef.current) playerRef.current?.playVideo?.(); } catch { /* ignore */ } }, 1200);
      } else {
        pendingRef.current = c.id;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue]);

  // ── Autoplay radio: as the queue nears its end, extend it with songs related
  //    to what's playing (YouTube-Music-style "Up Next") so music NEVER stops. ──
  //    Related to the current track alone dries up (its picks are soon all in the
  //    queue), so we cascade seeds — current → recent queued tracks → an artist
  //    radio search — until we find fresh songs. This is the endless-radio that
  //    Spotify / YT Music do. ──
  useEffect(() => {
    const c = queue[index];
    if (!c || !autoplay) return;
    if (c.audioUrl) return; // podcasts / owned tracks: no YouTube radio extension
    if (index < queue.length - 2) return; // only when ≤2 tracks remain
    if (extendingRef.current === c.id) return;
    extendingRef.current = c.id;
    (async () => {
      const have = new Set(queue.map((t) => t.id));
      const fresh: Track[] = [];
      const take = (list: Track[]) => { for (const t of list) if (t && !have.has(t.id)) { have.add(t.id); fresh.push(t); } };
      // 1) related to what's playing
      take(await ytmusic.related(c.id).catch(() => [] as Track[]));
      // 2) thin? seed off the freshest queued tracks (different roots = new picks)
      if (fresh.length < 8) {
        for (const s of [...queue].slice(-3).reverse()) {
          if (fresh.length >= 12) break;
          take(await ytmusic.related(s.id).catch(() => [] as Track[]));
        }
      }
      // 3) last resort so it can never dead-end: the current artist's radio
      if (fresh.length < 5 && c.artist) {
        take(await ytmusic.search(`${c.artist} mix`).catch(() => [] as Track[]));
      }
      if (!fresh.length) return;
      setQueue((prev) => {
        const ph = new Set(prev.map((t) => t.id));
        // Diversify the appended run so radio doesn't stack the same artist.
        const add = diverseSample(fresh.filter((t) => !ph.has(t.id)), 25);
        return add.length ? [...prev, ...add] : prev;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, queue.length, autoplay]);

  // ── poll position / duration from the player (offline audio drives its own
  //    position via timeupdate, so skip the IFrame poll when playing local) ──
  useEffect(() => {
    const iv = setInterval(() => {
      if (usingLocalRef.current) return;
      const p = playerRef.current;
      if (p && typeof p.getCurrentTime === 'function') {
        try {
          setPosition(p.getCurrentTime() || 0);
          const d = p.getDuration?.() || 0;
          if (d) setDuration(d);
        } catch { /* player not ready */ }
      }
    }, 500);
    return () => clearInterval(iv);
  }, []);

  // ── cross-pause: another source (radio) claimed the speaker ──
  useEffect(() => {
    const onClaim = (e: Event) => {
      if ((e as CustomEvent).detail !== 'music') { setActive(false); playerRef.current?.pauseVideo?.(); audioElRef.current?.pause(); }
    };
    window.addEventListener('sahrae:audioclaim', onClaim);
    return () => window.removeEventListener('sahrae:audioclaim', onClaim);
  }, []);

  // ── OS MediaSession: now-playing on the lock screen / notification shade with
  //    working transport buttons (phone & tablet; benign elsewhere). Also gives
  //    Android the strongest signal to keep audio alive when backgrounded. ──
  liveRef.current = { position, duration };
  useEffect(() => {
    const ms: any = (navigator as any).mediaSession;
    if (!ms || typeof (window as any).MediaMetadata === 'undefined') return;
    if (!current) { try { ms.metadata = null; ms.playbackState = 'none'; } catch { /* ignore */ } return; }
    const art = current.artworkLarge || current.artwork;
    try {
      ms.metadata = new (window as any).MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: 'Sauti',
        artwork: art ? [
          { src: current.artwork || art, sizes: '256x256', type: 'image/jpeg' },
          { src: art, sizes: '512x512', type: 'image/jpeg' },
        ] : [],
      });
    } catch { /* ignore */ }
  }, [current]);

  useEffect(() => {
    const ms: any = (navigator as any).mediaSession;
    if (!ms) return;
    try { ms.playbackState = active ? (isPlaying ? 'playing' : 'paused') : 'none'; } catch { /* ignore */ }
  }, [isPlaying, active]);

  useEffect(() => {
    const ms: any = (navigator as any).mediaSession;
    if (!ms || typeof ms.setActionHandler !== 'function') return;
    const set = (a: string, h: any) => { try { ms.setActionHandler(a, h); } catch { /* unsupported action */ } };
    set('play', () => { if (usingLocalRef.current) audioElRef.current?.play().catch(() => {}); else playerRef.current?.playVideo?.(); setIsPlaying(true); setActive(true); });
    set('pause', () => { if (usingLocalRef.current) audioElRef.current?.pause(); else playerRef.current?.pauseVideo?.(); setIsPlaying(false); });
    set('previoustrack', () => ctrlRef.current.prev());
    set('nexttrack', () => ctrlRef.current.next());
    set('stop', () => ctrlRef.current.stop());
    set('seekto', (d: any) => { if (d && d.seekTime != null) ctrlRef.current.seek(d.seekTime); });
    set('seekforward', (d: any) => ctrlRef.current.seek(Math.min(liveRef.current.duration || 1e9, liveRef.current.position + ((d && d.seekOffset) || 10))));
    set('seekbackward', (d: any) => ctrlRef.current.seek(Math.max(0, liveRef.current.position - ((d && d.seekOffset) || 10))));
    return () => ['play', 'pause', 'previoustrack', 'nexttrack', 'stop', 'seekto', 'seekforward', 'seekbackward'].forEach((a) => set(a, null));
  }, []);

  useEffect(() => {
    const ms: any = (navigator as any).mediaSession;
    if (!ms || typeof ms.setPositionState !== 'function' || !duration || !isFinite(duration)) return;
    try { ms.setPositionState({ duration, position: Math.min(position, duration), playbackRate: 1 }); } catch { /* ignore */ }
  }, [position, duration]);

  // ── Native background-playback service: start/refresh it while a track is
  //    active (keeps audio alive off-screen + drives the lock-screen/headset
  //    media controls), stop it when playback ends. No-ops on web. ──
  useEffect(() => {
    const on = active && !!current;
    const q = on
      ? `on=1&playing=${isPlaying ? 1 : 0}&title=${encodeURIComponent(current!.title)}&artist=${encodeURIComponent(current!.artist)}`
      : 'on=0';
    fetch(`https://localhost/__bgaudio?${q}`).catch(() => {});
  }, [current, isPlaying, active]);

  // ── Background audio: continuously push the current direct-URL track to native
  //    (sendBeacon, reliable as the app backgrounds) so the native player can take
  //    over BY ITSELF in MainActivity.onStop() — independent of any JS event that
  //    might not fire in time. The in-page <audio> is suspended on background;
  //    native keeps it going, and onStart() hands the position back via
  //    window.__sauti.bgResume(). ──
  useEffect(() => {
    const sync = () => {
      const url = (usingLocalRef.current && current?.audioUrl) ? current.audioUrl : '';
      const pos = Math.floor((liveRef.current.position || 0) * 1000);
      try { navigator.sendBeacon(`https://localhost/__bgsync?url=${encodeURIComponent(url)}&pos=${pos}&playing=${isPlaying ? 1 : 0}`); } catch { /* ignore */ }
    };
    sync();
    const iv = setInterval(sync, 1500);
    const onVis = () => sync(); // push the freshest position the moment we background
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [current, isPlaying]);

  const playQueue = (tracks: Track[], startIndex = 0, source = '') => {
    if (!tracks.length) return;
    haptics.press();
    setActive(true);
    setBuffering(true);
    setQueueSource(source);
    extendingRef.current = null;
    setQueue(tracks);
    setIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));
  };
  const addToQueue = (t: Track) => {
    haptics.tap(); setActive(true);
    setQueue((prev) => { if (!prev.length) { setIndex(0); return [t]; } return [...prev, t]; });
  };
  const playNext = (t: Track) => {
    haptics.tap(); setActive(true);
    setQueue((prev) => { if (!prev.length) { setIndex(0); return [t]; } const n = [...prev]; n.splice(index + 1, 0, t); return n; });
  };
  // Song Radio (spec §1.3.5): start the seed instantly, then extend into a
  // diversified ~50-track radio from its related-tracks graph. The seed stays at
  // index 0 so playback never restarts when the radio fills in.
  const startRadio = (seed: Track) => {
    if (!seed) return;
    playQueue([seed], 0, `${seed.title} Radio`);
    const sid = seed.id;
    (async () => {
      const have = new Set<string>([sid]);
      const pool: Track[] = [];
      const take = (list: Track[]) => { for (const t of list) if (t && !have.has(t.id)) { have.add(t.id); pool.push(t); } };
      take(await ytmusic.related(sid).catch(() => [] as Track[]));
      if (pool.length < 20 && seed.artist) take(await ytmusic.search(`${seed.artist} mix`).catch(() => [] as Track[]));
      if (pool.length < 10) take(await ytmusic.search('top hits 2026').catch(() => [] as Track[]));
      if (!pool.length) return;
      const radio = songRadio(seed, pool, 50);
      // only apply if the user is still on this radio (didn't start something else)
      setQueue((prev) => (prev.length && prev[0]?.id === sid ? radio : prev));
    })();
  };
  const removeFromQueue = (i: number) => {
    if (i === index) return;
    setQueue((prev) => prev.filter((_, k) => k !== i));
    if (i < index) setIndex((x) => x - 1);
  };
  const jumpTo = (i: number) => { haptics.tap(); setIndex(i); };

  const toggle = () => {
    if (!current) return;
    haptics.tap();
    if (usingLocalRef.current) {
      const a = audioElRef.current; if (!a) return;
      if (a.paused) a.play().catch(() => {}); else a.pause();
      return;
    }
    const p = playerRef.current;
    if (!p) return;
    if (isPlaying) p.pauseVideo?.(); else p.playVideo?.();
  };

  // Stop entirely + dismiss the player (e.g. "I want to watch something else").
  const stop = () => {
    haptics.tap();
    try { playerRef.current?.stopVideo?.(); } catch { /* ignore */ }
    try { const a = audioElRef.current; if (a) { a.pause(); a.removeAttribute('src'); } } catch { /* ignore */ }
    usingLocalRef.current = false;
    loadedIdRef.current = null;
    extendingRef.current = null;
    setIsPlaying(false); setActive(false); setExpanded(false);
    setQueue([]); setIndex(0); setPosition(0); setDuration(0);
  };

  const prev = () => {
    if (usingLocalRef.current) {
      const a = audioElRef.current;
      if (a && a.currentTime > 3) { a.currentTime = 0; return; }
    } else {
      const p = playerRef.current;
      if (p && p.getCurrentTime && p.getCurrentTime() > 3) { p.seekTo?.(0, true); return; }
    }
    if (!queue.length) return;
    haptics.tap();
    let ni = index - 1;
    if (ni < 0) ni = repeat === 'all' ? queue.length - 1 : 0;
    setIndex(ni);
  };

  const seek = (sec: number) => {
    if (usingLocalRef.current) { const a = audioElRef.current; if (a) try { a.currentTime = sec; } catch { /* ignore */ } }
    else playerRef.current?.seekTo?.(sec, true);
    setPosition(sec);
  };
  // Playback speed (podcasts). Applies to whichever engine is active.
  const setRate = (n: number) => {
    try { playerRef.current?.setPlaybackRate?.(n); } catch { /* ignore */ }
    try { const a = audioElRef.current; if (a) a.playbackRate = n; } catch { /* ignore */ }
  };
  const toggleShuffle = () => { haptics.tap(); setShuffle((s) => !s); };
  const toggleAutoplay = () => { haptics.tap(); setAutoplay((s) => !s); };
  const cycleRepeat = () => { haptics.tap(); setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')); };

  const toggleLike = (t: Track) => {
    haptics.tap();
    setLikedTracks((prev) => {
      const exists = prev.some((x) => x.id === t.id);
      const nextList = exists ? prev.filter((x) => x.id !== t.id) : [t, ...prev];
      try { localStorage.setItem(LIKED_KEY, JSON.stringify(nextList)); } catch { /* ignore */ }
      return nextList;
    });
  };
  const isLiked = (id: string) => likedTracks.some((x) => x.id === id);

  // Keep the MediaSession handlers pointed at the latest control closures.
  ctrlRef.current = { next, prev, stop, seek };

  // Expose controls to the native background service so headset / earbud /
  // lock-screen media buttons (next, prev, play, pause) drive the player.
  (window as unknown as { __sauti?: unknown }).__sauti = {
    play: () => { try { if (usingLocalRef.current) audioElRef.current?.play(); else playerRef.current?.playVideo?.(); } catch { /* ignore */ } setIsPlaying(true); setActive(true); },
    pause: () => { try { if (usingLocalRef.current) audioElRef.current?.pause(); else playerRef.current?.pauseVideo?.(); } catch { /* ignore */ } setIsPlaying(false); },
    // Called natively (onStart) after native background playback — resume the
    // in-page <audio> from where native got to.
    bgResume: (posMs: number) => {
      const a = audioElRef.current;
      if (a && usingLocalRef.current) {
        try { const sec = (posMs || 0) / 1000; if (sec > 0) a.currentTime = sec; a.play().catch(() => {}); } catch { /* ignore */ }
        setIsPlaying(true); setActive(true);
      }
    },
    toggle, next, prev, stop,
  };

  return (
    <Ctx.Provider
      value={{
        queue, index, current, isPlaying, position, duration, shuffle, repeat, expanded, buffering, active,
        autoplay, toggleAutoplay, queueSource,
        playQueue, addToQueue, playNext, startRadio, removeFromQueue, jumpTo,
        toggle, stop, next, prev, seek, setRate, toggleShuffle, cycleRepeat, toggleLike, isLiked,
        likedTracks, setExpanded,
        playlists, recentlyPlayed, tasteSeeds, onboarded, addTasteSeeds, completeOnboarding,
        createPlaylist, deletePlaylist, renamePlaylist, addToPlaylist, removeFromPlaylist,
        addSheetTrack, openAddSheet, closeAddSheet,
      }}
    >
      {children}
      {/* Hidden YouTube player — 1x1, present in the viewport so it isn't throttled. */}
      <div aria-hidden style={{ position: 'fixed', right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        <iframe id="sahrae-yt" title="Sauti audio" allow="autoplay; encrypted-media" style={{ border: 0, width: '1px', height: '1px' }} />
      </div>
    </Ctx.Provider>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useMusic() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMusic must be used within a MusicProvider');
  return ctx;
}
