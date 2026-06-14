import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { Search, Play, Pause, Heart, Loader2, Music2, ListMusic } from 'lucide-react';
import { audius, Track, Playlist, GENRES } from '../services/audius';
import { useMusic } from '../hooks/useMusic';

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

// Three animated bars to mark the now-playing row.
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
      tabIndex={0}
      data-tv-focusable
      role="button"
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
      <button
        onClick={(e) => { e.stopPropagation(); toggleLike(track); }}
        className={`p-2 rounded-full transition-colors ${isLiked(track.id) ? 'text-amber-400' : 'text-zinc-500 hover:text-white'}`}
        aria-label="Like"
      >
        <Heart className={`w-4 h-4 ${isLiked(track.id) ? 'fill-current' : ''}`} />
      </button>
      <span className="text-xs text-zinc-500 tabular w-10 text-right">{fmt(track.duration)}</span>
    </div>
  );
}

export default function MusicView() {
  const { playQueue, likedTracks } = useMusic();
  const [genre, setGenre] = useState<string>('All');
  const [trending, setTrending] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [underground, setUnderground] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchTracks, setSearchTracks] = useState<Track[]>([]);

  const loadFeed = useCallback(async (g: string) => {
    setLoading(true);
    const [tr, pl, ug] = await Promise.all([
      audius.trending(g === 'All' ? undefined : g),
      audius.trendingPlaylists(),
      audius.underground(),
    ]);
    setTrending(tr);
    setPlaylists(pl);
    setUnderground(ug);
    setLoading(false);
  }, []);

  useEffect(() => { loadFeed(genre); }, [genre, loadFeed]);

  // Debounced search
  const tRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const q = query.trim();
    window.clearTimeout(tRef.current);
    if (!q) { setSearching(false); setSearchTracks([]); return; }
    setSearching(true);
    tRef.current = window.setTimeout(async () => {
      const tr = await audius.searchTracks(q);
      setSearchTracks(tr);
      setSearching(false);
    }, 350);
    return () => window.clearTimeout(tRef.current);
  }, [query]);

  const openPlaylist = async (p: Playlist) => {
    const tracks = await audius.playlistTracks(p.id);
    if (tracks.length) playQueue(tracks, 0);
  };

  return (
    <div className="pt-24 px-4 md:px-12 pb-40 max-w-7xl mx-auto min-h-screen">
      <div className="overline mb-1.5">Sahrae Sound</div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20"><Music2 className="w-6 h-6 text-white" /></div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Music</h2>
          <p className="text-sm text-zinc-400">Full tracks · trending · playlists · underground</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-lg">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tracks, artists…"
          className="w-full bg-zinc-900/70 border border-white/10 rounded-full pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/60"
        />
      </div>

      {query.trim() ? (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
            <h3 className="text-xl font-display font-bold text-white tracking-tight">Results</h3>
          </div>
          {searching ? (
            <div className="flex items-center gap-2 text-zinc-400 py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Searching…</div>
          ) : searchTracks.length === 0 ? (
            <p className="text-zinc-500 py-8">No tracks found for “{query}”.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {searchTracks.map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(searchTracks, i)} /></Fragment>)}
            </div>
          )}
        </section>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-zinc-400"><Loader2 className="w-9 h-9 animate-spin text-amber-500" /><span>Loading Sahrae Sound…</span></div>
      ) : (
        <>
          {/* Genre / mood chips */}
          <div className="flex overflow-x-auto gap-2 pb-2 mb-8 scrollbar-hide">
            {['All', ...GENRES].map((g) => (
              <button key={g} onClick={() => setGenre(g)} tabIndex={0} data-tv-focusable
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${genre === g ? 'bg-white text-zinc-950 shadow-md' : 'chip text-zinc-300 hover:text-white'}`}>
                {g}
              </button>
            ))}
          </div>

          {/* Liked shortcut */}
          {likedTracks.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
                <h3 className="text-xl font-display font-bold text-white tracking-tight">Your Likes</h3>
                <span className="text-xs text-zinc-500 tabular">{likedTracks.length}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {likedTracks.slice(0, 6).map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(likedTracks, i)} /></Fragment>)}
              </div>
            </section>
          )}

          {/* Trending playlists */}
          {playlists.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
                <h3 className="text-xl font-display font-bold text-white tracking-tight">Trending Playlists</h3>
              </div>
              <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                {playlists.slice(0, 14).map((p) => (
                  <div key={p.id} onClick={() => openPlaylist(p)} tabIndex={0} data-tv-focusable role="button" aria-label={p.name}
                    className="card-lift group relative flex-none w-[150px] rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 cursor-pointer focus:outline-none">
                    <div className="aspect-square bg-zinc-800 relative">
                      {p.artwork ? <img src={p.artwork} alt="" className="w-full h-full object-cover" loading="lazy" /> : <ListMusic className="w-8 h-8 text-zinc-600 absolute inset-0 m-auto" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
                        <span className="btn-gold w-9 h-9 rounded-full flex items-center justify-center"><Play className="w-4 h-4 fill-current ml-0.5" /></span>
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{p.owner || 'Audius'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Trending tracks */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
              <h3 className="text-xl font-display font-bold text-white tracking-tight">Trending{genre !== 'All' ? ` · ${genre}` : ''}</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {trending.map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(trending, i)} /></Fragment>)}
            </div>
          </section>

          {/* Underground */}
          {underground.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
                <h3 className="text-xl font-display font-bold text-white tracking-tight">Underground</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {underground.slice(0, 12).map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(underground, i)} /></Fragment>)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
