import { Play, Pause, SkipForward, SkipBack, ChevronDown, Heart, Shuffle, Repeat, Repeat1, Music2, Plus } from 'lucide-react';
import { useMusic } from '../hooks/useMusic';

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

export default function MusicPlayer() {
  const {
    current, isPlaying, position, duration, shuffle, repeat, expanded, active,
    toggle, next, prev, seek, toggleShuffle, cycleRepeat, toggleLike, isLiked, setExpanded, openAddSheet,
  } = useMusic();

  if (!current || !active) return null;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <>
      {/* ── Full-screen "vinyl" now-playing ── */}
      {expanded && (
        <div role="dialog" data-tv-layer className="fixed inset-0 z-[120] overflow-hidden animate-in fade-in duration-300">
          {/* Ambient blurred-art backdrop */}
          <div className="absolute inset-0 -z-10">
            {current.artworkLarge && <img src={current.artworkLarge} alt="" className="w-full h-full object-cover scale-150 blur-3xl opacity-50" />}
            <div className="absolute inset-0 bg-zinc-950/80" />
          </div>

          <div className="h-full flex flex-col px-5 md:px-8 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] max-w-xl mx-auto">
            {/* Top bar */}
            <div className="flex items-center justify-between">
              <button onClick={() => setExpanded(false)} tabIndex={0} data-tv-focusable className="w-11 h-11 rounded-full glass flex items-center justify-center text-white" aria-label="Collapse">
                <ChevronDown className="w-6 h-6" />
              </button>
              <span className="overline">Now Playing</span>
              <div className="flex items-center gap-2">
                <button onClick={() => openAddSheet(current)} tabIndex={0} data-tv-focusable className="w-11 h-11 rounded-full glass flex items-center justify-center text-white" aria-label="Add to playlist">
                  <Plus className="w-5 h-5" />
                </button>
                <button onClick={() => toggleLike(current)} tabIndex={0} data-tv-focusable className={`w-11 h-11 rounded-full glass flex items-center justify-center ${isLiked(current.id) ? 'text-amber-400' : 'text-white'}`} aria-label="Like">
                  <Heart className={`w-5 h-5 ${isLiked(current.id) ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>

            {/* Spinning vinyl */}
            <div className="flex-1 flex items-center justify-center py-6">
              <div
                className="relative w-[68vw] max-w-[340px] aspect-square rounded-full overflow-hidden border-2 border-amber-400/30 shadow-[0_0_60px_rgba(245,158,11,0.18)]"
                style={{ animation: 'vinyl-spin 18s linear infinite', animationPlayState: isPlaying ? 'running' : 'paused' }}
              >
                {current.artworkLarge ? (
                  <img src={current.artworkLarge} alt={current.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center"><Music2 className="w-16 h-16 text-zinc-600" /></div>
                )}
                {/* vinyl centre */}
                <div className="absolute inset-0 m-auto w-[18%] h-[18%] rounded-full bg-zinc-950 border border-white/10" />
                <div className="absolute inset-0 m-auto w-[5%] h-[5%] rounded-full bg-amber-400/70" />
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-5 px-2">
              <h2 className="text-2xl font-display font-bold text-white truncate">{current.title}</h2>
              <p className="text-zinc-400 truncate">{current.artist}</p>
            </div>

            {/* Scrubber */}
            <div className="mb-5">
              <input
                type="range" min={0} max={duration || 0} value={position} step={1}
                onChange={(e) => seek(Number(e.target.value))}
                style={{ accentColor: '#f59e0b' }}
                className="w-full h-1.5 cursor-pointer"
                aria-label="Seek"
              />
              <div className="flex justify-between text-[11px] text-zinc-400 tabular mt-1">
                <span>{fmt(position)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            {/* Transport */}
            <div className="flex items-center justify-between">
              <button onClick={toggleShuffle} tabIndex={0} data-tv-focusable className={`w-11 h-11 flex items-center justify-center rounded-full ${shuffle ? 'text-amber-400' : 'text-zinc-400 hover:text-white'}`} aria-label="Shuffle"><Shuffle className="w-5 h-5" /></button>
              <button onClick={prev} tabIndex={0} data-tv-focusable className="w-12 h-12 flex items-center justify-center text-white" aria-label="Previous"><SkipBack className="w-7 h-7 fill-current" /></button>
              <button onClick={toggle} tabIndex={0} data-tv-focusable className="btn-gold w-16 h-16 rounded-full flex items-center justify-center" aria-label={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
              </button>
              <button onClick={next} tabIndex={0} data-tv-focusable className="w-12 h-12 flex items-center justify-center text-white" aria-label="Next"><SkipForward className="w-7 h-7 fill-current" /></button>
              <button onClick={cycleRepeat} tabIndex={0} data-tv-focusable className={`w-11 h-11 flex items-center justify-center rounded-full ${repeat !== 'off' ? 'text-amber-400' : 'text-zinc-400 hover:text-white'}`} aria-label="Repeat">
                {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Persistent mini-bar ── */}
      {!expanded && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pointer-events-none">
          <div className="pointer-events-auto max-w-3xl mx-auto glass rounded-2xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.45)] overflow-hidden">
            {/* progress hairline */}
            <div className="h-0.5 bg-white/10"><div className="h-full bg-gradient-to-r from-amber-300 to-amber-500 transition-[width] duration-200" style={{ width: `${pct}%` }} /></div>
            <div className="flex items-center gap-3 p-2 pr-3">
              <button onClick={() => setExpanded(true)} className="flex items-center gap-3 min-w-0 flex-1 text-left" aria-label="Open player">
                <div className="w-11 h-11 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                  {current.artwork ? <img src={current.artwork} alt="" className="w-full h-full object-cover" /> : <Music2 className="w-5 h-5 text-zinc-600 absolute m-auto" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{current.title}</p>
                  <p className="text-xs text-zinc-400 truncate">{current.artist}</p>
                </div>
              </button>
              <button onClick={toggle} tabIndex={0} data-tv-focusable className="btn-gold w-11 h-11 rounded-full flex items-center justify-center shrink-0" aria-label={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              <button onClick={next} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-300 hover:text-white shrink-0" aria-label="Next"><SkipForward className="w-5 h-5 fill-current" /></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
