import { useState, useEffect, useRef, Fragment, ReactNode } from 'react';
import { Search, Play, Pause, Heart, Loader2, Music2, Plus, X, ListMusic, Shuffle, Trash2, ChevronLeft, Library } from 'lucide-react';
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

function TrackRow({ track, onPlay, onRemove }: { track: Track; onPlay: () => void; onRemove?: () => void }) {
  const { current, isPlaying, toggle, toggleLike, isLiked, openAddSheet } = useMusic();
  const active = current?.id === track.id;
  return (
    <div tabIndex={0} data-tv-focusable role="button" onClick={() => (active ? toggle() : onPlay())}
      className="card-lift group flex items-center gap-3 p-2 pr-2 rounded-xl border border-white/5 bg-zinc-900/40 cursor-pointer focus:outline-none">
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
      {onRemove ? (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-2 rounded-full text-zinc-500 hover:text-red-400" aria-label="Remove"><X className="w-4 h-4" /></button>
      ) : (
        <button onClick={(e) => { e.stopPropagation(); openAddSheet(track); }} className="p-2 rounded-full text-zinc-500 hover:text-white" aria-label="Add to playlist"><Plus className="w-4 h-4" /></button>
      )}
    </div>
  );
}

function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const { current, isPlaying, openAddSheet } = useMusic();
  const active = current?.id === track.id;
  return (
    <div tabIndex={0} data-tv-focusable role="button" onClick={onPlay}
      className="card-lift group relative flex-none w-[150px] rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 cursor-pointer focus:outline-none">
      <div className="aspect-square bg-zinc-800 relative">
        {track.artwork ? <img src={track.artwork} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Music2 className="w-8 h-8 text-zinc-600 absolute inset-0 m-auto" />}
        <button onClick={(e) => { e.stopPropagation(); openAddSheet(track); }} className="absolute top-2 left-2 z-10 w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Add to playlist"><Plus className="w-4 h-4" /></button>
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

const SectionHead = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
    <h3 className="text-xl font-display font-bold text-white tracking-tight">{children}</h3>
  </div>
);

