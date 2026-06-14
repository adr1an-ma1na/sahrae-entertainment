import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { Track } from '../services/audius';
import { haptics } from '../services/haptics';

type Repeat = 'off' | 'one' | 'all';

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
  playQueue: (tracks: Track[], startIndex?: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleLike: (t: Track) => void;
  isLiked: (id: string) => boolean;
  likedTracks: Track[];
  setExpanded: (v: boolean) => void;
  /** False when another source (radio) owns the speaker — used to hide the bar. */
  active: boolean;
}

const Ctx = createContext<MusicCtx | undefined>(undefined);
const LIKED_KEY = 'sahrae.music.liked.v1';

export function MusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>('off');
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(false);
  const [likedTracks, setLikedTracks] = useState<Track[]>(() => {
    try { return JSON.parse(localStorage.getItem(LIKED_KEY) || '[]'); } catch { return []; }
  });

  const current = queue[index] || null;

  // Load + play whenever the active track changes.
  useEffect(() => {
    const a = audioRef.current;
    const c = queue[index];
    if (!a || !c) return;
    if (a.getAttribute('src') !== c.streamUrl) {
      a.src = c.streamUrl;
      setPosition(0);
      a.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue]);

  // Cross-pause: if any other source (radio) claims the speaker, pause music.
  useEffect(() => {
    const onClaim = (e: Event) => {
      if ((e as CustomEvent).detail !== 'music') { setActive(false); audioRef.current?.pause(); }
    };
    window.addEventListener('sahrae:audioclaim', onClaim);
    return () => window.removeEventListener('sahrae:audioclaim', onClaim);
  }, []);

  const playQueue = (tracks: Track[], startIndex = 0) => {
    if (!tracks.length) return;
    haptics.press();
    setQueue(tracks);
    setIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a || !current) return;
    haptics.tap();
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const next = () => {
    if (!queue.length) return;
    haptics.tap();
    let ni = shuffle ? Math.floor(Math.random() * queue.length) : index + 1;
    if (ni >= queue.length) {
      if (repeat === 'all') ni = 0;
      else { audioRef.current?.pause(); return; }
    }
    setIndex(ni);
  };

  const prev = () => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) { a.currentTime = 0; return; }
    if (!queue.length) return;
    haptics.tap();
    let ni = index - 1;
    if (ni < 0) ni = repeat === 'all' ? queue.length - 1 : 0;
    setIndex(ni);
  };

  const seek = (sec: number) => {
    const a = audioRef.current;
    if (a) { a.currentTime = sec; setPosition(sec); }
  };

  const toggleShuffle = () => { haptics.tap(); setShuffle((s) => !s); };
  const cycleRepeat = () => {
    haptics.tap();
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  };

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

  const handleEnded = () => {
    if (repeat === 'one') {
      const a = audioRef.current;
      if (a) { a.currentTime = 0; a.play().catch(() => {}); }
      return;
    }
    next();
  };

  return (
    <Ctx.Provider
      value={{
        queue, index, current, isPlaying, position, duration, shuffle, repeat, expanded,
        playQueue, toggle, next, prev, seek, toggleShuffle, cycleRepeat, toggleLike, isLiked,
        likedTracks, setExpanded, active,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime || 0)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onPlay={() => { setIsPlaying(true); setActive(true); window.dispatchEvent(new CustomEvent('sahrae:audioclaim', { detail: 'music' })); }}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
      />
    </Ctx.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMusic must be used within a MusicProvider');
  return ctx;
}
