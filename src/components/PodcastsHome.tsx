import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Heart, Play, ChevronLeft, Check, Circle, Video, X } from 'lucide-react';
import { Track, ytmusic } from '../services/ytmusic';
import { searchPodcastShows, getPodcastEpisodes, PodShow } from '../services/podcastRss';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import { getFollows, isFollowed, toggleFollow, listInProgress, getProgress, getMany, markPlayed, markUnplayed, EpisodeProgress } from '../services/podcasts';

const CATEGORIES = ['Top', 'News', 'Comedy', 'Business', 'Technology', 'True Crime', 'Sports', 'Health', 'Education'];
const catQuery = (c: string) => (c === 'Top' ? 'podcasts' : c);
const fmt = (s: number) => { if (!s || !isFinite(s)) return ''; const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };

// A podcast SHOW is carried as a Track (so it reuses follows/cards), with feedUrl set.
const showToTrack = (s: PodShow): Track => ({ id: s.id, title: s.title, artist: s.author, artwork: s.artwork, artworkLarge: s.artwork, duration: 0, feedUrl: s.feedUrl });

export default function PodcastsHome() {
  const { playQueue, seek, stop } = useMusic();
  const [query, setQuery] = useState('');
  // Watch an episode on YouTube (searched on demand).
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [watchTitle, setWatchTitle] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [shelves, setShelves] = useState<{ title: string; items: Track[] }[]>([]);
  const [loadingHome, setLoadingHome] = useState(true);
  const [follows, setFollows] = useState<Track[]>(() => getFollows());
  const [cont, setCont] = useState<EpisodeProgress[]>(() => listInProgress());
  const [progV, setProgV] = useState(0); // bump to re-read progress badges
  const [showView, setShowView] = useState<Track | null>(null);
  const [showEpisodes, setShowEpisodes] = useState<Track[]>([]);
  const [showLoading, setShowLoading] = useState(false);
  const [epSort, setEpSort] = useState<'new' | 'old'>('new');
  const tRef = useRef<number | undefined>(undefined);

  // Refresh "continue" whenever we return to this screen / progress changes.
  useEffect(() => { setCont(listInProgress()); }, [progV]);

  // Curated category shelves — sequential so it never floods the network.
  useEffect(() => {
    let cancelled = false; setLoadingHome(true);
    (async () => {
      for (const c of CATEGORIES) {
        const shows = await searchPodcastShows(catQuery(c), 12).catch(() => [] as PodShow[]);
        if (cancelled) return;
        if (shows.length) setShelves((prev) => [...prev, { title: c, items: shows.map(showToTrack) }]);
        setLoadingHome(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced search (shows).
  useEffect(() => {
    const q = query.trim();
    window.clearTimeout(tRef.current);
    if (!q) { setSearching(false); setResults([]); return; }
    setSearching(true);
    tRef.current = window.setTimeout(async () => {
      const shows = await searchPodcastShows(q).catch(() => [] as PodShow[]);
      setResults(shows.map(showToTrack)); setSearching(false);
    }, 400);
    return () => window.clearTimeout(tRef.current);
  }, [query]);

  // Show page — load the feed's episodes (real MP3s). Old follows without a feed
  // are looked up by name first.
  useEffect(() => {
    if (!showView) return;
    let cancelled = false; setShowLoading(true); setShowEpisodes([]);
    (async () => {
      let feed = showView.feedUrl;
      if (!feed) {
        const found = await searchPodcastShows(showView.title || showView.artist, 1).catch(() => [] as PodShow[]);
        feed = found[0]?.feedUrl;
      }
      if (!feed) { if (!cancelled) { setShowEpisodes([]); setShowLoading(false); } return; }
      const eps = await getPodcastEpisodes(feed, { title: showView.title, artwork: showView.artwork }).catch(() => [] as Track[]);
      if (!cancelled) { setShowEpisodes(eps); setShowLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [showView]);

  const onFollow = (t: Track) => setFollows(toggleFollow(t));
  const onListen = (t: Track) => {
    const pr = getProgress(t.id);
    playQueue([t], 0, 'Podcasts');
    if (pr && pr.state === 'in_progress' && pr.positionMs > 5000) {
      window.setTimeout(() => { try { seek(pr.positionMs / 1000); } catch { /* ignore */ } }, 1200);
    }
  };
  const resume = (p: EpisodeProgress) => { playQueue([p.track], 0, 'Podcasts'); window.setTimeout(() => { try { seek(p.positionMs / 1000); } catch { /* ignore */ } }, 1200); };
  const togglePlayed = (t: Track) => { if (getProgress(t.id)?.completed) markUnplayed(t.id); else markPlayed(t); setProgV((v) => v + 1); };

  // Watch the episode on YouTube — pause audio, find the video on demand, embed it.
  const onWatch = async (t: Track) => {
    stop();
    setWatchTitle(t.title); setWatchId(null); setWatchOpen(true);
    const q = `${t.artist} ${t.title}`.replace(/\s+/g, ' ').trim().slice(0, 110);
    const r = await ytmusic.searchVideos(q).catch(() => [] as Track[]);
    setWatchId(r[0]?.id || '');
  };

  // Show card (tap to open the show; heart to follow).
  const card = (t: Track) => (
    <div key={t.id} onClick={() => setShowView(t)} tabIndex={0} data-tv-focusable role="button"
      className="card-lift tier-card rounded-2xl p-3 group flex flex-col w-[170px] shrink-0 cursor-pointer focus:outline-none">
      <div className="aspect-square rounded-xl overflow-hidden mb-3 relative bg-zinc-800">
        <CoverArt imageUrl={t.artworkLarge || t.artwork} dominantColor={t.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
        <button onClick={(e) => { e.stopPropagation(); onFollow(t); }} className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm ${isFollowed(t.id) ? 'bg-sauti text-amber-950' : 'bg-black/55 text-white'}`} aria-label="Follow"><Heart className={`w-4 h-4 ${isFollowed(t.id) ? 'fill-current' : ''}`} /></button>
      </div>
      <h3 className="text-sm font-bold text-white line-clamp-2 mb-0.5 group-hover:text-sauti transition-colors">{t.title}</h3>
      <p className="text-xs text-zinc-500 truncate">{t.artist}</p>
    </div>
  );

  // Watch-on-YouTube modal (shared by the show page + home).
  const videoModal = watchOpen && (
    <div role="dialog" data-tv-layer className="dark fixed inset-0 z-[140] bg-black flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2.5 glass">
        <p className="text-white font-bold text-sm truncate flex-1">{watchTitle}</p>
        <button onClick={() => { setWatchOpen(false); setWatchId(null); }} data-tv-close tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full glass-liquid flex items-center justify-center text-white shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>
      {watchId === null ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-zinc-400"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /> Finding video…</div>
      ) : watchId ? (
        <iframe src={`https://www.youtube.com/embed/${watchId}?autoplay=1&playsinline=1`} title="Watch" className="flex-1 w-full bg-black border-0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-400 px-8 text-center">No video found for this episode on YouTube.</div>
      )}
    </div>
  );

  // ── Show page: a series' episodes, organised (Spotify-style) ──
  if (showView) {
    const hc = showView.dominantColor || 'rgba(245,158,11,0.4)';
    const sortedEps = [...showEpisodes].sort((a, b) => (epSort === 'new' ? (b.uploaded || 0) - (a.uploaded || 0) : (a.uploaded || 0) - (b.uploaded || 0)));
    const prog = getMany(showEpisodes.map((e) => e.id)); void progV;
    return (
      <div className="relative animate-in fade-in duration-300">
        <div aria-hidden className="absolute -inset-x-4 md:-inset-x-12 top-0 h-72 -z-10 pointer-events-none" style={{ background: `linear-gradient(180deg, ${hc} 0%, transparent 100%)`, opacity: 0.5 }} />
        <button onClick={() => setShowView(null)} className="flex items-center gap-1 text-zinc-400 hover:text-white mb-5 text-sm"><ChevronLeft className="w-4 h-4" /> Back</button>
        <div className="flex items-end gap-4 md:gap-5 mb-7">
          <div className="w-28 h-28 md:w-40 md:h-40 rounded-2xl overflow-hidden bg-zinc-800 shrink-0 shadow-xl relative">
            <CoverArt imageUrl={showView.artworkLarge || showView.artwork} dominantColor={showView.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
          </div>
          <div className="min-w-0">
            <div className="overline mb-1">Podcast</div>
            <h2 className="text-2xl md:text-4xl font-display font-bold text-white line-clamp-2">{showView.title || showView.artist}</h2>
            {showView.artist && showView.artist !== showView.title && <p className="text-sm text-zinc-400 mt-1 truncate">{showView.artist}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => sortedEps[0] && onListen(sortedEps[0])} className="btn-sauti px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Play className="w-4 h-4 fill-current" /> Play</button>
              <button onClick={() => onFollow(showView)} className="btn-glass px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Heart className={`w-4 h-4 ${isFollowed(showView.id) ? 'fill-current' : ''}`} /> {isFollowed(showView.id) ? 'Following' : 'Follow'}</button>
            </div>
          </div>
        </div>

        {showLoading ? (
          <div className="flex items-center gap-2 text-zinc-400 py-10"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Loading episodes…</div>
        ) : showEpisodes.length === 0 ? (
          <p className="text-zinc-500 py-10 text-center">No episodes found for this show.</p>
        ) : (
          <div className="space-y-2 pb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500 tabular">{showEpisodes.length} episodes</span>
              <div className="flex gap-1 glass p-1 rounded-lg">
                {(['new', 'old'] as const).map((s) => (
                  <button key={s} onClick={() => setEpSort(s)} className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${epSort === s ? 'bg-sauti text-amber-950' : 'text-zinc-400 hover:text-white'}`}>{s === 'new' ? 'Newest' : 'Oldest'}</button>
                ))}
              </div>
            </div>
            {sortedEps.map((ep) => {
              const pr = prog[ep.id];
              const played = pr?.state === 'played';
              const inProg = pr?.state === 'in_progress';
              return (
                <div key={ep.id} className="tier-card card-lift rounded-xl p-3 flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative ${played ? 'opacity-60' : ''}`}><CoverArt imageUrl={ep.artwork} dominantColor={ep.dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold line-clamp-2 ${played ? 'text-zinc-400' : 'text-white'}`}>{ep.title}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {played ? '✓ Played' : inProg ? `${fmt((pr.durationMs - pr.positionMs) / 1000)} left` : `${ep.date || 'Episode'}${ep.duration ? ` · ${fmt(ep.duration)}` : ''}`}
                    </p>
                    {inProg && <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1.5 max-w-[220px]"><div className="h-full bg-sauti" style={{ width: `${pr.durationMs ? Math.min(100, (pr.positionMs / pr.durationMs) * 100) : 0}%` }} /></div>}
                  </div>
                  <button onClick={() => togglePlayed(ep)} className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${played ? 'text-sauti' : 'text-zinc-500 hover:text-white'}`} aria-label={played ? 'Mark unplayed' : 'Mark played'}>{played ? <Check className="w-5 h-5" /> : <Circle className="w-5 h-5" />}</button>
                  <button onClick={() => onListen(ep)} className="btn-sauti w-10 h-10 rounded-full flex items-center justify-center shrink-0" aria-label="Listen"><Play className="w-4 h-4 fill-current ml-0.5" /></button>
                  <button onClick={() => onWatch(ep)} className="btn-glass w-10 h-10 rounded-lg flex items-center justify-center shrink-0" aria-label="Watch on YouTube"><Video className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        )}
        {videoModal}
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Search */}
      <div className="relative mb-6 max-w-lg">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search podcasts…" className="w-full bg-zinc-900/70 border border-white/10 rounded-full pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/60" />
      </div>

      {query.trim() ? (
        searching ? (
          <div className="flex items-center gap-2 text-zinc-400 py-10"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Searching…</div>
        ) : results.length ? (
          <div className="flex flex-wrap gap-4">{results.map(card)}</div>
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
                      <p className="text-xs text-zinc-500 truncate mb-1.5">{p.track.artist}{p.durationMs ? ` · ${fmt((p.durationMs - p.positionMs) / 1000)} left` : ''}</p>
                      <div className="h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-sauti" style={{ width: `${p.durationMs ? Math.min(100, (p.positionMs / p.durationMs) * 100) : 10}%` }} /></div>
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
      {videoModal}
    </div>
  );
}
