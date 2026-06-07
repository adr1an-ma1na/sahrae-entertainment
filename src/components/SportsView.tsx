import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Trophy, Play, X, Maximize, Loader2, Radio, Tv, Search, Clapperboard, Flame } from 'lucide-react';
import Hls from 'hls.js';

/**
 * Live Sports — cricfy-style.
 *
 * Live EVENTS (every sport & league — F1, MotoGP, all football leagues, cricket,
 * tennis, NBA, boxing…) and the premium broadcast CHANNELS that carry them (Sky
 * Sport F1, Sky Sport MotoGP, etc.) come from a community-maintained DaddyLive
 * playlist on GitHub. Each stream is played through the app's native HLS proxy
 * (/__hlsproxy) so it works despite the source's CORS / referer locks.
 *
 * A set of verified always-free HD channels is pinned as a reliable fallback.
 */

// Community-maintained playlists (GitHub raw = CORS-open & reachable).
const EVENTS_URLS = [
  'https://raw.githubusercontent.com/jamie-203/daddylivehd-m3u/main/daddylive-events.m3u8',
  'https://raw.githubusercontent.com/Josh9456/IPTV-m3u/main/daddylive-events.m3u8',
];
const CHANNELS_URLS = [
  'https://raw.githubusercontent.com/jamie-203/daddylivehd-m3u/main/daddylive-channels.m3u8',
  'https://raw.githubusercontent.com/Josh9456/IPTV-m3u/main/daddylive-channels.m3u8',
];

/** Route a stream through the native same-origin HLS proxy. */
const proxied = (url: string) => `https://localhost/__hlsproxy?u=${encodeURIComponent(url)}`;

// Verified always-free HD channels (play direct — proven reliable).
interface FreeChannel { name: string; desc: string; url: string; }
const FREE_CHANNELS: FreeChannel[] = [
  { name: 'beIN Sports XTRA', desc: 'Football & global sports', url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8' },
  { name: 'FIFA+', desc: 'Football, live & archive', url: 'https://a62dad94.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0ZJRkFQbHVzRW5nbGlzaF9ITFM/playlist.m3u8' },
  { name: 'Real Madrid TV', desc: 'Los Blancos 24/7', url: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8' },
  { name: 'DAZN Combat', desc: 'Boxing, MMA & combat', url: 'https://dazn-combat-rakuten.amagi.tv/hls/amagi_hls_data_rakutenAA-dazn-combat-rakuten/CDN/master.m3u8' },
  { name: 'Cricket Gold', desc: 'Cricket, all formats', url: 'https://streams2.sofast.tv/ptnr-yupptv/title-cricketgold/v1/master/611d79b11b77e2f571934fd80ca1413453772ac7/b2048bb8-1686-4432-aa50-647245383e0c/manifest.m3u8' },
  { name: 'Tennis Channel', desc: 'ATP / WTA tennis', url: 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01444-tennischannelth-tennischannelnl-samsungnl/playlist.m3u8' },
  { name: 'Red Bull TV', desc: 'Motorsport & action', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8' },
  { name: 'ESPN8: The Ocho', desc: 'Wild & wonderful sports', url: 'https://d3b6q2ou5kp8ke.cloudfront.net/ESPNTheOcho.m3u8' },
];

interface RawEntry { group: string; name: string; source: string; url: string; }
interface SportEvent { name: string; group: string; sources: { label: string; url: string }[]; }

function parseM3U(text: string): RawEntry[] {
  const out: RawEntry[] = [];
  let pending: { group: string; name: string; source: string } | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF')) {
      const group = line.match(/group-title="([^"]*)"/)?.[1] || 'Other';
      const title = line.slice(line.lastIndexOf(',') + 1).trim();
      const m = title.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
      pending = { group, name: (m?.[1] || title).trim(), source: (m?.[2] || '').trim(), };
    } else if (line && !line.startsWith('#') && line.includes('://') && pending) {
      out.push({ ...pending, url: line });
      pending = null;
    }
  }
  return out;
}

function groupEvents(entries: RawEntry[]): SportEvent[] {
  const map = new Map<string, SportEvent>();
  for (const e of entries) {
    const key = `${e.group}|${e.name}`;
    let ev = map.get(key);
    if (!ev) { ev = { name: e.name, group: e.group, sources: [] }; map.set(key, ev); }
    ev.sources.push({ label: e.source || `Server ${ev.sources.length + 1}`, url: e.url });
  }
  return Array.from(map.values());
}

async function fetchFirst(urls: string[]): Promise<string | null> {
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: 'no-store' });
      if (res.ok) {
        const t = await res.text();
        if (t.includes('#EXTM3U')) return t;
      }
    } catch { /* next */ }
  }
  return null;
}

