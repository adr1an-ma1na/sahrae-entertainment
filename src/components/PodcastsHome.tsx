import { useState, useEffect, useRef, type MouseEvent as RMouseEvent } from 'react';
import { Search, Loader2, Heart, Play, ChevronLeft, ChevronRight, Check, Circle, Video, X, ListTree, Download, Trash2, Sparkles, TrendingUp } from 'lucide-react';
import { Track, ytmusic } from '../services/ytmusic';
import { searchPodcastShows, getPodcastEpisodes, fetchChapters, getShowsLatest, PodShow } from '../services/podcastRss';
import { getEpisodesById, mergeEpisodes } from '../services/itunesPodcasts';
import { matchEpisodeVideo } from '../services/episodeVideo';
import { downloads, useDownloads } from '../services/downloads';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import { getFollows, isFollowed, toggleFollow, listInProgress, getProgress, getMany, getSeen, markShowSeen, markPlayed, markUnplayed, EpisodeProgress } from '../services/podcasts';

// 'Top' is deliberately absent — the Top Podcasts chart covers it, and fetching
// a shelf nothing renders was a wasted request on every page load.
const CATEGORIES = ['News', 'Comedy', 'Business', 'Technology', 'True Crime', 'Sports', 'Health', 'Education'];

// Time windows people actually have: a commute, a walk, a gym session, a drive.
// Labelled by the occasion rather than the number, because "the commute" is how
// someone thinks about it — the minutes are the supporting detail.
const TIME_BUCKETS = [
  { id: 'quick', label: 'Quick hit', hint: 'Under 15 min', min: 0, max: 900, grad: 'from-emerald-500/25 to-teal-600/20', ring: 'border-emerald-400/40' },
  { id: 'commute', label: 'The commute', hint: '15 – 30 min', min: 900, max: 1800, grad: 'from-sky-500/25 to-indigo-600/20', ring: 'border-sky-400/40' },
  { id: 'deep', label: 'Deep dive', hint: '30 – 60 min', min: 1800, max: 3600, grad: 'from-amber-500/25 to-orange-600/20', ring: 'border-amber-400/40' },
  { id: 'long', label: 'The long haul', hint: 'Over an hour', min: 3600, max: Infinity, grad: 'from-fuchsia-500/25 to-violet-600/20', ring: 'border-fuchsia-400/40' },
];

