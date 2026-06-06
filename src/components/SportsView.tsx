import { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Play, X, Maximize, Loader2, RefreshCw, Radio, CalendarClock } from 'lucide-react';

/**
 * Live Sports — football, F1 / MotoGP / rally (motor-sports), tennis, cricket,
 * UFC/boxing, basketball and more. Cricfy-style: each event exposes several
 * independent stream "servers" you can switch between if one is flaky.
 *
 * Data comes from the open Streamed API (CORS-enabled). Domains rotate, so we
 * try a few in order. All ad/popup protection is handled by the native Android
 * shell (MainActivity), so the embeds play clean inside the app.
 */

const API_DOMAINS = ['streamed.pk', 'streamed.su', 'streamed.st'];

interface ApiSource {
  source: string;
  id: string;
}
interface TeamSide {
  name?: string;
  badge?: string;
}
interface Match {
  id: string;
  title: string;
  category: string;
  date: number;
  poster?: string;
  popular?: boolean;
  teams?: { home?: TeamSide; away?: TeamSide };
  sources: ApiSource[];
}
interface Stream {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
}

const SPORT_LABELS: Record<string, string> = {
  football: 'Football',
  'american-football': 'NFL',
  basketball: 'Basketball',
  baseball: 'Baseball',
  hockey: 'Hockey',
  'motor-sports': 'Motorsport',
  fight: 'UFC / Boxing',
  tennis: 'Tennis',
  cricket: 'Cricket',
  golf: 'Golf',
  rugby: 'Rugby',
  billiards: 'Billiards',
  afl: 'AFL',
  darts: 'Darts',
  other: 'Other',
};

