import { useState, useEffect, useRef } from 'react';
import { Search, Headphones, Video, X, Loader2, Heart, Play } from 'lucide-react';
import { ytmusic, Track } from '../services/ytmusic';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import { getFollows, isFollowed, toggleFollow, getContinue, PodProgress } from '../services/podcasts';

const CATEGORIES = ['Top', 'News', 'Comedy', 'Business', 'Technology', 'True Crime', 'Sports', 'Health', 'Education'];
const catQuery = (c: string) => (c === 'Top' ? 'top podcasts 2026' : `${c} podcast`);
const fmt = (s: number) => { if (!s || !isFinite(s)) return ''; const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };

export default function PodcastsHome() {
  const { playQueue, stop, seek } = useMusic();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [shelves, setShelves] = useState<{ title: string; items: Track[] }[]>([]);
  const [loadingHome, setLoadingHome] = useState(true);
  const [follows, setFollows] = useState<Track[]>(() => getFollows());
  const [cont, setCont] = useState<PodProgress[]>(() => getContinue());
  const [watch, setWatch] = useState<Track | null>(null);
  const tRef = useRef<number | undefined>(undefined);

  // Refresh "continue" whenever we return to this screen.
  useEffect(() => { setCont(getContinue()); }, []);

  // Curated category shelves — sequential (throttled), so it never starves playback.
  useEffect(() => {
    let cancelled = false; setLoadingHome(true);
    (async () => {
      for (const c of CATEGORIES) {
        const items = await ytmusic.searchVideos(catQuery(c)).catch(() => [] as Track[]);
        if (cancelled) return;
        if (items.length) setShelves((prev) => [...prev, { title: c, items: items.slice(0, 12) }]);
        setLoadingHome(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    window.clearTimeout(tRef.current);
    if (!q) { setSearching(false); setResults([]); return; }
    setSearching(true);
    tRef.current = window.setTimeout(async () => {
      const r = await ytmusic.searchVideos(`${q} podcast`).catch(() => [] as Track[]);
      setResults(r); setSearching(false);
    }, 400);
    return () => window.clearTimeout(tRef.current);
  }, [query]);

  const onFollow = (t: Track) => setFollows(toggleFollow(t));
  const onWatch = (t: Track) => { stop(); setWatch(t); };
  const onListen = (t: Track) => playQueue([t], 0, 'Podcasts');
  const resume = (p: PodProgress) => { playQueue([p.track], 0, 'Podcasts'); window.setTimeout(() => { try { seek(p.position); } catch { /* ignore */ } }, 2800); };

  const card = (t: Track) => (
    <div key={t.id} className="card-lift tier-card rounded-2xl p-3 group flex flex-col w-[200px] shrink-0">
      <div className="aspect-square rounded-xl overflow-hidden mb-3 relative bg-zinc-800">
        <CoverArt imageUrl={t.artworkLarge || t.artwork} dominantColor={t.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
        <button onClick={() => onWatch(t)} className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Watch"><span className="btn-sauti px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1"><Video className="w-4 h-4" /> Watch</span></button>
        <button onClick={() => onFollow(t)} className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm ${isFollowed(t.id) ? 'bg-sauti text-amber-950' : 'bg-black/55 text-white'}`} aria-label="Follow"><Heart className={`w-4 h-4 ${isFollowed(t.id) ? 'fill-current' : ''}`} /></button>
      </div>
      <h3 className="text-sm font-bold text-white line-clamp-2 mb-0.5">{t.title}</h3>
      <p className="text-xs text-zinc-500 truncate mb-3">{t.artist}{t.duration ? ` · ${fmt(t.duration)}` : ''}</p>
      <div className="flex gap-2 mt-auto">
        <button onClick={() => onListen(t)} className="btn-sauti flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"><Headphones className="w-4 h-4" /> Listen</button>
        <button onClick={() => onWatch(t)} className="btn-glass px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5"><Video className="w-4 h-4" /> Watch</button>
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Search */}
      <div className="relative mb-6 max-w-lg">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search podcasts & episodes…" className="w-full bg-zinc-900/70 border border-white/10 rounded-full pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/60" />
      </div>

      {query.trim() ? (
        searching ? (
          <div className="flex items-center gap-2 text-zinc-400 py-10"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Searching…</div>
        ) : results.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{results.map(card)}</div>
        ) : <p className="text-zinc-500 py-10 text-center">No podcasts found.</p>
      ) : (
        <>
          {/* Continue listening */}
          {cont.length > 0 && (
            <section className="mb-9">
              <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4">Continue listening</h3>
              <div className="flex overflow-x-auto gap-3 pb-3 scrollbar-hide">
                {cont.map((p) => (
                  <button key={p.track.id} onClick={() => resume(p)} tabIndex={0} data-tv-focusable className="card-lift tier-card rounded-xl p-3 flex items-center gap-3 w-[300px] shrink-0 text-left">
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative"><CoverArt imageUrl={p.track.artwork} dominantColor={p.track.dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{p.track.title}</p>
                      <p className="text-xs text-zinc-500 truncate mb-1.5">{p.track.artist}</p>
                      <div className="h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-sauti" style={{ width: `${p.duration ? Math.min(100, (p.position / p.duration) * 100) : 10}%` }} /></div>
                    </div>
                    <span className="btn-sauti w-9 h-9 rounded-full flex items-center justify-center shrink-0"><Play className="w-4 h-4 fill-current ml-0.5" /></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Your shows */}
          {follows.length > 0 && (
            <section className="mb-9">
              <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4">Your shows</h3>
              <div className="flex overflow-x-auto gap-4 pb-3 scrollbar-hide">{follows.map(card)}</div>
            </section>
          )}

          {/* Curated category shelves */}
          {shelves.map((s) => (
            <section key={s.title} className="mb-9">
              <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4">{s.title}</h3>
              <div className="flex overflow-x-auto gap-4 pb-3 scrollbar-hide">{s.items.map(card)}</div>
            </section>
          ))}
          {loadingHome && shelves.length === 0 && <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-zinc-400"><Loader2 className="w-9 h-9 animate-spin text-amber-500" /><span>Loading podcasts…</span></div>}
        </>
      )}

      {/* Video player */}
      {watch && (
        <div role="dialog" data-tv-layer className="dark fixed inset-0 z-[140] bg-black flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2.5 glass">
            <p className="text-white font-bold text-sm truncate flex-1">{watch.title}</p>
            <button onClick={() => setWatch(null)} data-tv-close tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full glass-liquid flex items-center justify-center text-white shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
          <iframe src={`https://www.youtube.com/embed/${watch.id}?autoplay=1&playsinline=1`} title="Podcast" className="flex-1 w-full bg-black border-0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      )}
    </div>
  );
}
