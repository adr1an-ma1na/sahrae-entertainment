import { useState, useEffect, useRef, Fragment } from 'react';
import { Search, Play, Pause, Heart, Loader2, Music2 } from 'lucide-react';
import { ytmusic, Track, GENRES, SECTIONS } from '../services/ytmusic';
import { useMusic } from '../hooks/useMusic';

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

function Equalizer() {
  return (
    <div className="flex items-end gap-0.5 h-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-0.5 bg-amber-400 rounded-full animate-[eq_0.9s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

function TrackRow({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const { current, isPlaying, toggle, toggleLike, isLiked } = useMusic();
  const active = current?.id === track.id;
  return (
    <div
      tabIndex={0} data-tv-focusable role="button"
      onClick={() => (active ? toggle() : onPlay())}
      className="card-lift group flex items-center gap-3 p-2 pr-3 rounded-xl border border-white/5 bg-zinc-900/40 cursor-pointer focus:outline-none"
    >
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
        {track.artwork ? <img src={track.artwork} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Music2 className="w-5 h-5 text-zinc-600 absolute inset-0 m-auto" />}
        <div className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {active && isPlaying ? <Pause className="w-5 h-5 text-white fill-current" /> : <Play className="w-5 h-5 text-white fill-current ml-0.5" />}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold truncate ${active ? 'text-amber-400' : 'text-white'}`}>{track.title}</p>
        <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
      </div>
      {active && isPlaying && <Equalizer />}
      <button onClick={(e) => { e.stopPropagation(); toggleLike(track); }} className={`p-2 rounded-full transition-colors ${isLiked(track.id) ? 'text-amber-400' : 'text-zinc-500 hover:text-white'}`} aria-label="Like">
        <Heart className={`w-4 h-4 ${isLiked(track.id) ? 'fill-current' : ''}`} />
      </button>
      <span className="text-xs text-zinc-500 tabular w-10 text-right">{fmt(track.duration)}</span>
    </div>
  );
}

function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const { current, isPlaying } = useMusic();
  const active = current?.id === track.id;
  return (
    <div
      tabIndex={0} data-tv-focusable role="button" onClick={onPlay}
      className="card-lift group relative flex-none w-[150px] rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 cursor-pointer focus:outline-none"
    >
      <div className="aspect-square bg-zinc-800 relative">
        {track.artwork ? <img src={track.artwork} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Music2 className="w-8 h-8 text-zinc-600 absolute inset-0 m-auto" />}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 to-transparent transition-opacity flex items-end justify-end p-2 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <span className="btn-gold w-9 h-9 rounded-full flex items-center justify-center">{active && isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}</span>
        </div>
      </div>
      <div className="p-2.5">
        <p className={`text-sm font-semibold truncate ${active ? 'text-amber-400' : 'text-white'}`}>{track.title}</p>
        <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
      </div>
    </div>
  );
}

export default function MusicView() {
  const { playQueue, likedTracks } = useMusic();
  const [sections, setSections] = useState<{ title: string; tracks: Track[] }[]>([]);
  const [loadingHome, setLoadingHome] = useState(true);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const tRef = useRef<number | undefined>(undefined);

  // Progressive home: each shelf appears as it resolves.
  useEffect(() => {
    let cancelled = false;
    setSections([]); setLoadingHome(true);
    (async () => {
      for (const s of SECTIONS) {
        const tracks = await ytmusic.search(s.q);
        if (cancelled) return;
        if (tracks.length) setSections((prev) => [...prev, { title: s.title, tracks }]);
        setLoadingHome(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    window.clearTimeout(tRef.current);
    if (!q) { setSearching(false); setResults([]); return; }
    setSearching(true);
    tRef.current = window.setTimeout(async () => {
      const tr = await ytmusic.search(q);
      setResults(tr);
      setSearching(false);
    }, 400);
    return () => window.clearTimeout(tRef.current);
  }, [query]);

  return (
    <div className="pt-24 px-4 md:px-12 pb-40 max-w-7xl mx-auto min-h-screen">
      <div className="overline mb-1.5">Sahrae Sound · YouTube Music</div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20"><Music2 className="w-6 h-6 text-white" /></div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Music</h2>
          <p className="text-sm text-zinc-400">Full songs from across YouTube Music</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-lg">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any song, artist…"
          className="w-full bg-zinc-900/70 border border-white/10 rounded-full pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/60" />
      </div>

      {/* Genre quick-search chips */}
      {!query.trim() && (
        <div className="flex overflow-x-auto gap-2 pb-2 mb-8 scrollbar-hide">
          {GENRES.map((g) => (
            <button key={g} onClick={() => setQuery(g)} tabIndex={0} data-tv-focusable
              className="chip px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap text-zinc-300 hover:text-white">{g}</button>
          ))}
        </div>
      )}

      {query.trim() ? (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
            <h3 className="text-xl font-display font-bold text-white tracking-tight">Results</h3>
          </div>
          {searching ? (
            <div className="flex items-center gap-2 text-zinc-400 py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Searching YouTube Music…</div>
          ) : results.length === 0 ? (
            <p className="text-zinc-500 py-8">No songs found for “{query}”.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {results.map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(results, i)} /></Fragment>)}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Liked */}
          {likedTracks.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
                <h3 className="text-xl font-display font-bold text-white tracking-tight">Your Likes</h3>
                <span className="text-xs text-zinc-500 tabular">{likedTracks.length}</span>
              </div>
              <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                {likedTracks.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(likedTracks, i)} /></Fragment>)}
              </div>
            </section>
          )}

          {/* Home shelves */}
          {sections.map((sec) => (
            <section key={sec.title} className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
                <h3 className="text-xl font-display font-bold text-white tracking-tight">{sec.title}</h3>
              </div>
              <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                {sec.tracks.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(sec.tracks, i)} /></Fragment>)}
              </div>
            </section>
          ))}

          {loadingHome && sections.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-zinc-400"><Loader2 className="w-9 h-9 animate-spin text-amber-500" /><span>Loading Sahrae Sound…</span></div>
          )}
          {!loadingHome && sections.length === 0 && (
            <p className="text-zinc-500 py-10 text-center">Couldn't reach the music service right now. Pull a search, or try again shortly.</p>
          )}
        </>
      )}
    </div>
  );
}