// ── Native HLS player ──
const HLSPlayer = ({ src }: { src: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, manifestLoadingTimeOut: 20000, levelLoadingTimeOut: 20000 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else hls.destroy();
        }
      });
      return () => hls.destroy();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
    }
  }, [src]);
  return <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain bg-black" controls autoPlay playsInline />;
};

interface PlayingState { title: string; sources: { label: string; url: string }[]; idx: number; }

export default function SportsView() {
  const [tab, setTab] = useState<'events' | 'channels'>('events');
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [channels, setChannels] = useState<RawEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [group, setGroup] = useState<string>('ALL');
  const [eventSearch, setEventSearch] = useState('');
  const [channelSearch, setChannelSearch] = useState('');

  const [playing, setPlaying] = useState<PlayingState | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const [evText, chText] = await Promise.all([fetchFirst(EVENTS_URLS), fetchFirst(CHANNELS_URLS)]);
    if (!evText && !chText) { setError(true); setLoading(false); return; }
    if (evText) setEvents(groupEvents(parseM3U(evText)));
    if (chText) setChannels(parseM3U(chText));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && playing) setPlaying(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) playerContainerRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  const playFree = (c: FreeChannel) => setPlaying({ title: c.name, sources: [{ label: 'HD', url: c.url }], idx: 0 });
  const playProxied = (title: string, sources: { label: string; url: string }[]) =>
    setPlaying({ title, sources: sources.map((s) => ({ label: s.label, url: proxied(s.url) })), idx: 0 });

  const eventGroups = useMemo<string[]>(() => {
    const set = new Set<string>(events.map((e) => e.group));
    return ['ALL', ...Array.from(set)];
  }, [events]);

  const visibleEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase();
    return events.filter(
      (e) => (group === 'ALL' || e.group === group) && (!q || e.name.toLowerCase().includes(q)),
    );
  }, [events, group, eventSearch]);

  const channelResults = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    if (!q) return [];
    return channels.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 60);
  }, [channels, channelSearch]);

  const activeSrc = playing ? playing.sources[playing.idx]?.url : undefined;

  const prettyGroup = (g: string) => g.replace(/ EVENTS$/i, '').replace(/_/g, ' ');

  return (
    <div className="pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12 relative">
      {/* ── Player overlay ── */}
      {playing && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-sm p-3 md:p-10">
          <div className="w-full max-w-5xl flex flex-col gap-3">
            <div ref={playerContainerRef} className="w-full aspect-video bg-black rounded-lg shadow-2xl overflow-hidden relative border border-white/10">
              <div className="absolute top-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center gap-1.5 bg-red-500 text-white px-2.5 py-1 rounded-sm shrink-0"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span className="text-xs font-bold uppercase tracking-wider">Live</span></div>
                  <h3 className="text-white font-bold text-sm md:text-lg drop-shadow-md truncate">{playing.title}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={toggleFullScreen} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center border border-white/10"><Maximize className="w-5 h-5" /></button>
                  <button onClick={() => setPlaying(null)} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
                </div>
              </div>
              {activeSrc ? <HLSPlayer key={activeSrc} src={activeSrc} /> : null}
            </div>

            {playing.sources.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mr-1">Sources:</span>
                {playing.sources.map((s, i) => (
                  <button key={`${s.label}-${i}`} onClick={() => setPlaying({ ...playing, idx: i })} tabIndex={0} data-tv-focusable
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${i === playing.idx ? 'bg-amber-500 text-amber-950 border-amber-500' : 'bg-zinc-800/80 text-zinc-300 border-white/10 hover:bg-zinc-700'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-zinc-500 flex items-center gap-2"><Radio className="w-3.5 h-3.5" /> If a source buffers, try another. Big matches are also on the free HD channels.</p>
          </div>
        </div>
      )}

      {/* ── Header + tabs ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20"><Trophy className="w-6 h-6 text-white" /></div>
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">Live Sports</h2>
            <p className="text-sm text-zinc-400">F1 · MotoGP · Premier League · La Liga · Serie A · Cricket · Tennis · NBA & more</p>
          </div>
        </div>
        <div className="flex gap-1 bg-zinc-900/70 p-1 rounded-xl border border-white/5 self-start">
          {(['events', 'channels'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} tabIndex={0} data-tv-focusable
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${tab === t ? 'bg-amber-500 text-amber-950' : 'text-zinc-400 hover:text-white'}`}>
              {t === 'events' ? <><Clapperboard className="w-4 h-4" /> Live Events</> : <><Tv className="w-4 h-4" /> Channels</>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-zinc-400"><Loader2 className="w-10 h-10 animate-spin text-amber-500" /><span>Loading live sports…</span></div>
      ) : tab === 'events' ? (
        <>
          {error && events.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3 text-center">
              <Radio className="w-10 h-10 text-zinc-600" />
              <p className="text-zinc-400 max-w-sm">Couldn't load the live-events guide right now. The free HD channels (Channels tab) are always available.</p>
              <button onClick={load} tabIndex={0} data-tv-focusable className="px-6 py-3 bg-amber-500 text-amber-950 font-bold rounded-xl hover:bg-amber-400">Retry</button>
            </div>
          ) : (
            <>
              {/* search + group filters */}
              <div className="relative mb-4 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} placeholder="Search teams, leagues, events…"
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500" />
              </div>
              <div className="flex overflow-x-auto gap-2 pb-2 mb-6 scrollbar-hide">
                {eventGroups.map((g) => (
                  <button key={g} onClick={() => setGroup(g)} tabIndex={0} data-tv-focusable
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${group === g ? 'bg-white text-zinc-950 shadow-md' : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                    {g === 'ALL' ? 'All sports' : prettyGroup(g)}
                  </button>
                ))}
              </div>

              {visibleEvents.length === 0 ? (
                <p className="text-zinc-500 py-10 text-center">No events match. Try another sport or the Channels tab.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleEvents.map((ev, i) => (
                    <div key={`${ev.group}-${ev.name}-${i}`} onClick={() => playProxied(ev.name, ev.sources)} tabIndex={0} data-tv-focusable role="button" aria-label={ev.name}
                      className="group relative bg-zinc-900/60 border border-white/5 rounded-2xl p-4 hover:bg-zinc-800 hover:border-amber-500/30 transition-all cursor-pointer focus:outline-none">
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-bold uppercase tracking-wider text-amber-400 truncate max-w-[70%]">{prettyGroup(ev.group)}</span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-red-500"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE</span>
                      </div>
                      <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 min-h-[40px] group-hover:text-amber-400 transition-colors">{ev.name}</h3>
                      <button className="mt-3 w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-bold bg-white/10 text-white group-hover:bg-amber-500 group-hover:text-amber-950 transition-all pointer-events-none">
                        <Play className="w-4 h-4 fill-current" /> Watch
                        <span className="text-[10px] opacity-70">· {ev.sources.length} {ev.sources.length === 1 ? 'source' : 'sources'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* Free HD featured */}
          <div className="flex items-center gap-2 mb-3"><Flame className="w-4 h-4 text-amber-500" /><h3 className="text-lg font-bold text-white">Free HD Channels</h3><span className="text-xs text-zinc-500">· always reliable, ad-free</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
            {FREE_CHANNELS.map((ch) => (
              <div key={ch.name} onClick={() => playFree(ch)} tabIndex={0} data-tv-focusable role="button" aria-label={ch.name}
                className="group bg-zinc-900/60 border border-white/5 rounded-2xl p-4 hover:bg-zinc-800 transition-all cursor-pointer focus:outline-none">
                <div className="flex items-center justify-between mb-3">
                  <Tv className="w-5 h-5 text-zinc-400 group-hover:text-amber-500 transition-colors" />
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-500"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE</span>
                </div>
                <h4 className="text-sm font-bold text-white leading-tight mb-0.5 group-hover:text-amber-400 transition-colors">{ch.name}</h4>
                <p className="text-[11px] text-zinc-500 line-clamp-1">{ch.desc}</p>
              </div>
            ))}
          </div>

          {/* Search all premium channels */}
          <div className="flex items-center gap-2 mb-3"><Tv className="w-4 h-4 text-amber-500" /><h3 className="text-lg font-bold text-white">All Sports Channels</h3></div>
          <div className="relative mb-5 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input value={channelSearch} onChange={(e) => setChannelSearch(e.target.value)} placeholder="Search Sky Sports F1, TNT, ESPN, beIN…"
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>
          {channelSearch.trim() === '' ? (
            <p className="text-zinc-500 text-sm">Type a channel name to find Sky Sport F1/MotoGP, TNT Sports, ESPN, beIN and {channels.length}+ more.</p>
          ) : channelResults.length === 0 ? (
            <p className="text-zinc-500 text-sm">No channels match "{channelSearch}".</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {channelResults.map((c, i) => (
                <div key={`${c.name}-${i}`} onClick={() => playProxied(c.name, [{ label: 'HD', url: c.url }])} tabIndex={0} data-tv-focusable role="button" aria-label={c.name}
                  className="group flex items-center justify-between gap-3 bg-zinc-900/60 border border-white/5 rounded-xl p-3 hover:bg-zinc-800 hover:border-amber-500/30 transition-all cursor-pointer focus:outline-none">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate group-hover:text-amber-400 transition-colors">{c.name}</h4>
                    <p className="text-[10px] text-zinc-500 truncate">{c.group}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-white/10 group-hover:bg-amber-500 group-hover:text-amber-950 text-white flex items-center justify-center shrink-0 transition-colors"><Play className="w-4 h-4 fill-current" /></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