export default function SportsView() {
  const [apiBase, setApiBase] = useState<string>('https://streamed.pk');
  const [matches, setMatches] = useState<Match[]>([]);
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<string>('live');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [streamLoading, setStreamLoading] = useState(false);
  const [activeStreamIdx, setActiveStreamIdx] = useState(0);

  const playerContainerRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    for (const d of API_DOMAINS) {
      try {
        const base = `https://${d}`;
        const [liveRes, todayRes] = await Promise.all([
          fetch(`${base}/api/matches/live`, { cache: 'no-store' }),
          fetch(`${base}/api/matches/all-today`, { cache: 'no-store' }),
        ]);
        if (!liveRes.ok || !todayRes.ok) continue;
        const live: Match[] = await liveRes.json();
        const today: Match[] = await todayRes.json();

        const liveSet = new Set(live.map((m) => m.id));
        // Live events first, then the rest of today's schedule (deduped).
        const seen = new Set<string>();
        const merged: Match[] = [];
        for (const m of [...live, ...today]) {
          if (!m || !m.id || seen.has(m.id)) continue;
          if (!m.sources || m.sources.length === 0) continue;
          seen.add(m.id);
          merged.push(m);
        }

        setApiBase(base);
        setLiveIds(liveSet);
        setMatches(merged);
        setLoading(false);
        return;
      } catch {
        /* try next domain */
      }
    }
    setError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh live status every 2 minutes so the LIVE badges stay accurate.
  useEffect(() => {
    const t = setInterval(loadData, 120000);
    return () => clearInterval(t);
  }, [loadData]);

  const openMatch = useCallback(
    async (match: Match) => {
      setActiveMatch(match);
      setStreams([]);
      setActiveStreamIdx(0);
      setStreamLoading(true);
      const all: Stream[] = [];
      await Promise.all(
        match.sources.map(async (s) => {
          try {
            const res = await fetch(`${apiBase}/api/stream/${s.source}/${s.id}`, { cache: 'no-store' });
            if (res.ok) {
              const list: Stream[] = await res.json();
              for (const st of list) if (st?.embedUrl) all.push(st);
            }
          } catch {
            /* ignore a dead source */
          }
        }),
      );
      // Stable order: HD first, then by source + stream number.
      all.sort((a, b) => Number(b.hd) - Number(a.hd) || a.source.localeCompare(b.source) || a.streamNo - b.streamNo);
      setStreams(all);
      setStreamLoading(false);
    },
    [apiBase],
  );

  const closePlayer = useCallback(() => {
    setActiveMatch(null);
    setStreams([]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeMatch) closePlayer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMatch, closePlayer]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const badgeUrl = (badge?: string) => (badge ? `${apiBase}/api/images/badge/${badge}.webp` : '');
  const posterUrl = (m: Match) => (m.poster ? `${apiBase}${m.poster}` : '');

  const uniqueCategories: string[] = Array.from(new Set<string>(matches.map((m) => m.category)));
  const categories: string[] = ['live', 'all', ...uniqueCategories];

  const visibleMatches = matches.filter((m) => {
    if (category === 'live') return liveIds.has(m.id);
    if (category === 'all') return true;
    return m.category === category;
  });

  const labelFor = (c: string) =>
    c === 'live' ? 'Live Now' : c === 'all' ? "Today's Schedule" : SPORT_LABELS[c] || c;

  const activeStream = streams[activeStreamIdx];

  return (
    <div className="pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12 relative">
      {/* ── Player overlay ── */}
      {activeMatch && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-sm p-3 md:p-10">
          <div className="w-full max-w-5xl flex flex-col gap-3">
            <div
              ref={playerContainerRef}
              className="w-full aspect-video bg-black rounded-lg shadow-2xl overflow-hidden relative border border-white/10"
            >
              <div className="absolute top-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  {liveIds.has(activeMatch.id) && (
                    <div className="flex items-center gap-1.5 bg-red-500 text-white px-2.5 py-1 rounded-sm shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                      <span className="text-xs font-bold uppercase tracking-wider">Live</span>
                    </div>
                  )}
                  <h3 className="text-white font-bold text-sm md:text-lg drop-shadow-md truncate">{activeMatch.title}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={toggleFullScreen}
                    tabIndex={0}
                    data-tv-focusable
                    className="w-10 h-10 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center transition-colors border border-white/10"
                  >
                    <Maximize className="w-5 h-5" />
                  </button>
                  <button
                    onClick={closePlayer}
                    tabIndex={0}
                    data-tv-focusable
                    className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {streamLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                  <span className="text-sm">Finding live servers…</span>
                </div>
              ) : activeStream ? (
                <iframe
                  key={activeStream.embedUrl}
                  src={activeStream.embedUrl}
                  className="w-full h-full border-none bg-black absolute inset-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400 px-6 text-center">
                  <Radio className="w-8 h-8 text-zinc-600" />
                  <span className="text-sm">No live servers for this event yet. Check back closer to kick-off.</span>
                </div>
              )}
            </div>

            {/* Server switcher (cricfy-style) */}
            {streams.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mr-1">Servers:</span>
                {streams.map((s, i) => (
                  <button
                    key={`${s.source}-${s.streamNo}-${i}`}
                    onClick={() => setActiveStreamIdx(i)}
                    tabIndex={0}
                    data-tv-focusable
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                      i === activeStreamIdx
                        ? 'bg-amber-500 text-amber-950 border-amber-500'
                        : 'bg-zinc-800/80 text-zinc-300 border-white/10 hover:bg-zinc-700'
                    }`}
                    title={s.language}
                  >
                    {(SPORT_LABELS[s.source] || s.source)} {s.streamNo}
                    {s.hd ? ' · HD' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">Live Sports</h2>
            <p className="text-sm text-zinc-400">Football · F1 · MotoGP · Tennis · Cricket · UFC & more</p>
          </div>
        </div>

        {!loading && !error && (
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                tabIndex={0}
                data-tv-focusable
                className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  category === c
                    ? 'bg-white text-zinc-950 shadow-md'
                    : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {c === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                {labelFor(c)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-zinc-400">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
          <span>Loading live events…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-4">
          <Radio className="w-12 h-12 text-zinc-600" />
          <h3 className="text-xl font-bold text-white">Couldn't reach the sports service</h3>
          <p className="text-zinc-400 max-w-sm">The live-events provider may be temporarily down or its address changed. Try again in a moment.</p>
          <button
            onClick={loadData}
            tabIndex={0}
            data-tv-focusable
            className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-amber-950 font-bold rounded-xl hover:bg-amber-400 transition-colors"
          >
            <RefreshCw className="w-5 h-5" /> Retry
          </button>
        </div>
      ) : visibleMatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center text-zinc-400">
          <CalendarClock className="w-10 h-10 text-zinc-600" />
          <p>{category === 'live' ? 'No events are live right now.' : 'Nothing scheduled in this category today.'}</p>
          {category === 'live' && (
            <button onClick={() => setCategory('all')} className="text-amber-500 font-semibold hover:text-amber-400" tabIndex={0} data-tv-focusable>
              See today's full schedule →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {visibleMatches.map((m) => {
            const isLive = liveIds.has(m.id);
            const home = m.teams?.home;
            const away = m.teams?.away;
            const time = new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div
                key={m.id}
                onClick={() => openMatch(m)}
                tabIndex={0}
                data-tv-focusable
                role="button"
                aria-label={m.title}
                className="group relative bg-zinc-900/60 border border-white/5 rounded-3xl p-5 hover:bg-zinc-800 transition-all duration-300 cursor-pointer flex flex-col focus:outline-none overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity rounded-3xl" />

                <div className="flex items-center justify-between mb-4 z-10">
                  <span className="px-2.5 py-1 bg-white/5 rounded-lg text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                    {SPORT_LABELS[m.category] || m.category}
                  </span>
                  {isLive ? (
                    <div className="flex items-center gap-1.5 bg-red-500/10 text-red-500 px-2.5 py-1 rounded-full border border-red-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
                    </div>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-400">
                      <CalendarClock className="w-3.5 h-3.5" /> {time}
                    </span>
                  )}
                </div>

                {home?.name && away?.name ? (
                  <div className="flex items-center justify-center gap-3 md:gap-4 py-3 z-10">
                    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                      {home.badge ? (
                        <img src={badgeUrl(home.badge)} alt="" className="w-12 h-12 object-contain" loading="lazy" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-zinc-800" />
                      )}
                      <span className="text-xs font-semibold text-white text-center line-clamp-2">{home.name}</span>
                    </div>
                    <span className="text-zinc-500 font-bold text-sm shrink-0">vs</span>
                    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                      {away.badge ? (
                        <img src={badgeUrl(away.badge)} alt="" className="w-12 h-12 object-contain" loading="lazy" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-zinc-800" />
                      )}
                      <span className="text-xs font-semibold text-white text-center line-clamp-2">{away.name}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-3 z-10 min-h-[72px]">
                    {m.poster ? (
                      <img src={posterUrl(m)} alt="" className="w-16 h-10 object-cover rounded-md bg-zinc-800" loading="lazy" />
                    ) : null}
                    <h3 className="text-base font-bold text-white leading-tight line-clamp-2 group-hover:text-amber-400 transition-colors">
                      {m.title}
                    </h3>
                  </div>
                )}

                <button className="mt-4 w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold bg-white/10 text-white group-hover:bg-amber-500 group-hover:text-amber-950 transition-all z-10 pointer-events-none">
                  <Play className="w-4 h-4 fill-current" />
                  {isLive ? 'Watch Live' : 'View Streams'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
