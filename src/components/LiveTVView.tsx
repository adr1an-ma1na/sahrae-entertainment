import { useState, useRef, useEffect, useMemo } from 'react';
import Hls from 'hls.js';
import { X, Maximize, Search, Heart, RadioTower, Loader2, WifiOff } from 'lucide-react';
import { probeHls, probeAll } from '../services/streamHealth';

type Health = 'checking' | 'ok' | 'dead';

interface Channel { name: string; country: string; category: Category; url: string }
type Category = 'News' | 'Sports' | 'Documentary' | 'Science' | 'Music' | 'Kids' | 'Lifestyle';

// Verified, working free HLS broadcasts (probed live). Broadcaster-official feeds
// (Al Jazeera, DW, France 24, NASA, NHK, TRT, CGTN, Red Bull) are the most stable.
const CHANNELS: Channel[] = [
  // News
  { name: 'Al Jazeera English', country: 'Qatar', category: 'News', url: 'https://live-hls-web-aje.getaj.net/AJE/01.m3u8' },
  { name: 'Al Jazeera Arabic', country: 'Qatar', category: 'News', url: 'https://live-hls-web-aja.getaj.net/AJA/01.m3u8' },
  { name: 'Sky News', country: 'UK', category: 'News', url: 'https://skynews2-plutolive-vo.akamaized.net/cdhlsskynewsamericas/1013/latest.m3u8' },
  { name: 'Bloomberg TV', country: 'USA', category: 'News', url: 'https://bloomberg-bloomberg-1-gb.samsung.wurl.tv/playlist.m3u8' },
  { name: 'DW English', country: 'Germany', category: 'News', url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8' },
  { name: 'France 24', country: 'France', category: 'News', url: 'https://static.france24.com/live/F24_EN_HI_HLS/live_web.m3u8' },
  { name: 'TRT World', country: 'Turkey', category: 'News', url: 'https://tv-trtworld.live.trt.com.tr/master_720.m3u8' },
  { name: 'CGTN', country: 'China', category: 'News', url: 'https://news.cgtn.com/resource/live/english/cgtn-news.m3u8' },
  { name: 'CNA', country: 'Singapore', category: 'News', url: 'https://d2e1asnsl7br7b.cloudfront.net/7782e205e72f43aeb4a48ec97f66ebbe/index.m3u8' },
  { name: 'WION', country: 'India', category: 'News', url: 'https://d7x8z4yuq42qn.cloudfront.net/index_7.m3u8' },
  { name: 'Euronews', country: 'Europe', category: 'News', url: 'https://euronews-euronews-world-1-gb.samsung.wurl.tv/playlist.m3u8' },
  { name: 'CBS News', country: 'USA', category: 'News', url: 'https://cbsn-us-cbsnstream.cbsnstream.cbsnews.com/out/v1/55a8648e840f4fa9b0d5b85d6c8f9f9a/master.m3u8' },
  { name: 'ABC News', country: 'Australia', category: 'News', url: 'https://abc-iview-coombe.akamaized.net/hls/live/2038312/2038312_3132/index.m3u8' },
  { name: 'NHK World', country: 'Japan', category: 'News', url: 'https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp-en/index.m3u8' },
  // Sports
  { name: 'Red Bull TV', country: 'Global', category: 'Sports', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8' },
  { name: 'beIN Sports XTRA', country: 'Global', category: 'Sports', url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8' },
  { name: 'FIFA+', country: 'Global', category: 'Sports', url: 'https://a62dad94.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0ZJRkFQbHVzRW5nbGlzaF9ITFM/playlist.m3u8' },
  { name: 'Tennis Channel', country: 'Global', category: 'Sports', url: 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01444-tennischannelth-tennischannelnl-samsungnl/playlist.m3u8' },
  { name: 'Real Madrid TV', country: 'Spain', category: 'Sports', url: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8' },
  // Documentary / Science
  { name: 'DW Documentary', country: 'Germany', category: 'Documentary', url: 'https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8' },
  { name: 'NASA TV', country: 'USA', category: 'Science', url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8' },
  // Music
  { name: 'Trace Urban', country: 'France', category: 'Music', url: 'https://laso3-tracetv.amagi.tv/hls/amagi_hls_data_traceTV-traceurban/CDN/master.m3u8' },
  { name: 'Vevo Dance', country: 'Global', category: 'Music', url: 'https://amg00549-vevo-amg00549c4-samsung-it-2521.playouts.now.amagi.tv/playlist.m3u8' },
  { name: 'Stingray Classica', country: 'Canada', category: 'Music', url: 'https://stingray-classica-1-de.samsung.wurl.tv/playlist.m3u8' },
  // Lifestyle / Kids
  { name: 'Fashion TV', country: 'France', category: 'Lifestyle', url: 'https://fashiontv-fashiontv-1-eu.rakuten.wurl.tv/playlist.m3u8' },
  { name: 'ZooMoo Kids', country: 'Global', category: 'Kids', url: 'https://amg01006-amg01006c1-samsung-it-2110.playouts.now.amagi.tv/playlist.m3u8' },
];

const CAT_STYLE: Record<Category, string> = {
  News: 'from-sky-500 to-blue-700',
  Sports: 'from-emerald-500 to-teal-700',
  Documentary: 'from-cyan-500 to-teal-700',
  Science: 'from-indigo-500 to-violet-700',
  Music: 'from-rose-500 to-fuchsia-700',
  Kids: 'from-orange-400 to-amber-600',
  Lifestyle: 'from-pink-500 to-rose-700',
};
const initials = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const proxied = (u: string) => `https://localhost/__hlsproxy?u=${encodeURIComponent(u)}`;

const FAV_KEY = 'sahrae.livetv.fav.v1';
const RECENT_KEY = 'sahrae.livetv.recent.v1';

// Robust player: tries the stream direct, then through the HLS proxy, then reports offline.
function HLSPlayer({ src, onOffline }: { src: string; onOffline: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const offRef = useRef(onOffline);
  offRef.current = onOffline;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let usingProxy = false;
    let started = false;
    let hls: Hls | null = null;

    const startWatchdog = () => setTimeout(() => { if (!started) attempt(true); }, 13000);
    let watchdog = startWatchdog();

    const attempt = (escalate: boolean) => {
      if (escalate && usingProxy) { cleanup(); offRef.current(); return; }
      if (escalate) usingProxy = true;
      clearTimeout(watchdog);
      const url = usingProxy ? proxied(src) : src;
      if (hls) { hls.destroy(); hls = null; }
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true, lowLatencyMode: false,
          backBufferLength: 90, maxBufferLength: 60, maxMaxBufferLength: 180,
          maxBufferSize: 120 * 1000 * 1000, maxBufferHole: 0.5, startFragPrefetch: true,
          liveSyncDurationCount: 4, liveMaxLatencyDurationCount: 18,
          manifestLoadingTimeOut: 15000, manifestLoadingMaxRetry: 4,
          levelLoadingTimeOut: 15000, levelLoadingMaxRetry: 4,
          fragLoadingTimeOut: 30000, fragLoadingMaxRetry: 8, nudgeMaxRetry: 10,
          startLevel: -1, abrEwmaDefaultEstimate: 1_200_000,
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        hls.on(Hls.Events.FRAG_BUFFERED, () => { started = true; });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          const dead = String(data.details || '').includes('manifestLoad');
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
          else if (dead) attempt(true);
          else hls?.startLoad();
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => {});
      }
      watchdog = startWatchdog();
    };
    const cleanup = () => { clearTimeout(watchdog); if (hls) hls.destroy(); };
    attempt(false);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  return <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain bg-black" controls autoPlay playsInline />;
}

export default function LiveTVView() {
  const [cat, setCat] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Channel | null>(null);
  const [offline, setOffline] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  const [favs, setFavs] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } });
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } });

  // On-device health: probe every channel through the proxy on the user's real
  // network and hide any that don't return a playlist — so a listed channel
  // always plays. Dead ones are hidden ONLY once probing has proven it works
  // here (≥1 healthy), so a probe-hostile environment never blanks the list.
  const [health, setHealth] = useState<Record<string, Health>>(() => Object.fromEntries(CHANNELS.map((c) => [c.url, 'checking' as Health])));
  useEffect(() => {
    let cancelled = false;
    probeAll(CHANNELS, (c) => c.url, (c) => probeHls(proxied(c.url)), (url, ok) => {
      if (!cancelled) setHealth((h) => ({ ...h, [url]: ok ? 'ok' : 'dead' }));
    }, 5);
    return () => { cancelled = true; };
  }, []);
  const probingWorks = useMemo(() => Object.values(health).some((v) => v === 'ok'), [health]);
  const isDead = (url: string) => probingWorks && health[url] === 'dead';

  const cats = ['All', 'Favorites', ...Array.from(new Set<string>(CHANNELS.map((c) => c.category)))];

  const toggleFav = (name: string) => setFavs((prev) => { const n = prev.includes(name) ? prev.filter((x) => x !== name) : [name, ...prev]; try { localStorage.setItem(FAV_KEY, JSON.stringify(n)); } catch { /* */ } return n; });

  const open = (ch: Channel) => {
    setActive(ch); setOffline(false);
    setRecent((prev) => { const n = [ch.name, ...prev.filter((x) => x !== ch.name)].slice(0, 8); try { localStorage.setItem(RECENT_KEY, JSON.stringify(n)); } catch { /* */ } return n; });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHANNELS
      .filter((c) => !isDead(c.url))
      .filter((c) => (cat === 'Favorites' ? favs.includes(c.name) : cat === 'All' ? true : c.category === cat))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, query, favs, health, probingWorks]);

  const recentChannels = (recent.map((n) => CHANNELS.find((c) => c.name === n)).filter(Boolean) as Channel[]).filter((c) => !isDead(c.url));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && active) setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) playerRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  const renderCard = (ch: Channel) => (
    <div key={ch.name} tabIndex={0} data-tv-focusable role="button" aria-label={ch.name} onClick={() => open(ch)}
      className="card-lift tier-card group relative rounded-2xl overflow-hidden cursor-pointer focus:outline-none p-4 flex items-center gap-3">
      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${CAT_STYLE[ch.category]} flex items-center justify-center shrink-0 shadow-lg`}>
        <span className="text-white font-display font-extrabold text-lg">{initials(ch.name)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="live-dot w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-red-400">Live</span>
        </div>
        <h3 className="text-sm font-bold text-white truncate group-hover:text-amber-400 transition-colors">{ch.name}</h3>
        <p className="text-xs text-zinc-500 truncate">{ch.country} · {ch.category}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); toggleFav(ch.name); }} className={`p-2 rounded-full shrink-0 ${favs.includes(ch.name) ? 'text-amber-400' : 'text-zinc-600 hover:text-white'}`} aria-label="Favorite">
        <Heart className={`w-4 h-4 ${favs.includes(ch.name) ? 'fill-current' : ''}`} />
      </button>
    </div>
  );

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12 relative">
      {/* Aurora glow behind the header */}
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-64 -z-10 opacity-70"
        style={{ background: 'radial-gradient(60% 70% at 12% 0%, rgba(245,158,11,0.20), transparent 70%), radial-gradient(50% 60% at 85% 8%, rgba(244,63,94,0.16), transparent 72%)', filter: 'blur(8px)' }} />
      {/* Player */}
      {active && (
        <div role="dialog" data-tv-layer className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-sm p-3 md:p-10">
          <div className="w-full max-w-5xl">
            <div ref={playerRef} className="w-full aspect-video bg-black rounded-xl shadow-2xl overflow-hidden relative border border-white/10">
              <div className="absolute top-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center gap-1.5 bg-red-500 text-white px-2.5 py-1 rounded-sm shrink-0"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span className="text-xs font-bold uppercase tracking-wider">Live</span></div>
                  <h3 className="text-white font-bold text-sm md:text-lg truncate">{active.name}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={toggleFullScreen} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center border border-white/10"><Maximize className="w-5 h-5" /></button>
                  <button onClick={() => setActive(null)} tabIndex={0} data-tv-focusable data-tv-close className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
                </div>
              </div>
              {offline ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <WifiOff className="w-10 h-10 text-zinc-600" />
                  <p className="text-zinc-300 font-semibold">{active.name} is offline right now</p>
                  <p className="text-zinc-500 text-sm max-w-xs">This broadcaster's stream isn't live at the moment. Try another channel.</p>
                  <button onClick={() => setActive(null)} className="btn-gold px-5 py-2 rounded-full text-sm font-bold mt-2">Back to channels</button>
                </div>
              ) : (
                <>
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-600 -z-0"><Loader2 className="w-8 h-8 animate-spin" /></div>
                  <HLSPlayer src={active.url} onOffline={() => setOffline(true)} />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20"><RadioTower className="w-6 h-6 text-white" /></div>
          <div>
            <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Live TV</h2>
            <p className="text-sm text-zinc-400">{CHANNELS.length} channels · news, sport, documentary & more</p>
          </div>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search channels…" className="w-full glass rounded-full pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none" />
        </div>
      </div>

      {/* Categories */}
      <div className="flex overflow-x-auto gap-2 pb-2 mb-8 scrollbar-hide">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} tabIndex={0} data-tv-focusable
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${cat === c ? 'bg-white text-zinc-950 shadow-md' : 'chip text-zinc-300 hover:text-white'}`}>
            {c === 'Favorites' && <Heart className="w-3 h-3" />}{c}
          </button>
        ))}
      </div>

      {/* Recently watched */}
      {!query.trim() && cat === 'All' && recentChannels.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4"><span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" /><h3 className="text-xl font-display font-bold text-white tracking-tight">Recently Watched</h3></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{recentChannels.map(renderCard)}</div>
        </section>
      )}

      {/* Channels */}
      {visible.length === 0 ? (
        <p className="text-zinc-500 py-12 text-center">{cat === 'Favorites' ? 'No favorites yet — tap the heart on a channel.' : 'No channels match your search.'}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {visible.map(renderCard)}
        </div>
      )}
    </div>
  );
}
