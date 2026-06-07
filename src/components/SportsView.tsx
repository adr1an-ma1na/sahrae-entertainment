import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Trophy, Play, X, Maximize, Loader2, Radio, Tv, Clapperboard, CalendarClock, Search } from 'lucide-react';
import Hls from 'hls.js';

/**
 * Live Sports — full DaddyLive coverage, resolved ON-DEVICE.
 *
 * DaddyLive's stream domains block datacenter IPs, so the app does it all on the
 * phone's own (residential) IP via native endpoints:
 *   /__ddfetch   — passthrough fetch for the (no-CORS) schedule JSON
 *   /__ddresolve — resolves a channel to its live newkso.ru .m3u8 and serves it
 * Every event also offers its sport's verified free HD channel as a fallback.
 */

const SCHEDULE_URL = 'https://daddylive.eu/cache/tv/tv.json';
const ddFetch = (url: string) => `https://localhost/__ddfetch?u=${encodeURIComponent(url)}`;
const ddResolve = (channelId: string) => `https://localhost/__ddresolve?id=${encodeURIComponent(channelId)}`;

// ── Verified always-free HD channels (fallback + Channels tab) ──
interface Channel { name: string; category: 'Football' | 'Combat' | 'Cricket' | 'Tennis' | 'Motorsport' | 'General'; desc: string; url: string }
const CHANNELS: Channel[] = [
  { name: 'beIN Sports XTRA', category: 'Football', desc: 'Football & global sports', url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8' },
  { name: 'FIFA+', category: 'Football', desc: 'Football, live & archive', url: 'https://a62dad94.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0ZJRkFQbHVzRW5nbGlzaF9ITFM/playlist.m3u8' },
  { name: 'Real Madrid TV', category: 'Football', desc: 'Los Blancos 24/7', url: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8' },
  { name: 'CazeTV', category: 'Football', desc: 'Football & more', url: 'https://dfr80qz435crc.cloudfront.net/MNOP/Amagi/Caze/Caze_TV_BR/Caze_TV.m3u8' },
  { name: 'DAZN Combat', category: 'Combat', desc: 'Boxing, MMA & combat', url: 'https://dazn-combat-rakuten.amagi.tv/hls/amagi_hls_data_rakutenAA-dazn-combat-rakuten/CDN/master.m3u8' },
  { name: 'GLORY Kickboxing', category: 'Combat', desc: 'Kickboxing events', url: 'https://6f972d29.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0dsb3J5S2lja2JveGluZ19ITFM/playlist.m3u8' },
  { name: 'Cricket Gold', category: 'Cricket', desc: 'Cricket, all formats', url: 'https://streams2.sofast.tv/ptnr-yupptv/title-cricketgold/v1/master/611d79b11b77e2f571934fd80ca1413453772ac7/b2048bb8-1686-4432-aa50-647245383e0c/manifest.m3u8' },
  { name: 'Tennis Channel', category: 'Tennis', desc: 'ATP / WTA tennis', url: 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01444-tennischannelth-tennischannelnl-samsungnl/playlist.m3u8' },
  { name: 'Red Bull TV', category: 'Motorsport', desc: 'Motorsport & action', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8' },
  { name: 'ESPN8: The Ocho', category: 'General', desc: 'Wild & wonderful sports', url: 'https://d3b6q2ou5kp8ke.cloudfront.net/ESPNTheOcho.m3u8' },
  { name: 'Stadium', category: 'General', desc: 'Live US sports', url: 'https://wurl120sports.global.transmit.live/hls/679a907dce42a042c23ace37/v1/stadium_gracenote/samsung_us/latest/main/hls/playlist.m3u8' },
  { name: 'Fubo Sports', category: 'General', desc: 'Live sports & talk', url: 'https://dnf08l6u6uxnz.cloudfront.net/master.m3u8' },
];
function channelForSport(sport: string): Channel {
  let cat: Channel['category'] = 'General';
  if (sport === 'football') cat = 'Football';
  else if (sport === 'fight') cat = 'Combat';
  else if (sport === 'cricket') cat = 'Cricket';
  else if (sport === 'tennis') cat = 'Tennis';
  else if (sport === 'motor-sports') cat = 'Motorsport';
  return CHANNELS.find((c) => c.category === cat) || CHANNELS[0];
}

const SPORT_LABELS: Record<string, string> = {
  football: 'Football', 'american-football': 'NFL', basketball: 'Basketball', baseball: 'Baseball',
  hockey: 'Hockey', 'motor-sports': 'Motorsport', fight: 'Combat', tennis: 'Tennis', cricket: 'Cricket',
  golf: 'Golf', rugby: 'Rugby', darts: 'Darts', other: 'Other',
};

function normCat(cat: string): string {
  const c = (cat || '').toLowerCase();
  if (/soccer|football/.test(c) && !/american/.test(c)) return 'football';
  if (/american football|nfl/.test(c)) return 'american-football';
  if (/basket/.test(c)) return 'basketball';
  if (/tennis/.test(c)) return 'tennis';
  if (/cricket/.test(c)) return 'cricket';
  if (/motor|racing|f1|formula|moto/.test(c)) return 'motor-sports';
  if (/fight|boxing|mma|ufc|wwe|wrestl|combat/.test(c)) return 'fight';
  if (/golf/.test(c)) return 'golf';
  if (/rugby/.test(c)) return 'rugby';
  if (/baseball/.test(c)) return 'baseball';
  if (/hockey/.test(c)) return 'hockey';
  if (/darts/.test(c)) return 'darts';
  return 'other';
}

function timeToEpoch(hhmm: string): number {
  try {
    const [h, m] = (hhmm || '').split(':').map(Number);
    const d = new Date();
    d.setUTCHours(h, m, 0, 0);
    return d.getTime();
  } catch {
    return Date.now();
  }
}

interface DEvent {
  id: string;
  title: string;
  category: string;
  date: number;
  live: boolean;
  channels: { name: string; id: string }[];
}

function parseSchedule(json: any): DEvent[] {
  const out: DEvent[] = [];
  const now = Date.now();
  let n = 0;
  for (const cats of Object.values(json || {})) {
    for (const [cat, evs] of Object.entries(cats as any)) {
      if (!Array.isArray(evs)) continue;
      for (const ev of evs as any[]) {
        const channels = [...(ev.channels || []), ...(ev.channels2 || [])]
          .filter((c) => c && c.channel_id)
          .map((c) => ({ name: String(c.channel_name || ''), id: String(c.channel_id) }))
          .slice(0, 5);
        if (!channels.length) continue;
        const date = timeToEpoch(ev.time);
        out.push({
          id: `dl-${n++}`,
          title: String(ev.event || '').trim(),
          category: normCat(cat),
          date,
          live: date - 600000 <= now && now <= date + 4 * 3600 * 1000,
          channels,
        });
      }
    }
  }
  return out;
}

// ── Native HLS player ──
const HLSPlayer = ({ src }: { src: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, manifestLoadingTimeOut: 25000, levelLoadingTimeOut: 25000 });
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

interface Playing { title: string; sources: { label: string; url: string }[]; idx: number; }

export default function SportsView() {
  const [tab, setTab] = useState<'events' | 'channels'>('events');
  const [events, setEvents] = useState<DEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [sport, setSport] = useState('all');
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [resolving, setResolving] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 14000);
    try {
      const res = await fetch(`${ddFetch(SCHEDULE_URL)}&t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('schedule');
      const json = await res.json();
      const parsed = parseSchedule(json);
      parsed.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || a.date - b.date);
      setEvents(parsed);
    } catch {
      setError(true);
    } finally {
      clearTimeout(to);
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 300000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && playing) setPlaying(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) playerRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  const eventTime = (d: number) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const openEvent = (m: DEvent) => {
    const ch = channelForSport(m.category);
    const sources = [
      ...m.channels.map((c) => ({ label: c.name || 'Stream', url: ddResolve(c.id) })),
      { label: `📺 ${ch.name}`, url: ch.url },
    ];
    setResolving(true);
    setPlaying({ title: m.title, sources, idx: 0 });
    // The native resolver does several round-trips; give it a moment of UI feedback.
    setTimeout(() => setResolving(false), 1500);
  };

  const sportsPresent: string[] = useMemo(() => {
    const order = ['football', 'basketball', 'fight', 'motor-sports', 'tennis', 'cricket', 'american-football', 'baseball', 'hockey', 'golf', 'rugby', 'darts', 'other'];
    const arr = Array.from(new Set<string>(events.map((m) => m.category)));
    arr.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
    return arr;
  }, [events]);
  const filters = ['all', 'live', ...sportsPresent];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events
      .filter((m) => (sport === 'live' ? m.live : sport === 'all' ? true : m.category === sport))
      .filter((m) => !q || m.title.toLowerCase().includes(q));
  }, [events, sport, search]);

  const activeUrl = playing ? playing.sources[playing.idx]?.url : undefined;

  return (
    <div className="pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12 relative">
      {/* Player */}
      {playing && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-sm p-3 md:p-10">
          <div className="w-full max-w-5xl flex flex-col gap-3">
            <div ref={playerRef} className="w-full aspect-video bg-black rounded-lg shadow-2xl overflow-hidden relative border border-white/10">
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
              {resolving && (
                <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 text-zinc-400 bg-black/60"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /><span className="text-sm">Connecting to live stream…</span></div>
              )}
              {activeUrl ? <HLSPlayer src={activeUrl} /> : null}
            </div>
            {playing.sources.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mr-1">Sources:</span>
                {playing.sources.map((s, i) => (
                  <button key={`${s.label}-${i}`} onClick={() => { setResolving(true); setPlaying({ ...playing, idx: i }); setTimeout(() => setResolving(false), 1500); }} tabIndex={0} data-tv-focusable
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${i === playing.idx ? 'bg-amber-500 text-amber-950 border-amber-500' : 'bg-zinc-800/80 text-zinc-300 border-white/10 hover:bg-zinc-700'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-zinc-500 flex items-center gap-2"><Radio className="w-3.5 h-3.5" /> If a source doesn't load, try another — the 📺 channel is the always-reliable fallback.</p>
          </div>
        </div>
      )}

      {/* Header + tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20"><Trophy className="w-6 h-6 text-white" /></div>
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">Live Sports</h2>
            <p className="text-sm text-zinc-400">Full schedule · F1 · Premier League · La Liga · Cricket · Tennis · NBA · UFC</p>
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

      {tab === 'events' && loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-zinc-400"><Loader2 className="w-10 h-10 animate-spin text-amber-500" /><span>Loading today's full schedule…</span></div>
      ) : tab === 'events' ? (
        error || events.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3 text-center">
            <Radio className="w-10 h-10 text-zinc-600" />
            <p className="text-zinc-400 max-w-sm">Couldn't load the schedule. The Channels tab always has live HD sport.</p>
            <button onClick={load} tabIndex={0} data-tv-focusable className="px-6 py-3 bg-amber-500 text-amber-950 font-bold rounded-xl hover:bg-amber-400">Retry</button>
          </div>
        ) : (
          <>
            <div className="relative mb-4 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams, leagues, events…"
                className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500" />
            </div>
            <div className="flex overflow-x-auto gap-2 pb-2 mb-6 scrollbar-hide">
              {filters.map((f) => (
                <button key={f} onClick={() => setSport(f)} tabIndex={0} data-tv-focusable
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${sport === f ? 'bg-white text-zinc-950 shadow-md' : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                  {f === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  {f === 'all' ? 'All' : f === 'live' ? 'Live Now' : SPORT_LABELS[f] || f}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="text-zinc-500 py-10 text-center">No events match. Try another sport or the Channels tab.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visible.map((m) => (
                  <div key={m.id} onClick={() => openEvent(m)} tabIndex={0} data-tv-focusable role="button" aria-label={m.title}
                    className="group relative bg-zinc-900/60 border border-white/5 rounded-2xl p-4 hover:bg-zinc-800 hover:border-amber-500/30 transition-all cursor-pointer focus:outline-none">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-bold uppercase tracking-wider text-amber-400">{SPORT_LABELS[m.category] || m.category}</span>
                      {m.live ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-red-500"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-400"><CalendarClock className="w-3 h-3" /> {eventTime(m.date)}</span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 min-h-[40px] group-hover:text-amber-400 transition-colors">{m.title}</h3>
                    <button className="mt-3 w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-bold bg-white/10 text-white group-hover:bg-amber-500 group-hover:text-amber-950 transition-all pointer-events-none">
                      <Play className="w-4 h-4 fill-current" /> Watch
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 group-hover:bg-amber-900/20 group-hover:text-amber-900 font-bold">{m.channels.length} {m.channels.length === 1 ? 'src' : 'srcs'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {CHANNELS.map((ch) => (
            <div key={ch.name} onClick={() => setPlaying({ title: ch.name, sources: [{ label: 'HD', url: ch.url }], idx: 0 })} tabIndex={0} data-tv-focusable role="button" aria-label={ch.name}
              className="group relative bg-zinc-900/60 border border-white/5 rounded-3xl p-5 hover:bg-zinc-800 transition-all cursor-pointer flex flex-col focus:outline-none">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform"><Tv className="w-5 h-5 text-zinc-400 group-hover:text-amber-500 transition-colors" /></div>
                <div className="flex items-center gap-1.5 bg-red-500/10 text-red-500 px-2.5 py-1 rounded-full border border-red-500/20"><div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /><span className="text-[10px] font-bold uppercase tracking-wider">On Air</span></div>
              </div>
              <div className="flex-grow">
                <h3 className="text-xl font-bold text-white leading-tight mb-1 group-hover:text-amber-400 transition-colors">{ch.name}</h3>
                <p className="text-sm text-zinc-400 mb-4">{ch.desc}</p>
                <span className="px-2.5 py-1 bg-white/5 rounded-lg text-xs font-medium text-zinc-400">{ch.category}</span>
              </div>
              <button className="mt-4 w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold bg-white/10 text-white group-hover:bg-amber-500 group-hover:text-amber-950 transition-all pointer-events-none"><Play className="w-4 h-4 fill-current" /> Watch Live</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
