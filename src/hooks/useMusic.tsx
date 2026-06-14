import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { Track, ytmusic } from '../services/ytmusic';
import { haptics } from '../services/haptics';

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
  removeFromQueue: (i: number) => void;
  jumpTo: (i: number) => void;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleLike: (t: Track) => void;
  isLiked: (id: string) => boolean;
  likedTracks: Track[];
  setExpanded: (v: boolean) => void;
  // Library
  playlists: Playlist[];
  recentlyPlayed: Track[];
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

  // ── init the hidden YouTube player once ──
  useEffect(() => {
    let cancelled = false;
    loadYT().then((YT) => {
      if (cancelled || playerRef.current) return;
      playerRef.current = new YT.Player('sahrae-yt-player', {
        height: '1', width: '1',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => {
            readyRef.current = true;
            if (pendingRef.current) { playerRef.current.loadVideoById(pendingRef.current); pendingRef.current = null; }
          },
          onStateChange: (e: any) => {
            // ENDED 0 · PLAYING 1 · PAUSED 2 · BUFFERING 3
            if (e.data === 1) {
              setIsPlaying(true); setBuffering(false); setActive(true);
              window.dispatchEvent(new CustomEvent('sahrae:audioclaim', { detail: 'music' }));
            } else if (e.data === 2) { setIsPlaying(false); }
            else if (e.data === 3) { setBuffering(true); }
            else if (e.data === 0) { endedRef.current(); }
          },
          onError: () => { skipRef.current(); }, // embed disabled / unavailable → skip on
        },
      });
    });
    return () => { cancelled = true; };
  }, []);

  // ── load the active track whenever it actually changes (guarded so that
  //    appending radio tracks to the queue never restarts the current song) ──
  useEffect(() => {
    const c = queue[index];
    if (!c || loadedIdRef.current === c.id) return;
    loadedIdRef.current = c.id;
    setPosition(0);
    if (readyRef.current && playerRef.current) playerRef.current.loadVideoById(c.id);
    else pendingRef.current = c.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue]);

  // ── Autoplay radio: as the queue nears its end, extend it with songs related
  //    to what's playing (YouTube-Music-style "Up Next") so music never stops. ──
  useEffect(() => {
    const c = queue[index];
    if (!c || !autoplay) return;
    if (index < queue.length - 2) return; // only when ≤2 tracks remain
    if (extendingRef.current === c.id) return;
    extendingRef.current = c.id;
    ytmusic.related(c.id).then((rel) => {
      if (!rel.length) return;
      setQueue((prev) => {
        const have = new Set(prev.map((t) => t.id));
        const add = rel.filter((t) => !have.has(t.id)).slice(0, 20);
        return add.length ? [...prev, ...add] : prev;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, queue.length, autoplay]);

  // ── poll position / duration from the player ──
  useEffect(() => {
    const iv = setInterval(() => {
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
      if ((e as CustomEvent).detail !== 'music') { setActive(false); playerRef.current?.pauseVideo?.(); }
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
    set('play', () => { playerRef.current?.playVideo?.(); setIsPlaying(true); setActive(true); });
    set('pause', () => { playerRef.current?.pauseVideo?.(); setIsPlaying(false); });
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
  const removeFromQueue = (i: number) => {
    if (i === index) return;
    setQueue((prev) => prev.filter((_, k) => k !== i));
    if (i < index) setIndex((x) => x - 1);
  };
  const jumpTo = (i: number) => { haptics.tap(); setIndex(i); };

  const toggle = () => {
    const p = playerRef.current;
    if (!p || !current) return;
    haptics.tap();
    if (isPlaying) p.pauseVideo?.(); else p.playVideo?.();
  };

  // Stop entirely + dismiss the player (e.g. "I want to watch something else").
  const stop = () => {
    haptics.tap();
    try { playerRef.current?.stopVideo?.(); } catch { /* ignore */ }
    loadedIdRef.current = null;
    extendingRef.current = null;
    setIsPlaying(false); setActive(false); setExpanded(false);
    setQueue([]); setIndex(0); setPosition(0); setDuration(0);
  };

  const prev = () => {
    const p = playerRef.current;
    if (p && p.getCurrentTime && p.getCurrentTime() > 3) { p.seekTo?.(0, true); return; }
    if (!queue.length) return;
    haptics.tap();
    let ni = index - 1;
    if (ni < 0) ni = repeat === 'all' ? queue.length - 1 : 0;
    setIndex(ni);
  };

  const seek = (sec: number) => { playerRef.current?.seekTo?.(sec, true); setPosition(sec); };
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

  return (
    <Ctx.Provider
      value={{
        queue, index, current, isPlaying, position, duration, shuffle, repeat, expanded, buffering, active,
        autoplay, toggleAutoplay, queueSource,
        playQueue, addToQueue, playNext, removeFromQueue, jumpTo,
        toggle, stop, next, prev, seek, toggleShuffle, cycleRepeat, toggleLike, isLiked,
        likedTracks, setExpanded,
        playlists, recentlyPlayed, createPlaylist, deletePlaylist, renamePlaylist, addToPlaylist, removeFromPlaylist,
        addSheetTrack, openAddSheet, closeAddSheet,
      }}
    >
      {children}
      {/* Hidden YouTube player — 1x1, present in the viewport so it isn't throttled. */}
      <div aria-hidden style={{ position: 'fixed', right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        <div id="sahrae-yt-player" />
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