export default function MusicView() {
  const {
    playQueue, likedTracks, playlists, recentlyPlayed,
    createPlaylist, deletePlaylist, removeFromPlaylist,
  } = useMusic();

  const [tab, setTab] = useState<'home' | 'library'>('home');
  const [sections, setSections] = useState<{ title: string; tracks: Track[] }[]>([]);
  const [loadingHome, setLoadingHome] = useState(true);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const tRef = useRef<number | undefined>(undefined);

  // Library local state
  const [openId, setOpenId] = useState<string | null>(null); // 'liked' or a playlist id
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

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

  const openList = openId === 'liked' ? { name: 'Liked Songs', tracks: likedTracks, id: 'liked' }
    : playlists.find((p) => p.id === openId) || null;

  return (
    <div className="pt-24 px-4 md:px-12 pb-40 max-w-7xl mx-auto min-h-screen">
      <div className="overline mb-1.5">Sahrae Sound · YouTube Music</div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20"><Music2 className="w-6 h-6 text-white" /></div>
          <div>
            <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Music</h2>
            <p className="text-sm text-zinc-400">Full songs from across YouTube Music</p>
          </div>
        </div>
        <div className="flex gap-1 bg-zinc-900/70 p-1 rounded-xl border border-white/5 self-start">
          {(['home', 'library'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setOpenId(null); }} tabIndex={0} data-tv-focusable
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${tab === t ? 'bg-amber-500 text-amber-950' : 'text-zinc-400 hover:text-white'}`}>
              {t === 'home' ? <><Music2 className="w-4 h-4" /> Home</> : <><Library className="w-4 h-4" /> Library</>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'home' ? (
        <>
          <div className="relative mb-5 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any song, artist…"
              className="w-full bg-zinc-900/70 border border-white/10 rounded-full pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/60" />
          </div>

          {!query.trim() && (
            <div className="flex overflow-x-auto gap-2 pb-2 mb-8 scrollbar-hide">
              {GENRES.map((g) => (
                <button key={g} onClick={() => setQuery(g)} tabIndex={0} data-tv-focusable className="chip px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap text-zinc-300 hover:text-white">{g}</button>
              ))}
            </div>
          )}

          {query.trim() ? (
            <section>
              <SectionHead>Results</SectionHead>
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
              {sections.map((sec) => (
                <section key={sec.title} className="mb-10">
                  <SectionHead>{sec.title}</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                    {sec.tracks.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(sec.tracks, i)} /></Fragment>)}
                  </div>
                </section>
              ))}
              {loadingHome && sections.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-zinc-400"><Loader2 className="w-9 h-9 animate-spin text-amber-500" /><span>Loading Sahrae Sound…</span></div>
              )}
              {!loadingHome && sections.length === 0 && (
                <p className="text-zinc-500 py-10 text-center">Couldn't reach the music service right now. Try a search, or again shortly.</p>
              )}
            </>
          )}
        </>
      ) : openList ? (
        /* ── Playlist / Liked detail ── */
        <section>
          <button onClick={() => setOpenId(null)} className="flex items-center gap-1 text-zinc-400 hover:text-white mb-4 text-sm"><ChevronLeft className="w-4 h-4" /> Library</button>
          <div className="flex items-end gap-4 mb-6">
            <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shadow-xl shrink-0">
              {openList.id === 'liked' ? <Heart className="w-12 h-12 text-white fill-current" /> : <ListMusic className="w-12 h-12 text-white" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-3xl font-display font-bold text-white truncate">{openList.name}</h3>
              <p className="text-sm text-zinc-400 tabular">{openList.tracks.length} songs</p>
              <div className="flex gap-2 mt-3">
                <button disabled={!openList.tracks.length} onClick={() => playQueue(openList.tracks, 0)} className="btn-gold px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 disabled:opacity-40"><Play className="w-4 h-4 fill-current" /> Play</button>
                <button disabled={!openList.tracks.length} onClick={() => { const arr = [...openList.tracks].sort(() => Math.random() - 0.5); playQueue(arr, 0); }} className="btn-glass px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 disabled:opacity-40"><Shuffle className="w-4 h-4" /> Shuffle</button>
                {openList.id !== 'liked' && (
                  <button onClick={() => { deletePlaylist(openList.id); setOpenId(null); }} className="px-4 py-2 rounded-full text-sm font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          </div>
          {openList.tracks.length === 0 ? (
            <p className="text-zinc-500 py-8">No songs yet. Tap the + on any song to add it here.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {openList.tracks.map((t, i) => (
                <Fragment key={t.id}>
                  <TrackRow track={t} onPlay={() => playQueue(openList.tracks, i)} onRemove={openList.id !== 'liked' ? () => removeFromPlaylist(openList.id, t.id) : undefined} />
                </Fragment>
              ))}
            </div>
          )}
        </section>
      ) : (
        /* ── Library home ── */
        <>
          {/* Liked + create */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
            <button onClick={() => setOpenId('liked')} tabIndex={0} data-tv-focusable className="card-lift flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-rose-600/20 border border-amber-500/20 text-left">
              <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shrink-0"><Heart className="w-6 h-6 text-white fill-current" /></span>
              <span><span className="block font-bold text-white">Liked Songs</span><span className="block text-xs text-zinc-300 tabular">{likedTracks.length} songs</span></span>
            </button>
            {creating ? (
              <div className="flex items-center gap-2 p-2 rounded-2xl bg-zinc-900/60 border border-white/10 col-span-2 sm:col-span-1">
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { createPlaylist(newName); setNewName(''); setCreating(false); } }} placeholder="Playlist name" className="flex-1 min-w-0 bg-transparent px-2 text-sm text-white focus:outline-none" />
                <button onClick={() => { if (newName.trim()) { createPlaylist(newName); setNewName(''); setCreating(false); } }} className="btn-gold px-3 py-2 rounded-lg text-xs font-bold shrink-0">Add</button>
              </div>
            ) : (
              <button onClick={() => setCreating(true)} tabIndex={0} data-tv-focusable className="card-lift flex items-center gap-3 p-4 rounded-2xl bg-zinc-900/50 border border-white/10 text-left">
                <span className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Plus className="w-6 h-6 text-amber-400" /></span>
                <span className="font-bold text-white">New playlist</span>
              </button>
            )}
          </div>

          {/* Recently played */}
          {recentlyPlayed.length > 0 && (
            <section className="mb-10">
              <SectionHead>Recently Played</SectionHead>
              <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                {recentlyPlayed.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(recentlyPlayed, i)} /></Fragment>)}
              </div>
            </section>
          )}

          {/* Playlists */}
          <section>
            <SectionHead>Your Playlists</SectionHead>
            {playlists.length === 0 ? (
              <p className="text-zinc-500 py-6">No playlists yet. Create one above, or tap + on any song.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {playlists.map((p) => (
                  <button key={p.id} onClick={() => setOpenId(p.id)} tabIndex={0} data-tv-focusable className="card-lift text-left rounded-2xl overflow-hidden border border-white/10 bg-zinc-900">
                    <div className="aspect-square bg-gradient-to-br from-zinc-700 to-zinc-900 relative flex items-center justify-center">
                      {p.tracks[0]?.artwork ? <img src={p.tracks[0].artwork} alt="" className="w-full h-full object-cover" /> : <ListMusic className="w-10 h-10 text-zinc-500" />}
                    </div>
                    <div className="p-2.5"><p className="text-sm font-semibold text-white truncate">{p.name}</p><p className="text-xs text-zinc-500 tabular">{p.tracks.length} songs</p></div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
