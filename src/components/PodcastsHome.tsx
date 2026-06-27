import { useState, useEffect, useRef, type MouseEvent as RMouseEvent } from 'react';
import { Search, Loader2, Heart, Play, ChevronLeft, ChevronRight, Check, Circle, Video, X, ListTree, Download, Trash2, Sparkles } from 'lucide-react';
import { Track, ytmusic } from '../services/ytmusic';
import { searchPodcastShows, getPodcastEpisodes, fetchChapters, getShowsLatest, PodShow } from '../services/podcastRss';
import { downloads, useDownloads } from '../services/downloads';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import { getFollows, isFollowed, toggleFollow, listInProgress, getProgress, getMany, getSeen, markShowSeen, markPlayed, markUnplayed, EpisodeProgress } from '../services/podcasts';

const CATEGORIES = ['Top', 'News', 'Comedy', 'Business', 'Technology', 'True Crime', 'Sports', 'Health', 'Education'];
const catQuery = (c: string) => (c === 'Top' ? 'podcasts' : c);
// Country charts (spec §2.2.4 numbered list). iTunes storefront codes.
const CHART_MARKETS = [
  { cc: 'us', name: 'USA', flag: '\u{1F1FA}\u{1F1F8}' },
  { cc: 'gb', name: 'UK', flag: '\u{1F1EC}\u{1F1E7}' },
  { cc: 'ke', name: 'Kenya', flag: '\u{1F1F0}\u{1F1EA}' },
  { cc: 'ng', name: 'Nigeria', flag: '\u{1F1F3}\u{1F1EC}' },
  { cc: 'za', name: 'S. Africa', flag: '\u{1F1FF}\u{1F1E6}' },
  { cc: 'ca', name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' },
];
const fmt = (s: number) => { if (!s || !isFinite(s)) return ''; const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
// Clock format for chapters / timestamps: H:MM:SS or M:SS.
const clock = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60); const p = (n: number) => String(n).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`; };

// Make HH:MM(:SS) timestamps in show-notes tappable (spec §2.4 linkifyTimestamps).
function linkifyTimestamps(html: string): string {
  return html.replace(/\b(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\b/g, (m, h, mm, s) => {
    const sec = s ? Number(h) * 3600 + Number(mm) * 60 + Number(s) : Number(h) * 60 + Number(mm);
    return `<button type="button" class="ts-seek" data-seek="${sec}">${m}</button>`;
  });
}
// Light sanitiser for feed HTML: drop scripts/embeds, inline handlers, js: urls.
function sanitizeNotes(html: string): string {
  return (html || '')
    .replace(/<\s*(script|style|iframe|object|embed|form)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

// A podcast SHOW is carried as a Track (so it reuses follows/cards), with feedUrl set.
const showToTrack = (s: PodShow): Track => ({ id: s.id, title: s.title, artist: s.author, artwork: s.artwork, artworkLarge: s.artwork, duration: 0, feedUrl: s.feedUrl });

export default function PodcastsHome() {
  const { playQueue, seek, stop, current } = useMusic();
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
  const [episodeView, setEpisodeView] = useState<Track | null>(null);
  const [epChapters, setEpChapters] = useState<{ start: number; title: string }[]>([]);
  const [epChLoading, setEpChLoading] = useState(false);
  const tRef = useRef<number | undefined>(undefined);

  // Resolve <podcast:chapters> JSON on demand when an episode detail opens
  // (inline psc:chapters, if any, are already on the track).
  useEffect(() => {
    setEpChapters([]); setEpChLoading(false);
    if (!episodeView || episodeView.chapters?.length || !episodeView.chaptersUrl) return;
    let cancelled = false; setEpChLoading(true);
    fetchChapters(episodeView.chaptersUrl)
      .then((c) => { if (!cancelled) setEpChapters(c); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEpChLoading(false); });
    return () => { cancelled = true; };
  }, [episodeView]);

  const downloaded = useDownloads();
  const [chartCountry, setChartCountry] = useState('us');
  const [charts, setCharts] = useState<Record<string, Track[]>>({});
  const [chartLoading, setChartLoading] = useState(false);
  const [chartAll, setChartAll] = useState(false);
  const [epFilter, setEpFilter] = useState<'all' | 'unplayed' | 'inprogress' | 'downloaded'>('all');
  const [suggested, setSuggested] = useState<Track[]>([]);
  const [newShows, setNewShows] = useState<Set<string>>(new Set());

  // Top Podcasts chart for the selected country — numbered list (spec §2.2.4).
  useEffect(() => {
    if (query.trim() || charts[chartCountry]) return;
    let cancelled = false; setChartLoading(true);
    searchPodcastShows('podcasts', 20, chartCountry)
      .then((shows) => { if (!cancelled) setCharts((p) => ({ ...p, [chartCountry]: shows.map(showToTrack) })); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [chartCountry, query, charts]);

  // "Shows you might like" — seeded from your followed shows (spec §2.6.1).
  useEffect(() => {
    if (follows.length === 0) { setSuggested([]); return; }
    let cancelled = false;
    (async () => {
      const seeds = follows.slice(0, 3);
      const lists = await Promise.all(seeds.map((s) => searchPodcastShows(s.artist || s.title, 8).catch(() => [] as PodShow[])));
      if (cancelled) return;
      const followedIds = new Set(follows.map((f) => f.id));
      const seen = new Set<string>(); const out: Track[] = [];
      for (const list of lists) for (const s of list) { const tr = showToTrack(s); if (!followedIds.has(tr.id) && !seen.has(tr.id)) { seen.add(tr.id); out.push(tr); } }
      if (!cancelled) setSuggested(out.slice(0, 12));
    })();
    return () => { cancelled = true; };
  }, [follows]);

  // New-episode blue dots — one batched iTunes lookup of followed shows' latest
  // release dates, compared to what the user has already seen (spec §2.10.3).
  useEffect(() => {
    if (follows.length === 0) { setNewShows(new Set()); return; }
    let cancelled = false;
    (async () => {
      const latest = await getShowsLatest(follows.map((f) => f.id));
      if (cancelled) return;
      const seen = getSeen();
      const fresh = new Set<string>();
      for (const f of follows) {
        const lt = latest[f.id];
        if (!lt) continue;
        if (seen[f.id] == null) markShowSeen(f.id, lt); // first sight → seed, no dot
        else if (lt > seen[f.id]) fresh.add(f.id);
      }
      setNewShows(fresh);
    })();
    return () => { cancelled = true; };
  }, [follows]);

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
      if (!cancelled) {
        setShowEpisodes(eps); setShowLoading(false);
        const newest = eps.reduce((mx, e) => Math.max(mx, e.uploaded || 0), 0) || Date.now();
        markShowSeen(showView.id, newest);
        setNewShows((prev) => { if (!prev.has(showView.id)) return prev; const n = new Set(prev); n.delete(showView.id); return n; });
      }
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

  // Seek to a chapter / timestamp: if this episode is already playing, seek now;
  // otherwise start it, then seek once it has loaded.
  const seekTo = (ep: Track, seconds: number) => {
    if (current?.id === ep.id) { try { seek(seconds); } catch { /* ignore */ } return; }
    playQueue([ep], 0, 'Podcasts');
    window.setTimeout(() => { try { seek(seconds); } catch { /* ignore */ } }, 1400);
  };
  // Delegate clicks on tappable timestamps inside the (HTML) show-notes.
  const onNotesClick = (e: RMouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('[data-seek]');
    if (!el || !episodeView) return;
    e.preventDefault();
    const s = Number(el.getAttribute('data-seek'));
    if (isFinite(s)) seekTo(episodeView, s);
  };

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
        {newShows.has(t.id) && <span className="absolute top-2 left-2 w-3 h-3 rounded-full bg-sky-400 ring-2 ring-black/50 shadow" title="New episode" />}
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

  // ── Episode detail: show-notes (tappable timestamps) + chapters (spec §2.4) ──
  if (episodeView) {
    const ep = episodeView;
    const hc = ep.dominantColor || 'rgba(245,158,11,0.4)';
    const played = getProgress(ep.id)?.state === 'played';
    const notes = linkifyTimestamps(sanitizeNotes(ep.description || ''));
    const chapters = ep.chapters?.length ? ep.chapters : epChapters;
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-3xl">
        <button onClick={() => setEpisodeView(null)} className="flex items-center gap-1 text-zinc-400 hover:text-white mb-5 text-sm"><ChevronLeft className="w-4 h-4" /> Back</button>
        <div className="relative rounded-2xl overflow-hidden mb-5" style={{ background: `linear-gradient(160deg, ${hc}, transparent 75%)` }}>
          <div className="p-5 flex gap-4 items-start">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative"><CoverArt imageUrl={ep.artworkLarge || ep.artwork} dominantColor={ep.dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
            <div className="min-w-0">
              <button onClick={() => { setEpisodeView(null); }} className="text-xs text-zinc-300 hover:text-white truncate block max-w-full">{ep.artist}</button>
              <h2 className="text-xl md:text-2xl font-display font-bold text-white line-clamp-3 leading-tight">{ep.title}</h2>
              <p className="text-xs text-zinc-400 mt-1.5">{ep.date}{ep.duration ? ` · ${fmt(ep.duration)}` : ''}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-7">
          <button onClick={() => onListen(ep)} className="btn-sauti px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Play className="w-4 h-4 fill-current" /> Play episode</button>
          <button onClick={() => onWatch(ep)} className="btn-glass px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Video className="w-4 h-4" /> Watch</button>
          <button onClick={() => togglePlayed(ep)} className="btn-glass px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2">{played ? <Check className="w-4 h-4 text-sauti" /> : <Circle className="w-4 h-4" />} {played ? 'Played' : 'Mark played'}</button>
          {(() => { const dl = downloaded.some((d) => d.id === ep.id); const st = downloads.state(ep.id)?.status; return (
            <button onClick={() => (dl ? downloads.remove(ep.id) : downloads.download(ep))} disabled={st === 'downloading'} className="btn-glass px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 disabled:opacity-50">
              {st === 'downloading' ? <><Loader2 className="w-4 h-4 animate-spin" /> Downloading</> : dl ? <><Trash2 className="w-4 h-4 text-sauti" /> Downloaded</> : <><Download className="w-4 h-4" /> Download</>}
            </button>
          ); })()}
        </div>

        {chapters.length > 0 && (
          <section className="mb-7">
            <h3 className="overline mb-2 flex items-center gap-1.5"><ListTree className="w-3.5 h-3.5 text-sauti" /> Chapters</h3>
            <div className="space-y-0.5">
              {chapters.map((c, i) => (
                <button key={i} onClick={() => seekTo(ep, c.start)} tabIndex={0} data-tv-focusable className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-left transition-colors">
                  <span className="text-xs font-bold text-sauti tabular shrink-0 w-16">{clock(c.start)}</span>
                  <span className="text-sm text-zinc-200 truncate">{c.title}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {epChLoading && <p className="text-zinc-500 text-sm mb-5 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading chapters…</p>}

        <section>
          <h3 className="overline mb-2">Episode notes</h3>
          {notes ? (
            <div className="podcast-notes text-sm text-zinc-300 leading-relaxed" onClick={onNotesClick} dangerouslySetInnerHTML={{ __html: notes }} />
          ) : <p className="text-zinc-500 text-sm">No notes for this episode.</p>}
        </section>
        {videoModal}
      </div>
    );
  }

  // ── Show page: a series' episodes, organised (Spotify-style) ──
  if (showView) {
    const hc = showView.dominantColor || 'rgba(245,158,11,0.4)';
    const sortedEps = [...showEpisodes].sort((a, b) => (epSort === 'new' ? (b.uploaded || 0) - (a.uploaded || 0) : (a.uploaded || 0) - (b.uploaded || 0)));
    const prog = getMany(showEpisodes.map((e) => e.id)); void progV;
    const filteredEps = sortedEps.filter((ep) => {
      if (epFilter === 'downloaded') return downloaded.some((d) => d.id === ep.id);
      const st = prog[ep.id]?.state;
      if (epFilter === 'inprogress') return st === 'in_progress';
      if (epFilter === 'unplayed') return st !== 'in_progress' && st !== 'played';
      return true; // 'all'
    });
    const EP_FILTERS: { k: typeof epFilter; label: string }[] = [
      { k: 'all', label: 'All' }, { k: 'unplayed', label: 'Unplayed' },
      { k: 'inprogress', label: 'In progress' }, { k: 'downloaded', label: 'Downloaded' },
    ];
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
            <div className="flex items-center justify-between mb-2 gap-3">
              <span className="text-xs text-zinc-500 tabular shrink-0">{showEpisodes.length} episodes</span>
              <div className="flex gap-1 glass p-1 rounded-lg shrink-0">
                {(['new', 'old'] as const).map((s) => (
                  <button key={s} onClick={() => setEpSort(s)} className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${epSort === s ? 'bg-sauti text-amber-950' : 'text-zinc-400 hover:text-white'}`}>{s === 'new' ? 'Newest' : 'Oldest'}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-1">
              {EP_FILTERS.map((f) => (
                <button key={f.k} onClick={() => setEpFilter(f.k)} className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${epFilter === f.k ? 'bg-sauti text-amber-950 border-transparent' : 'glass-liquid text-white border-transparent'}`}>{f.label}</button>
              ))}
            </div>
            {filteredEps.length === 0 ? (
              <p className="text-zinc-500 py-8 text-center text-sm">No matching episodes.</p>
            ) : filteredEps.map((ep) => {
              const pr = prog[ep.id];
              const played = pr?.state === 'played';
              const inProg = pr?.state === 'in_progress';
              return (
                <div key={ep.id} className="tier-card card-lift rounded-xl p-3 flex items-center gap-3">
                  <button onClick={() => setEpisodeView(ep)} tabIndex={0} data-tv-focusable className="flex items-center gap-3 min-w-0 flex-1 text-left">
                    <div className={`w-14 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative ${played ? 'opacity-60' : ''}`}><CoverArt imageUrl={ep.artwork} dominantColor={ep.dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold line-clamp-2 ${played ? 'text-zinc-400' : 'text-white'}`}>{ep.title}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {played ? '✓ Played' : inProg ? `${fmt((pr.durationMs - pr.positionMs) / 1000)} left` : `${ep.date || 'Episode'}${ep.duration ? ` · ${fmt(ep.duration)}` : ''}`}
                      </p>
                      {inProg && <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1.5 max-w-[220px]"><div className="h-full bg-sauti" style={{ width: `${pr.durationMs ? Math.min(100, (pr.positionMs / pr.durationMs) * 100) : 0}%` }} /></div>}
                    </div>
                  </button>
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

          {/* Top Podcasts — numbered chart, per country (spec §2.2.4) */}
          <section className="mb-9">
            <h3 className="text-xl font-display font-bold text-white tracking-tight mb-3">Top Podcasts</h3>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-1">
              {CHART_MARKETS.map((m) => (
                <button key={m.cc} onClick={() => { setChartCountry(m.cc); setChartAll(false); }} className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${chartCountry === m.cc ? 'bg-sauti text-amber-950 border-transparent' : 'glass-liquid text-white border-transparent'}`}>{m.flag} {m.name}</button>
              ))}
            </div>
            {chartLoading && !charts[chartCountry]?.length ? (
              <div className="flex items-center gap-2 text-zinc-400 py-6"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Loading chart…</div>
            ) : (
              <div className="space-y-1">
                {(charts[chartCountry] || []).slice(0, chartAll ? 20 : 10).map((t, i) => (
                  <button key={t.id} onClick={() => setShowView(t)} tabIndex={0} data-tv-focusable className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left transition-colors">
                    <span className="w-7 text-center text-lg font-display font-extrabold text-zinc-500 tabular shrink-0">{i + 1}</span>
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative"><CoverArt imageUrl={t.artwork} dominantColor={t.dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">{t.title}</p>
                      <p className="text-xs text-zinc-500 truncate">{t.artist}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
                  </button>
                ))}
                {(charts[chartCountry]?.length || 0) > 10 && (
                  <button onClick={() => setChartAll((v) => !v)} className="text-xs font-bold text-sauti px-2 py-2 hover:underline">{chartAll ? 'Show less' : 'Show all'}</button>
                )}
              </div>
            )}
          </section>

          {/* Curated category shelves */}
          {shelves.map((s) => (
            <section key={s.title} className="mb-9">
              <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4">{s.title}</h3>
              <div className="flex overflow-x-auto gap-4 pb-3 scrollbar-hide">{s.items.map(card)}</div>
            </section>
          ))}

          {/* Shows you might like (spec §2.6.1) */}
          {suggested.length >= 4 && (
            <section className="mb-9">
              <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-sauti" /> Shows you might like</h3>
              <div className="flex overflow-x-auto gap-4 pb-3 scrollbar-hide">{suggested.map(card)}</div>
            </section>
          )}
          {loadingHome && shelves.length === 0 && <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-zinc-400"><Loader2 className="w-9 h-9 animate-spin text-amber-500" /><span>Loading podcasts…</span></div>}
        </>
      )}
      {videoModal}
    </div>
  );
}
