import { useState, useEffect, useRef, Fragment, type CSSProperties } from 'react';
import { Play, Pause, SkipForward, SkipBack, ChevronDown, Heart, Shuffle, Repeat, Repeat1, Music2, Plus, X, ListMusic, Mic2, SlidersHorizontal, RotateCcw, RotateCw, Gauge, Moon, Radio, ArrowUp, ArrowDown } from 'lucide-react';
import { useMusic } from '../hooks/useMusic';
import { Track, ytmusic } from '../services/ytmusic';
import { hdArtwork } from '../services/albumArt';
import { CoverArt } from './ui/CoverArt';
import { DynamicBackground } from './ui/DynamicBackground';
import EqualizerPanel from './EqualizerPanel';

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

/* ─────────── Lyrics (lrclib.net, key-less, CORS-enabled) ─────────── */
type LyricLine = { t: number; text: string };
function parseLRC(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const tags = raw.match(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g);
    if (!tags) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const tag of tags) {
      const mm = tag.match(/\[(\d+):(\d+)(?:[.:](\d+))?\]/);
      if (!mm) continue;
      const t = parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) + (mm[3] ? parseFloat('0.' + mm[3]) : 0);
      out.push({ t, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
/* eslint-disable @typescript-eslint/no-explicit-any */
function LyricsPanel({
  track,
  state,
  synced,
  plain,
  activeIdx,
  onSeek,
}: {
  track: Track;
  state: 'loading' | 'synced' | 'plain' | 'none';
  synced: LyricLine[];
  plain: string;
  activeIdx: number;
  onSeek?: (t: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeIdx]);

  if (state === 'loading') return <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Finding lyrics…</div>;
  if (state === 'none') return <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm px-8 text-center">No lyrics found for this track.</div>;
  if (state === 'plain') return (
    <div className="flex-1 overflow-y-auto custom-scrollbar px-6 text-left py-10" style={{ background: `linear-gradient(180deg, ${track.dominantColor || '#3b3b44'} 0%, rgba(0,0,0,0.5) 100%)` }}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/60 mb-6">Lyrics, not synced</p>
      {plain.split('\n').map((l, i) => <p key={i} className="text-lg font-semibold text-white/80 leading-relaxed py-0.5">{l || ' '}</p>)}
    </div>
  );
  return (
    <div className="relative h-full">
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${track.dominantColor || '#3b3b44'} 0%, ${track.dominantColor || '#3b3b44'} 62%, rgba(0,0,0,0.5) 100%)` }} />
      <div className="relative h-full overflow-y-auto custom-scrollbar px-6 py-[40vh] text-left">
      {synced.map((l, i) => (
        <button key={i} ref={i === activeIdx ? activeRef : undefined} onClick={() => onSeek?.(l.t)}
          className={`block w-full text-left leading-[1.15] py-2.5 font-sans tracking-tight transition-colors duration-200 text-2xl md:text-[32px] font-extrabold ${i === activeIdx ? 'text-white' : 'text-white/50 hover:text-white/75'}`}>
          {l.text || '♪'}
        </button>
      ))}
      <p className="text-[10px] text-white/45 pt-6 pb-2">Lyrics provided by LRCLIB</p>
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function QueueRow({
  track,
  activeRow,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown
}: {
  track: Track;
  activeRow?: boolean;
  onPlay?: () => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div tabIndex={onPlay ? 0 : undefined} data-tv-focusable={onPlay ? true : undefined} role={onPlay ? 'button' : undefined} onClick={onPlay}
      className={`flex items-center gap-3 p-2 rounded-xl group/row ${onPlay ? 'cursor-pointer hover:bg-white/5 focus:outline-none focus:bg-white/5' : ''}`}>
      <CoverArt imageUrl={track.artwork} dominantColor={track.dominantColor} className="w-11 h-11 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold truncate ${activeRow ? 'text-sauti' : 'text-white'}`}>{track.title}</p>
        <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onMoveUp && (
          <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100" aria-label="Move up">
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
        {onMoveDown && (
          <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100" aria-label="Move down">
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
        {onRemove && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-2 text-zinc-500 hover:text-red-400 rounded-lg shrink-0" aria-label="Remove from queue">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function MusicPlayer() {
  const {
    current, isPlaying, position, duration, shuffle, repeat, expanded, active,
    queue, index, queueSource, jumpTo, removeFromQueue, playQueue, startRadio,
    toggle, stop, next, prev, seek, setRate, toggleShuffle, cycleRepeat, toggleLike, isLiked, setExpanded, openAddSheet,
    autoplay, toggleAutoplay, reorderQueue, clearQueue, recentlyPlayed
  } = useMusic();
  const [showQueue, setShowQueue] = useState(false);
  const [qTab, setQTab] = useState<'next' | 'lyrics' | 'related'>('next');
  const [showEq, setShowEq] = useState(false);
  // "Related" tab (YouTube-Music-style) — songs related to what's playing.
  const [related, setRelated] = useState<Track[]>([]);
  const [relLoading, setRelLoading] = useState(false);
  const relForId = useRef<string | null>(null);

  // Podcast controls: playback speed + sleep timer.
  const isPodcast = queueSource === 'Podcasts';
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];
  const [speed, setSpeed] = useState(1);
  const [sleepMin, setSleepMin] = useState(0);
  const sleepRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleSpeed = () => { const n = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; setSpeed(n); setRate(n); };
  const cycleSleep = () => {
    const opts = [0, 15, 30, 45, 60]; const n = opts[(opts.indexOf(sleepMin) + 1) % opts.length];
    setSleepMin(n);
    if (sleepRef.current) { clearTimeout(sleepRef.current); sleepRef.current = null; }
    if (n > 0) sleepRef.current = setTimeout(() => { stop(); setSleepMin(0); }, n * 60_000);
  };
  // Re-apply chosen speed when the episode changes (the embed resets to 1x).
  useEffect(() => { if (isPodcast && speed !== 1) { const t = setTimeout(() => setRate(speed), 2500); return () => clearTimeout(t); } }, [current?.id, isPodcast, speed, setRate]);

  // Load "Related" when its tab is opened for the current track (cached per id).
  useEffect(() => {
    if (!showQueue || qTab !== 'related' || !current) return;
    if (relForId.current === current.id) return;
    relForId.current = current.id;
    setRelLoading(true); setRelated([]);
    let cancelled = false;
    (async () => {
      const seedId = current.id;
      const base = await ytmusic.related(seedId).catch(() => [] as Track[]);
      const seen = new Set<string>([seedId, ...base.map((t) => t.id)]);
      const list = [...base];
      // Deepen so the list doesn't run dry — pull related off the top picks too.
      for (const s of base.slice(0, 3)) {
        if (cancelled || list.length >= 50) break;
        const more = await ytmusic.related(s.id).catch(() => [] as Track[]);
        for (const t of more) if (!seen.has(t.id)) { seen.add(t.id); list.push(t); }
      }
      if (!cancelled) { setRelated(list); setRelLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [showQueue, qTab, current]);

  // Resolve a true-HD cover (iTunes) for the big now-playing art.
  const [hdArt, setHdArt] = useState<string | undefined>(undefined);
  const curId = current?.id;
  useEffect(() => {
    setHdArt(undefined);
    if (!current) return;
    let cancelled = false;
    hdArtwork(current.id, current.artist, current.title).then((u) => { if (!cancelled && u) setHdArt(u); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId]);

  /* ── Lifted Lyrics State & Fetching Engine (Spotify card & full sync) ── */
  const [lyricsState, setLyricsState] = useState<'loading' | 'synced' | 'plain' | 'none'>('loading');
  const [syncedLyrics, setSyncedLyrics] = useState<LyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState('');

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setLyricsState('loading'); setSyncedLyrics([]); setPlainLyrics('');
    (async () => {
      try {
        const clean = (s: string) => s
          .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
          .replace(/\s*-\s*topic\s*$/i, '')
          .replace(/\b(official\s*(music\s*)?video|official\s*audio|lyric[s]?\s*video|visuali[sz]er|audio|hd|4k|mv|remaster(ed)?)\b/gi, ' ')
          .replace(/\s+/g, ' ').trim();
        const q = `${clean(current.artist)} ${clean(current.title)}`.replace(/\s+/g, ' ').trim();
        const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
        const arr = r.ok ? await r.json() : [];
        if (cancelled) return;
        const list: any[] = Array.isArray(arr) ? arr : [];
        const syncedList = list.filter((x) => x.syncedLyrics);
        const dur = duration && isFinite(duration) && duration > 0 ? duration : (current.duration || 0);
        let s = syncedList[0];
        if (dur && syncedList.length > 1) {
          s = syncedList.reduce((best, x) => (Math.abs((x.duration || 0) - dur) < Math.abs((best.duration || 0) - dur) ? x : best), syncedList[0]);
        }
        if (s?.syncedLyrics) { const p = parseLRC(s.syncedLyrics); if (p.length) { setSyncedLyrics(p); setLyricsState('synced'); return; } }
        const p = list.find((x) => x.plainLyrics);
        if (p?.plainLyrics) { setPlainLyrics(p.plainLyrics); setLyricsState('plain'); return; }
        setLyricsState('none');
      } catch { if (!cancelled) setLyricsState('none'); }
    })();
    return () => { cancelled = true; };
  }, [current?.id, Math.round(duration || 0)]);

  // Live Position Sync for scrolling and real-time Spotify card updates
  const baseRef = useRef({ pos: 0, at: Date.now() });
  useEffect(() => { baseRef.current = { pos: position, at: Date.now() }; }, [position]);
  const [, force] = useState(0);
  useEffect(() => {
    if (!isPlaying || lyricsState !== 'synced') return;
    const iv = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(iv);
  }, [isPlaying, lyricsState]);
  const livePos = isPlaying ? baseRef.current.pos + (Date.now() - baseRef.current.at) / 1000 : position;

  let activeLyricIdx = -1;
  if (lyricsState === 'synced') {
    for (let i = 0; i < syncedLyrics.length; i++) {
      if (syncedLyrics[i].t <= livePos + 0.2) activeLyricIdx = i;
      else break;
    }
  }

  // Swipe-to-skip gesture handlers on the mini-player
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (diff > 60) {
      prev();
    } else if (diff < -60) {
      next();
    }
  };

  if (!current || !active) return null;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;
  const upNext = queue.slice(index + 1);

  return (
    <>
      {/* ── Full-screen now-playing (album-art dominant) ── */}
      {expanded && (
        <div role="dialog" data-tv-layer className="dark sauti fixed inset-0 z-[120] overflow-y-auto custom-scrollbar animate-in fade-in duration-300"
          style={{ '--white': '#ffffff', '--zinc-200': '#e4e4e7', '--zinc-300': '#d4d4d8', '--zinc-400': '#a1a1aa', '--zinc-500': '#71717a' } as unknown as CSSProperties}>
          <DynamicBackground color={current.dominantColor} />

          {/* Art-derived colour bleed — the immersive Apple-Music backdrop. */}
          {(hdArt || current.artworkLarge || current.artwork) && (
            <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
              <img src={hdArt || current.artworkLarge || current.artwork} alt="" className="np-bleed w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.55) 55%, #000 100%)' }} />
            </div>
          )}

          <div className="relative z-10 min-h-full flex flex-col px-5 md:px-8 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] max-w-xl mx-auto justify-between">
            {/* Top bar */}
            <div className="flex items-center justify-between shrink-0">
              <button onClick={() => setExpanded(false)} data-tv-close tabIndex={0} data-tv-focusable className="w-11 h-11 rounded-full glass-liquid flex items-center justify-center text-white" aria-label="Minimize">
                <ChevronDown className="w-6 h-6" />
              </button>
              <p className="overline truncate px-3">{queueSource ? `Playing from ${queueSource}` : 'Now Playing'}</p>
              <button onClick={stop} tabIndex={0} data-tv-focusable className="w-11 h-11 rounded-full glass-liquid flex items-center justify-center text-white" aria-label="Stop music">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Album art (lyrics live in the Up next / Lyrics / Related panel) */}
            <div className="flex-1 flex items-center justify-center py-6 min-h-0 shrink-0">
              {current.artworkLarge || current.artwork ? (
                <div className="relative w-[min(80vw,42vh)] max-w-[380px]"
                  style={{ transform: isPlaying ? 'scale(1)' : 'scale(0.94)', transition: 'transform 320ms cubic-bezier(0.22,1,0.36,1)' }}>
                  <CoverArt imageUrl={hdArt || current.artworkLarge || current.artwork} fallbackUrl={current.artwork} dominantColor={current.dominantColor} rounded="rounded-3xl"
                    className="np-art w-full aspect-square" />
                  <img aria-hidden alt="" src={hdArt || current.artworkLarge || current.artwork} className="np-reflect absolute left-0 right-0 top-full mt-3 w-full h-1/3 object-cover object-top rounded-3xl pointer-events-none" />
                </div>
              ) : (
                <div className="w-[78vw] max-w-[360px] aspect-square rounded-2xl bg-zinc-800 flex items-center justify-center"><Music2 className="w-20 h-20 text-zinc-600" /></div>
              )}
            </div>

            {/* Title + quick actions */}
            <div className="flex items-center gap-3 mb-5 px-1 shrink-0 mt-8">
              <div className="min-w-0 flex-1">
                <h2 className="np-title text-3xl font-display font-bold text-white truncate">{current.title}</h2>
                <p className="text-zinc-300 truncate font-medium">{current.artist}</p>
              </div>
              <button onClick={() => openAddSheet(current)} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-300 hover:text-white shrink-0" aria-label="Add to playlist"><Plus className="w-5 h-5" /></button>
              <button onClick={() => toggleLike(current)} tabIndex={0} data-tv-focusable className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isLiked(current.id) ? 'text-sauti' : 'text-zinc-300 hover:text-white'}`} aria-label="Like"><Heart className={`w-6 h-6 ${isLiked(current.id) ? 'fill-current' : ''}`} /></button>
            </div>

            {/* Control deck — scrubber + transport on frosted glass */}
            <div className="control-deck p-4 md:p-5 mb-4 shrink-0">
              <div className="mb-4">
                <input type="range" min={0} max={duration || 0} value={position} step={1} onChange={(e) => seek(Number(e.target.value))} className="scrub w-full" aria-label="Seek" />
                <div className="flex justify-between text-[11px] text-zinc-400 tabular mt-2"><span>{fmt(position)}</span><span>{fmt(duration)}</span></div>
              </div>

              {/* Transport — podcasts get skip-back-15 / skip-forward-30 instead
                  of shuffle/repeat; music keeps shuffle/repeat. */}
              <div className="flex items-center justify-between">
                {isPodcast ? (
                  <button onClick={() => seek(Math.max(0, position - 15))} tabIndex={0} data-tv-focusable className="relative w-11 h-11 flex items-center justify-center rounded-full text-zinc-300 hover:text-white" aria-label="Back 15s"><RotateCcw className="w-6 h-6" /><span className="absolute text-[8px] font-bold">15</span></button>
                ) : (
                  <button onClick={toggleShuffle} tabIndex={0} data-tv-focusable className={`w-11 h-11 flex items-center justify-center rounded-full ${shuffle ? 'text-sauti' : 'text-zinc-400 hover:text-white'}`} aria-label="Shuffle"><Shuffle className="w-5 h-5" /></button>
                )}
                <button onClick={prev} tabIndex={0} data-tv-focusable className="w-12 h-12 flex items-center justify-center text-white" aria-label="Previous"><SkipBack className="w-7 h-7 fill-current" /></button>
                <button onClick={toggle} tabIndex={0} data-tv-focusable className="btn-sauti w-16 h-16 rounded-full flex items-center justify-center" aria-label={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
                </button>
                <button onClick={next} tabIndex={0} data-tv-focusable className="w-12 h-12 flex items-center justify-center text-white" aria-label="Next"><SkipForward className="w-7 h-7 fill-current" /></button>
                {isPodcast ? (
                  <button onClick={() => seek(Math.min(duration || position + 30, position + 30))} tabIndex={0} data-tv-focusable className="relative w-11 h-11 flex items-center justify-center rounded-full text-zinc-300 hover:text-white" aria-label="Forward 30s"><RotateCw className="w-6 h-6" /><span className="absolute text-[8px] font-bold">30</span></button>
                ) : (
                  <button onClick={cycleRepeat} tabIndex={0} data-tv-focusable className={`w-11 h-11 flex items-center justify-center rounded-full ${repeat !== 'off' ? 'text-sauti' : 'text-zinc-400 hover:text-white'}`} aria-label="Repeat">
                    {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Secondary controls — podcasts: Speed + Sleep; music: Lyrics. EQ + Queue always. */}
            <div className="flex items-center justify-center gap-2 mt-5 flex-wrap shrink-0">
              {isPodcast ? (
                <>
                  <button onClick={cycleSpeed} tabIndex={0} data-tv-focusable className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${speed !== 1 ? 'bg-sauti text-amber-950' : 'glass-liquid text-white'}`}><Gauge className="w-4 h-4" /> {speed}×</button>
                  <button onClick={cycleSleep} tabIndex={0} data-tv-focusable className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${sleepMin > 0 ? 'bg-sauti text-amber-950' : 'glass-liquid text-white'}`}><Moon className="w-4 h-4" /> {sleepMin > 0 ? `${sleepMin}m` : 'Sleep'}</button>
                </>
              ) : (
                <button onClick={() => { setQTab('lyrics'); setShowQueue(true); }} tabIndex={0} data-tv-focusable className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold glass-liquid text-white"><Mic2 className="w-4 h-4" /> Lyrics</button>
              )}
              <button onClick={() => setShowEq(true)} tabIndex={0} data-tv-focusable className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold glass-liquid text-white" aria-label="Equalizer"><SlidersHorizontal className="w-4 h-4" /> EQ</button>
              <button onClick={() => { setQTab('next'); setShowQueue(true); }} tabIndex={0} data-tv-focusable className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold glass-liquid text-white"><ListMusic className="w-4 h-4" /> Up next</button>
            </div>

            {/* Spotify-style Live Scrolling Lyrics Card */}
            {lyricsState !== 'none' && (
              <div 
                onClick={() => { setQTab('lyrics'); setShowQueue(true); }}
                className="mt-6 p-5 rounded-2xl cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-transform text-left relative overflow-hidden shadow-lg group shrink-0"
                style={{ backgroundColor: `${current.dominantColor || '#34343a'}ee`, border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center justify-between mb-3 text-white/90 relative z-10">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 font-display">
                    <Mic2 className="w-3.5 h-3.5" /> Lyrics
                  </span>
                  <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                    {lyricsState === 'synced' ? 'Synced' : 'Full Lyrics'}
                  </span>
                </div>
                
                <div className="space-y-2 select-none relative z-10">
                  {lyricsState === 'loading' ? (
                    <p className="text-white/60 text-sm animate-pulse">Searching lyrics…</p>
                  ) : lyricsState === 'plain' ? (
                    <p className="text-white font-bold text-lg leading-snug line-clamp-3 font-sans tracking-tight">
                      {plainLyrics.split('\n').slice(0, 3).join('\n')}
                    </p>
                  ) : (
                    <div className="min-h-[64px] flex flex-col justify-center">
                      {activeLyricIdx >= 0 ? (
                        <>
                          <p className="text-white font-extrabold text-xl leading-snug font-sans tracking-tight animate-in fade-in duration-300">
                            {syncedLyrics[activeLyricIdx].text || '♪'}
                          </p>
                          {activeLyricIdx + 1 < syncedLyrics.length && (
                            <p className="text-white/40 font-bold text-base leading-snug font-sans tracking-tight mt-1 line-clamp-1">
                              {syncedLyrics[activeLyricIdx + 1].text || '♪'}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-white/80 font-bold text-lg leading-snug font-sans tracking-tight">
                          {syncedLyrics.slice(0, 2).map(l => l.text).filter(Boolean).join(' / ') || '♪ Instrumentals ♪'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Up next / Lyrics / Related (YouTube-Music-style player tabs) ── */}
      {showQueue && (
        <div role="dialog" data-tv-layer className="dark sauti fixed inset-0 z-[125] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-white/10 bg-black/40 backdrop-blur-md">
            <button onClick={() => setShowQueue(false)} data-tv-close tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full glass-liquid flex items-center justify-center text-white" aria-label="Back"><ChevronDown className="w-6 h-6" /></button>
            <div className="flex gap-5">
              {(['next', 'lyrics', 'related'] as const).map((t) => (
                <button key={t} onClick={() => setQTab(t)} tabIndex={0} data-tv-focusable className={`text-sm font-bold pb-1.5 border-b-2 transition-colors capitalize ${qTab === t ? 'text-white border-amber-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>{t === 'next' ? 'Up next' : t}</button>
              ))}
            </div>
          </div>
          {qTab === 'lyrics' ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 relative">
                <LyricsPanel 
                  track={current} 
                  state={lyricsState} 
                  synced={syncedLyrics} 
                  plain={plainLyrics} 
                  activeIdx={activeLyricIdx} 
                  onSeek={seek} 
                />
              </div>
              {/* Mini track player below the lyrics (Spotify-style) */}
              <div className="shrink-0 border-t border-white/10 bg-black/45 backdrop-blur px-4 py-3 flex items-center gap-3">
                <CoverArt imageUrl={current.artwork} dominantColor={current.dominantColor} className="w-11 h-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{current.title}</p>
                  <p className="text-xs text-zinc-400 truncate">{current.artist}</p>
                </div>
                <button onClick={() => seek(Math.max(0, position - 10))} tabIndex={0} data-tv-focusable className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-white shrink-0" aria-label="Back 10s"><RotateCcw className="w-5 h-5" /></button>
                <button onClick={toggle} tabIndex={0} data-tv-focusable className="btn-sauti w-11 h-11 rounded-full flex items-center justify-center shrink-0" aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}</button>
                <button onClick={next} tabIndex={0} data-tv-focusable className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-white shrink-0" aria-label="Next"><SkipForward className="w-5 h-5 fill-current" /></button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 pb-32 max-w-2xl mx-auto w-full">
              {qTab === 'next' ? (
                <>
                  <p className="overline mb-2 px-1">Now playing</p>
                  <QueueRow track={current} activeRow />
                  
                  {/* Spotify-style Autoplay Toggle Switch */}
                  <div className="flex items-center justify-between border-t border-b border-white/5 py-3 my-4 px-1">
                    <div>
                      <p className="text-sm font-bold text-white">Autoplay similar songs</p>
                      <p className="text-xs text-zinc-400">Keep Sauti going when your queue runs dry</p>
                    </div>
                    <button 
                      onClick={toggleAutoplay}
                      tabIndex={0}
                      data-tv-focusable
                      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none shrink-0 ${autoplay ? 'bg-amber-500' : 'bg-zinc-700'}`}
                      aria-label="Toggle Autoplay"
                    >
                      <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${autoplay ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-6 mb-2 px-1">
                    <p className="overline">{queueSource ? `Next from: ${queueSource}` : 'Next up'}</p>
                    {upNext.length > 0 && (
                      <button onClick={clearQueue} tabIndex={0} data-tv-focusable className="text-xs font-bold text-sauti hover:underline">
                        Clear queue
                      </button>
                    )}
                  </div>
                  {upNext.length === 0 ? (
                    <p className="text-zinc-500 text-sm px-1">Autoplay keeps it going with related songs.</p>
                  ) : (
                    <div className="space-y-1">
                      {upNext.map((t, i) => {
                        const totalIdx = index + 1 + i;
                        return (
                          <Fragment key={`${t.id}-${i}`}>
                            <QueueRow 
                              track={t} 
                              onPlay={() => jumpTo(totalIdx)} 
                              onRemove={() => removeFromQueue(totalIdx)}
                              onMoveUp={i > 0 ? () => reorderQueue(totalIdx, totalIdx - 1) : undefined}
                              onMoveDown={i < upNext.length - 1 ? () => reorderQueue(totalIdx, totalIdx + 1) : undefined}
                            />
                          </Fragment>
                        );
                      })}
                    </div>
                  )}

                  {/* Recently Played Section inside Queue drawer */}
                  {recentlyPlayed.length > 0 && (
                    <div className="mt-8">
                      <p className="overline mb-2 px-1">Recently played</p>
                      <div className="space-y-1">
                        {recentlyPlayed.slice(0, 5).map((t, i) => (
                          <Fragment key={`hist-${t.id}-${i}`}>
                            <QueueRow 
                              track={t} 
                              onPlay={() => playQueue([t], 0, 'History')}
                            />
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : relLoading ? (
                <p className="text-zinc-500 text-sm px-1">Finding related songs…</p>
              ) : related.length === 0 ? (
                <p className="text-zinc-500 text-sm px-1">No related songs found.</p>
              ) : (
                <>
                  {current && (
                    <button onClick={() => { startRadio(current); setShowQueue(false); }} tabIndex={0} data-tv-focusable
                       className="w-full mb-3 btn-sauti px-4 py-2.5 rounded-full text-sm font-bold flex items-center justify-center gap-2">
                      <Radio className="w-4 h-4" /> Start radio from this song
                    </button>
                  )}
                  {related.map((t, i) => <Fragment key={`rel-${t.id}-${i}`}><QueueRow track={t} onPlay={() => playQueue(related, i, 'Related')} /></Fragment>)}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Persistent mini-bar ── */}
      {!expanded && (
        <div className="fixed left-0 right-0 md:left-16 lg:left-64 z-[60] px-2 pointer-events-none bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-3">
          <div className="pointer-events-auto max-w-3xl mx-auto dark glass rounded-2xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.45)] overflow-hidden">
            {/* progress hairline */}
            <div className="h-0.5 bg-white/10"><div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-[width] duration-200" style={{ width: `${pct}%` }} /></div>
            <div className="flex items-center gap-3 p-2 pr-3">
              <button 
                onClick={() => setExpanded(true)} 
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer" 
                aria-label="Open player"
              >
                <CoverArt imageUrl={current.artwork} dominantColor={current.dominantColor} className="w-11 h-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{current.title}</p>
                  <p className="text-xs text-zinc-400 truncate">{current.artist}</p>
                </div>
              </button>
              
              {/* Spotify-style Mini Player Heart Icon */}
              <button 
                onClick={() => toggleLike(current)} 
                tabIndex={0} 
                data-tv-focusable 
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${isLiked(current.id) ? 'text-amber-500' : 'text-zinc-400 hover:text-white'}`} 
                aria-label="Like"
              >
                <Heart className={`w-5 h-5 ${isLiked(current.id) ? 'fill-current' : ''}`} />
              </button>

              <button onClick={toggle} tabIndex={0} data-tv-focusable className="btn-sauti w-11 h-11 rounded-full flex items-center justify-center shrink-0" aria-label={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              <button onClick={next} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-300 hover:text-white shrink-0" aria-label="Next"><SkipForward className="w-5 h-5 fill-current" /></button>
              <button onClick={stop} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-400 shrink-0" aria-label="Stop music"><X className="w-5 h-5" /></button>
            </div>
          </div>
        </div>
      )}

      <EqualizerPanel open={showEq} onClose={() => setShowEq(false)} />
    </>
  );
}