// Category tiles. A colour per category so the grid reads as a place you can
// navigate by memory, instead of nine identical rails of square artwork.
const CAT_TILES: { name: string; grad: string }[] = [
  { name: 'News', grad: 'from-rose-500/30 to-red-700/20' },
  { name: 'Comedy', grad: 'from-amber-400/30 to-orange-600/20' },
  { name: 'True Crime', grad: 'from-zinc-400/25 to-zinc-700/20' },
  { name: 'Business', grad: 'from-emerald-500/30 to-green-700/20' },
  { name: 'Technology', grad: 'from-sky-500/30 to-blue-700/20' },
  { name: 'Sports', grad: 'from-lime-500/30 to-emerald-700/20' },
  { name: 'Health', grad: 'from-teal-500/30 to-cyan-700/20' },
  { name: 'Education', grad: 'from-violet-500/30 to-purple-700/20' },
];

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

  // Which category tile is expanded in the Browse grid.
  const [openCat, setOpenCat] = useState<string | null>(null);

  // ── "How long have you got?" ──
  // The real question when choosing an episode is how much time you have, and
  // nothing in podcast apps is organised that way — you pick a show, then hunt
  // for something that fits. These buckets invert that: pick the window, get
  // episodes that actually fit it, drawn from the shows you follow (falling back
  // to the chart when you follow nothing yet).
  const [bucket, setBucket] = useState<string | null>(null);
  const [bucketEps, setBucketEps] = useState<Track[]>([]);
  const [bucketLoading, setBucketLoading] = useState(false);

  // ── Fresh episodes ──
  // The page used to show nothing playable until you tapped a tile — all art and
  // no content, which is what made it feel thin. This pulls the newest episodes
  // from your shows (or the chart, before you follow anything) so there is
  // something to press the moment the page opens.
  const [fresh, setFresh] = useState<Track[]>([]);
  const [freshLoading, setFreshLoading] = useState(true);

  useEffect(() => {
    const sources = [...follows, ...(charts[chartCountry] || [])]
      .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
      .slice(0, 6);
    if (!sources.length) return;
    let cancelled = false;
    setFreshLoading(true);
    (async () => {
      const lists = await Promise.all(sources.map((s) => getEpisodesById(s.id, 6).catch(() => [] as Track[])));
      if (cancelled) return;
      // One per show, so a single prolific podcast can't fill the whole rail.
      const perShow = lists.map((l) => l[0]).filter(Boolean) as Track[];
      const rest = lists.flatMap((l) => l.slice(1));
      setFresh([...perShow, ...rest].sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0)).slice(0, 12));
      setFreshLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follows.length, charts[chartCountry]?.length]);

  useEffect(() => {
    if (!bucket) { setBucketEps([]); return; }
    const band = TIME_BUCKETS.find((b) => b.id === bucket);
    if (!band) return;
    let cancelled = false;
    setBucketLoading(true); setBucketEps([]);
    (async () => {
      // Follows first — they are what someone actually wants to listen to.
      // Chart shows only fill in when there aren't enough sources.
      const sources = [...follows, ...(charts[chartCountry] || [])]
        .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
        .slice(0, 8);
      const lists = await Promise.all(sources.map((s) => getEpisodesById(s.id, 25).catch(() => [] as Track[])));
      if (cancelled) return;
      const fits = lists.flat()
        .filter((e) => e.duration > 0 && e.duration >= band.min && e.duration < band.max)
        .sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0))
        .slice(0, 24);
      setBucketEps(fits);
      setBucketLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

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
        const shows = await searchPodcastShows(c, 12).catch(() => [] as PodShow[]);
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

  // Show page — load episodes (real MP3s), iTunes first then RSS on top.
  //
  // iTunes' lookup is CORS-open, so it resolves on web AND in the APK; podcast
  // RSS feeds send no CORS headers at all, so the feed-only path used to come
  // back empty in the PWA and the page just sat there saying nothing. iTunes
  // renders the show immediately; the feed then fills in the back-catalogue past
  // iTunes' 200-episode cap plus chapters and fuller notes, wherever it is
  // actually reachable. Old follows without a feed are looked up by name first.
  useEffect(() => {
    if (!showView) return;
    let cancelled = false; setShowLoading(true); setShowEpisodes([]);

    const seen = (eps: Track[]) => {
      const newest = eps.reduce((mx, e) => Math.max(mx, e.uploaded || 0), 0) || Date.now();
      markShowSeen(showView.id, newest);
      setNewShows((prev) => { if (!prev.has(showView.id)) return prev; const n = new Set(prev); n.delete(showView.id); return n; });
    };

    (async () => {
      const primary = await getEpisodesById(showView.id).catch(() => [] as Track[]);
      if (cancelled) return;
      if (primary.length) { setShowEpisodes(primary); setShowLoading(false); seen(primary); }

      let feed = showView.feedUrl;
      if (!feed) {
        const found = await searchPodcastShows(showView.title || showView.artist, 1).catch(() => [] as PodShow[]);
        feed = found[0]?.feedUrl;
      }
      const extra = feed
        ? await getPodcastEpisodes(feed, { title: showView.title, artwork: showView.artwork }).catch(() => [] as Track[])
        : [];
      if (cancelled) return;

      const merged = mergeEpisodes(primary, extra);
      setShowEpisodes(merged);
      setShowLoading(false);
      if (!primary.length) seen(merged);
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

  // Watch the episode on YouTube.
  //
  // This used to take the first search hit, which meant it played SOMETHING for
  // every episode — and since most podcasts never publish to YouTube, that
  // something was usually a different show entirely. Now a candidate has to
  // actually look like this episode (matching runtime, or a near-identical
  // title) or we say there is no video, which is the honest answer.
  const onWatch = async (t: Track) => {
    stop();
    setWatchTitle(t.title); setWatchId(null); setWatchOpen(true);
    const q = `${t.artist} ${t.title}`.replace(/\s+/g, ' ').trim().slice(0, 110);
    const r = await ytmusic.searchVideos(q).catch(() => [] as Track[]);
    const hit = matchEpisodeVideo(t, r);
    setWatchId(hit ? hit.track.id : '');
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
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 px-8 text-center gap-2">
          <Video className="w-8 h-8 text-zinc-600" aria-hidden />
          <p className="text-sm font-semibold text-zinc-300">This episode isn’t on YouTube</p>
          <p className="text-xs max-w-xs">Most podcasts publish audio only. Close this and press play to listen instead.</p>
        </div>
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
        <button onClick={() => setEpisodeView(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-5 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
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
          {(() => { const dl = downloaded.some((d) => d.id === ep.id); const dstate = downloads.state(ep.id); const st = dstate?.status; return (
            <button onClick={() => (dl ? downloads.remove(ep.id) : downloads.download(ep))} disabled={st === 'downloading'} className="btn-glass px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 disabled:opacity-50">
              {st === 'downloading'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {Math.round((dstate?.progress || 0) * 100)}%</>
                : dl ? <><Trash2 className="w-4 h-4 text-sauti" /> Downloaded</> : <><Download className="w-4 h-4" /> Download</>}
            </button>
          ); })()}
        </div>

        {/* A failed download used to leave the button looking untouched, so it
            read as "nothing happened". Say what went wrong instead. */}
        {downloads.state(ep.id)?.status === 'error' && (
          <p role="alert" className="text-xs text-red-400 -mt-5 mb-6 max-w-xl">
            {downloads.state(ep.id)?.error || 'Download failed.'}
          </p>
        )}

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
        <button onClick={() => setShowView(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-5 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
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
          {/* ── 1. Pick up where you left off ───────────────────────────────
              The one thing a returning listener wants is the episode they were
              already in. It used to be a card in a rail like everything else;
              now it leads, at a size that says "press this". */}
          {cont.length > 0 && (() => {
            const [top, ...rest] = cont;
            const left = top.durationMs ? (top.durationMs - top.positionMs) / 1000 : 0;
            const pct = top.durationMs ? Math.min(100, (top.positionMs / top.durationMs) * 100) : 8;
            return (
              <section className="mb-10">
                <button onClick={() => resume(top)} tabIndex={0} data-tv-focusable
                  aria-label={`Resume ${top.track.title}${left ? `, ${fmt(left)} left` : ''}`}
                  className="group card-lift w-full text-left rounded-3xl overflow-hidden relative border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                  {/* Artwork bled behind the panel, heavily blurred — the episode's
                      own colour becomes the backdrop, so this block looks
                      different every time you open the page. */}
                  <div aria-hidden className="absolute inset-0 -z-10">
                    <CoverArt imageUrl={top.track.artworkLarge || top.track.artwork} dominantColor={top.track.dominantColor} rounded="" className="absolute inset-0 w-full h-full scale-125 blur-2xl opacity-45" />
                    <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/85 to-zinc-950/50" />
                  </div>
                  <div className="flex items-center gap-4 md:gap-5 p-4 md:p-5">
                    <div className="w-20 h-20 md:w-28 md:h-28 rounded-2xl overflow-hidden bg-zinc-800 shrink-0 relative shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                      <CoverArt imageUrl={top.track.artwork} dominantColor={top.track.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="overline mb-1">Pick up where you left off</div>
                      <p className="text-base md:text-xl font-display font-bold text-white line-clamp-2 leading-snug">{top.track.title}</p>
                      <p className="text-xs md:text-sm text-zinc-400 truncate mt-0.5">{top.track.artist}</p>
                      <div className="flex items-center gap-3 mt-3">
                        <div className="h-1.5 flex-1 rounded-full bg-white/15 overflow-hidden">
                          <div className="h-full bg-sauti rounded-full transition-[width] duration-300" style={{ width: `${pct}%` }} />
                        </div>
                        {left > 0 && <span className="text-[11px] font-bold text-zinc-300 tabular shrink-0">{fmt(left)} left</span>}
                      </div>
                    </div>
                    <span className="btn-sauti w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center shrink-0 shadow-lg transition-transform duration-200 group-hover:scale-105">
                      <Play className="w-5 h-5 md:w-6 md:h-6 fill-current ml-0.5" />
                    </span>
                  </div>
                </button>

                {rest.length > 0 && (
                  <div className="flex overflow-x-auto gap-2.5 pt-3 pb-1 scrollbar-hide">
                    {rest.map((p) => (
                      <button key={p.track.id} onClick={() => resume(p)} tabIndex={0} data-tv-focusable
                        aria-label={`Resume ${p.track.title}`}
                        className="card-lift tier-card rounded-xl p-2.5 flex items-center gap-2.5 w-[260px] shrink-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                        <div className="w-11 h-11 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative"><CoverArt imageUrl={p.track.artwork} dominantColor={p.track.dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">{p.track.title}</p>
                          <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1.5"><div className="h-full bg-sauti" style={{ width: `${p.durationMs ? Math.min(100, (p.positionMs / p.durationMs) * 100) : 10}%` }} /></div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })()}

          {/* ── 2. How long have you got? ────────────────────────────────────
              The organising idea of this page. Every other podcast app makes you
              choose a show and then hope something fits the time you have; this
              starts from the time. */}
          <section className="mb-10">
            <h3 className="text-xl font-display font-bold text-white tracking-tight mb-1">How long have you got?</h3>
            <p className="text-xs text-zinc-500 mb-4">Episodes that actually fit the time — from the shows you follow.</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {TIME_BUCKETS.map((b) => {
                const on = bucket === b.id;
                return (
                  <button key={b.id} onClick={() => setBucket(on ? null : b.id)} tabIndex={0} data-tv-focusable
                    aria-pressed={on}
                    className={`card-lift relative overflow-hidden rounded-2xl border p-4 min-h-[88px] text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      on ? `${b.ring} bg-gradient-to-br ${b.grad}` : 'border-white/10 bg-zinc-900/50 hover:border-white/20'
                    }`}>
                    {/* A waveform, not a clock icon — it reads as audio at a
                        glance and gives each tile a bit of character. */}
                    <span aria-hidden className="absolute right-3 bottom-3 flex items-end gap-[3px] h-6 opacity-40">
                      {[9, 16, 22, 13, 19, 8].map((h, i) => (
                        <span key={i} className={`w-[3px] rounded-full ${on ? 'bg-white' : 'bg-zinc-500'}`} style={{ height: `${h}px` }} />
                      ))}
                    </span>
                    <span className="block font-display font-bold text-white text-sm md:text-base">{b.label}</span>
                    <span className="block text-[11px] text-zinc-400 mt-0.5 tabular">{b.hint}</span>
                  </button>
                );
              })}
            </div>

            {bucket && (
              <div className="mt-4">
                {bucketLoading ? (
                  <div className="flex items-center gap-2 text-zinc-400 py-6"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Finding episodes that fit…</div>
                ) : bucketEps.length ? (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {bucketEps.map((e) => (
                      <button key={e.id} onClick={() => onListen(e)} tabIndex={0} data-tv-focusable
                        aria-label={`Play ${e.title}`}
                        className="card-lift tier-card rounded-xl p-2.5 flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative"><CoverArt imageUrl={e.artwork} dominantColor={e.dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{e.title}</p>
                          <p className="text-[11px] text-zinc-500 truncate">{e.artist}</p>
                        </div>
                        <span className="text-[11px] font-bold text-sauti tabular shrink-0 px-2 py-1 rounded-md bg-sauti/10">{fmt(e.duration)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 py-6">
                    Nothing in that length right now. {follows.length ? 'Try a different window.' : 'Follow a few shows and this fills up.'}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ── 3. Fresh episodes ────────────────────────────────────────────
              Real, playable episodes on arrival — with date and runtime, the
              way a podcast list is meant to read. Without this the page was all
              artwork and no substance until you tapped something. */}
          {(freshLoading || fresh.length > 0) && (
            <section className="mb-10">
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <h3 className="text-xl font-display font-bold text-white tracking-tight">
                  {follows.length ? 'New from your shows' : 'Fresh episodes'}
                </h3>
              </div>
              {freshLoading && !fresh.length ? (
                <div className="grid sm:grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="tier-card rounded-xl p-3 flex items-center gap-3 animate-pulse">
                      <div className="w-14 h-14 rounded-lg bg-white/5 shrink-0" />
                      <div className="flex-1 space-y-2"><div className="h-3 rounded bg-white/5 w-4/5" /><div className="h-2.5 rounded bg-white/5 w-2/5" /></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {fresh.map((e) => {
                    const pr = getProgress(e.id);
                    const pct = pr?.durationMs ? Math.min(100, (pr.positionMs / pr.durationMs) * 100) : 0;
                    return (
                      <div key={e.id} onClick={() => setEpisodeView(e)} tabIndex={0} data-tv-focusable role="button"
                        className="card-lift tier-card rounded-xl p-3 flex items-center gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative">
                          <CoverArt imageUrl={e.artwork} dominantColor={e.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white line-clamp-2 leading-snug">{e.title}</p>
                          <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                            {e.artist}{e.date ? ` · ${e.date}` : ''}{e.duration ? ` · ${fmt(e.duration)}` : ''}
                          </p>
                          {pct > 0 && (
                            <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1.5"><div className="h-full bg-sauti" style={{ width: `${pct}%` }} /></div>
                          )}
                        </div>
                        <button onClick={(ev) => { ev.stopPropagation(); onListen(e); }}
                          aria-label={`Play ${e.title}`}
                          className="btn-sauti w-10 h-10 rounded-full flex items-center justify-center shrink-0">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ── 4. Your shows ─────────────────────────────────────────────── */}
          {follows.length > 0 && (
            <section className="mb-10">
              <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4">Your shows</h3>
              <div className="flex overflow-x-auto gap-4 pb-3 scrollbar-hide">{follows.map(card)}</div>
            </section>
          )}

          {/* ── 5. Top Podcasts — podium + list ──────────────────────────────
              The top three get artwork you can actually see; 4–10 stay a tight
              list. A flat 1–20 rundown gave the number one the same weight as
              number nineteen. */}
          <section className="mb-10">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h3 className="text-xl font-display font-bold text-white tracking-tight">Top Podcasts</h3>
              <TrendingUp className="w-4 h-4 text-sauti shrink-0" aria-hidden />
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-3">
              {CHART_MARKETS.map((m) => (
                <button key={m.cc} onClick={() => { setChartCountry(m.cc); setChartAll(false); }} tabIndex={0} data-tv-focusable
                  aria-pressed={chartCountry === m.cc}
                  className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${chartCountry === m.cc ? 'bg-sauti text-amber-950 border-transparent' : 'glass-liquid text-white border-transparent'}`}>{m.flag} {m.name}</button>
              ))}
            </div>
            {chartLoading && !charts[chartCountry]?.length ? (
              <div className="flex items-center gap-2 text-zinc-400 py-6"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Loading chart…</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2.5 mb-3">
                  {(charts[chartCountry] || []).slice(0, 3).map((t, i) => (
                    <button key={t.id} onClick={() => setShowView(t)} tabIndex={0} data-tv-focusable
                      aria-label={`${t.title}, number ${i + 1}`}
                      className="card-lift group relative rounded-2xl overflow-hidden border border-white/10 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                      <div className="aspect-square relative bg-zinc-800">
                        <CoverArt imageUrl={t.artworkLarge || t.artwork} dominantColor={t.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                        <span className="absolute top-2 left-2 w-7 h-7 rounded-full bg-sauti text-amber-950 font-display font-extrabold text-sm flex items-center justify-center tabular shadow-lg">{i + 1}</span>
                        <div className="absolute inset-x-0 bottom-0 p-2.5">
                          <p className="text-xs md:text-sm font-bold text-white line-clamp-2 leading-tight">{t.title}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="space-y-0.5">
                  {(charts[chartCountry] || []).slice(3, chartAll ? 20 : 10).map((t, i) => (
                    <button key={t.id} onClick={() => setShowView(t)} tabIndex={0} data-tv-focusable
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                      <span className="w-7 text-center text-sm font-display font-extrabold text-zinc-500 tabular shrink-0">{i + 4}</span>
                      <div className="w-11 h-11 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative"><CoverArt imageUrl={t.artwork} dominantColor={t.dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{t.title}</p>
                        <p className="text-xs text-zinc-500 truncate">{t.artist}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" aria-hidden />
                    </button>
                  ))}
                  {(charts[chartCountry]?.length || 0) > 10 && (
                    <button onClick={() => setChartAll((v) => !v)} tabIndex={0} data-tv-focusable className="text-xs font-bold text-sauti px-2 py-2.5 hover:underline">{chartAll ? 'Show less' : `Show all ${Math.min(20, charts[chartCountry]?.length || 0)}`}</button>
                  )}
                </div>
              </>
            )}
          </section>

          {/* ── 6. Browse by category — a grid, not nine more rails ──────────
              The old page stacked one horizontal shelf per category, so the
              whole screen was the same rail repeated and nothing stood out.
              These tiles collapse that into one glanceable block; picking one
              expands its shows underneath. */}
          <section className="mb-10">
            <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4">Browse</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {CAT_TILES.map((c) => {
                const shelf = shelves.find((s) => s.title === c.name);
                const on = openCat === c.name;
                return (
                  <button key={c.name} onClick={() => setOpenCat(on ? null : c.name)} tabIndex={0} data-tv-focusable
                    aria-pressed={on} aria-label={`Browse ${c.name} podcasts`}
                    className={`card-lift relative overflow-hidden rounded-2xl border p-4 min-h-[84px] text-left transition-all duration-200 bg-gradient-to-br ${c.grad} focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${on ? 'border-white/40' : 'border-white/10'}`}>
                    <span className="block font-display font-bold text-white text-sm md:text-base leading-tight">{c.name}</span>
                    <span className="block text-[11px] text-zinc-300/80 mt-0.5">{shelf ? `${shelf.items.length} shows` : 'Loading…'}</span>
                    {/* The category's own top show peeking out of the corner —
                        gives each tile a face instead of being a colour swatch. */}
                    {shelf?.items[0] && (
                      <span aria-hidden className="absolute -right-3 -bottom-3 w-16 h-16 rounded-xl overflow-hidden opacity-70 rotate-6 shadow-lg">
                        <CoverArt imageUrl={shelf.items[0].artwork} dominantColor={shelf.items[0].dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {openCat && (() => {
              const shelf = shelves.find((s) => s.title === openCat);
              return (
                <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  {shelf?.items.length ? (
                    <div className="flex overflow-x-auto gap-4 pb-3 scrollbar-hide">{shelf.items.map(card)}</div>
                  ) : (
                    <div className="flex items-center gap-2 text-zinc-400 py-6"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Loading {openCat}…</div>
                  )}
                </div>
              );
            })()}
          </section>

          {/* ── 7. Shows you might like ─────────────────────────────────────── */}
          {suggested.length >= 4 && (
            <section className="mb-10">
              <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-sauti" aria-hidden /> Shows you might like</h3>
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
