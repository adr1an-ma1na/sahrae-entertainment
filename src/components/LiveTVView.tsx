import { useState, useRef, useEffect, useMemo } from 'react';
import Hls from 'hls.js';
import { X, Maximize, Search, Heart, RadioTower, Loader2, WifiOff } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import Coachmark from './Coachmark';
import { onChannelRequest } from '../services/voiceBus';

interface Channel { name: string; country: string; category: Category; url: string; kind?: 'hls' | 'yt' }
type Category = 'News' | 'Regional' | 'Sports' | 'Documentary' | 'Science' | 'Wildlife' | 'Anime' | 'Music' | 'Kids' | 'Lifestyle';

// News plays via each broadcaster's permanent YouTube live channel (kind: 'yt') —
// the most stable option since channel IDs never change. Everything else uses
// broadcaster-official / FAST HLS feeds (NASA, Red Bull, DW Documentary, etc.).
export const CHANNELS: Channel[] = [
  // News.
  //
  // TWO delivery kinds here, on purpose:
  //
  //  kind:'yt'  — YouTube's /embed/live_stream?channel=ID. Convenient, but it
  //    only renders while that channel happens to have an active, embeddable
  //    live stream. When it does not, the player shows "Error 153 - Video
  //    player configuration error" rather than failing gracefully. Verified
  //    2026-07-25: the channel IDs below are all correct, and these particular
  //    channels do serve a working embed.
  //
  //  (no kind) — a direct HLS master playlist, played by HLSPlayer. Used for
  //    every broadcaster whose YouTube embed returned Error 153 on 2026-07-25:
  //    Sky News, GB News, ABC News, CBS News, WION, CGTN and NHK World. These
  //    are 24/7 linear feeds, so they do not depend on someone at the
  //    broadcaster starting a stream. Each URL below was fetched and confirmed
  //    to return a valid #EXTM3U playlist before being committed - none were
  //    copied from memory or documentation.
  //
  // Every URL was additionally re-tested with fetch() FROM THE APP'S OWN ORIGIN,
  // not just with curl, because that is what exposes CORS. Two candidates passed
  // curl but failed in the browser and were swapped for CORS-clean equivalents:
  // GB News (simplestreamcdn -> amagi/Rakuten) and CBS News (a Pluto jmp2.uk
  // redirect whose target embeds a ~24h JWT -> CBS's own cbsnstream feed, which
  // has no token at all). In the APK these go through the native /__hlsproxy so
  // CORS is moot, but the PWA build fetches them directly and would have shown
  // two dead channels.
  { name: 'Al Jazeera English', country: 'Qatar', category: 'News', kind: 'yt', url: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1' },
  { name: 'Sky News', country: 'UK', category: 'News', url: 'https://xumo-drct-skynews-nc91a.fast.nbcuni.com/live/master.m3u8' },
  { name: 'DW News', country: 'Germany', category: 'News', kind: 'yt', url: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg&autoplay=1' },
  { name: 'France 24 English', country: 'France', category: 'News', kind: 'yt', url: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1' },
  { name: 'GB News', country: 'UK', category: 'News', url: 'https://rakutenaa-lightning-gbnews-rakuten-ccoa9.amagi.tv/playlist/rakutenAA-lightning-gbnews-rakuten/playlist.m3u8' },
  { name: 'Euronews English', country: 'Europe', category: 'News', kind: 'yt', url: 'https://www.youtube.com/embed/live_stream?channel=UCSrZ3UV4jOidv8ppoVuvW9Q&autoplay=1' },
  { name: 'TRT World', country: 'Turkey', category: 'News', kind: 'yt', url: 'https://www.youtube.com/embed/live_stream?channel=UC7fWeaHhqgM4Ry-RMpM2YYw&autoplay=1' },
  { name: 'ABC News Live', country: 'USA', category: 'News', url: 'https://abcnews-streams.akamaized.net/hls/live/2023560/abcnewshudson1/master.m3u8' },
  { name: 'CBS News', country: 'USA', category: 'News', url: 'https://cbsn-us.cbsnstream.cbsnews.com/out/v1/55a8648e8f134e82a470f83d562deeca/master.m3u8' },
  { name: 'NBC News NOW', country: 'USA', category: 'News', kind: 'yt', url: 'https://www.youtube.com/embed/live_stream?channel=UCeY0bbntWzzVIaj2z3QigXg&autoplay=1' },
  { name: 'CNA', country: 'Singapore', category: 'News', kind: 'yt', url: 'https://www.youtube.com/embed/live_stream?channel=UC83jt4dlz1Gjl58fzQrrKZg&autoplay=1' },
  { name: 'WION', country: 'India', category: 'News', url: 'https://d7x8z4yuq42qn.cloudfront.net/index_7.m3u8' },
  { name: 'CGTN', country: 'China', category: 'News', url: 'https://amg00405-rakutentv-cgtn-rakuten-i9tar.amagi.tv/master.m3u8' },
  { name: 'NHK World', country: 'Japan', category: 'News', url: 'https://masterpl.hls.nhkworld.jp/hls/w/live/smarttv.m3u8' },
  // Sports
  { name: 'Red Bull TV', country: 'Global', category: 'Sports', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8' },
  { name: 'beIN Sports XTRA', country: 'Global', category: 'Sports', url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8' },
  { name: 'FIFA+', country: 'Global', category: 'Sports', url: 'https://a62dad94.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0ZJRkFQbHVzRW5nbGlzaF9ITFM/playlist.m3u8' },
  { name: 'Tennis Channel', country: 'Global', category: 'Sports', url: 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01444-tennischannelth-tennischannelnl-samsungnl/playlist.m3u8' },
  { name: 'Real Madrid TV', country: 'Spain', category: 'Sports', url: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8' },
  // Added 2026-08-21. Every one is a legitimately FREE ad-supported (FAST)
  // channel on a real distribution platform — amagi, wurl, ottera, frequency,
  // or the broadcaster's own CDN. Each was fetched with curl AND re-tested with
  // fetch() from the app's own origin; three that passed curl were CORS-blocked
  // in the browser (Fubo Sports, SportsGrid, Trace Sport Stars) and were left
  // out rather than shipped as dead tiles.
  //
  // Motorsport / racing
  { name: 'Motorvision', country: 'Germany', category: 'Sports', url: 'https://stream.ads.ottera.tv/playlist.m3u8?network_id=535' },
  { name: 'FloRacing', country: 'USA', category: 'Sports', url: 'https://amg02278-amg02278c1-flosports-worldwide-7592.playouts.now.amagi.tv/playlist.m3u8' },
  { name: 'FUEL TV', country: 'Portugal', category: 'Sports', url: 'https://amg01074-fueltv-fueltvau-samsungau-g09kq.amagi.tv/playlist/amg01074-fueltv-fueltvau-samsungau/playlist.m3u8' },
  // Football
  { name: 'FIFA+ Women', country: 'Global', category: 'Sports', url: 'https://cffda8ff.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/U2Ftc3VuZy1nYl9GSUZBUGx1c3dvbWVuX0hMUw/playlist.m3u8' },
  { name: 'Sportitalia Solocalcio', country: 'Italy', category: 'Sports', url: 'https://italiansport-solocalcio-samsung.amagi.tv/playlist.m3u8' },
  { name: 'beIN Sports XTRA Español', country: 'Global', category: 'Sports', url: 'https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8' },
  // Multi-sport / combat / cricket
  { name: 'Swerve Sports', country: 'USA', category: 'Sports', url: 'https://linear-253.frequency.stream/mt/roku/253/hls/master/playlist.m3u8' },
  { name: "Women's Sports Network", country: 'USA', category: 'Sports', url: 'https://d39accvx65hq9o.cloudfront.net/Womens_Sports_Network.m3u8' },
  { name: 'Glory Kickboxing', country: 'Netherlands', category: 'Sports', url: 'https://6f972d29.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0dsb3J5S2lja2JveGluZ19ITFM/playlist.m3u8' },
  { name: 'Willow Sports', country: 'USA', category: 'Sports', url: 'https://d36r8jifhgsk5j.cloudfront.net/Willow_TV1080p.m3u8' },
  { name: 'DD Sports', country: 'India', category: 'Sports', url: 'https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/b17adfe543354fdd8d189b110617cddd/index.m3u8' },
  // Documentary / Science
  //
  // Every feed below was checked twice on 2026-07-26: once with curl for
  // liveness, then again with fetch() FROM THE APP'S OWN ORIGIN. The second
  // check is the one that matters and it is why several obvious-looking
  // candidates were rejected — Pluto (jmp2.uk), Curiosity NOW, Animax Asia and
  // Al Jazeera Documentary all serve fine to curl but send no CORS header, so
  // they play in the APK (native /__hlsproxy) and are dead on the web build.
  // Only CORS-clean feeds are listed, so a channel works on every surface.
  { name: 'DW Documentary', country: 'Germany', category: 'Documentary', url: 'https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8' },
  { name: 'Documentary Plus', country: 'USA', category: 'Documentary', url: 'https://1d153317c8db4250b3789601274e2402.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-887-DOCUMENTARYINTERNATIONAL-DOCUMENTARYPLUS/mt/documentaryplus/887/hls/master/playlist.m3u8' },
  { name: 'CGTN Documentary', country: 'China', category: 'Documentary', url: 'https://amg00405-rakutentv-cgtndocumentary-rakuten-0ql8j.amagi.tv/master.m3u8' },
  { name: 'Autentic History', country: 'Germany', category: 'Documentary', url: 'https://9e754fa707344ccca6d84955c8fcaf36.mediatailor.us-east-1.amazonaws.com/v1/master/44f73ba4d03e9607dcd9bebdcb8494d86964f1d8/RlaxxTV-eu_AutenticHistory/playlist.m3u8' },
  // Science. NOTE: the old "NASA TV" entry is gone. Its feed now returns 403,
  // and the only NASA-named stream in the public directories is a Macedonian
  // broadcaster that happens to be called Nasa TV — shipping that under a
  // USA/Science label would simply be wrong. Space Live is a real space channel.
  { name: 'Space Live', country: 'UK', category: 'Science', url: 'https://linear-1224.frequency.stream/dist/lg-uk/1224/hls/master/playlist.m3u8' },
  // Wildlife / nature
  { name: 'Love Nature', country: 'Global', category: 'Wildlife', url: 'https://pb-ehs1glsha1juy.akamaized.net/Love_Nature_4K.m3u8' },
  { name: 'WildEarth', country: 'South Africa', category: 'Wildlife', url: 'https://dqga3jatxofgx.cloudfront.net/WildEarth.m3u8' },
  { name: 'Real Wild', country: 'UK', category: 'Wildlife', url: 'https://cdn-apse1-prod.tsv2.amagi.tv/linear/amg00426-littledotstudio-realwildnz-samsungnz/playlist.m3u8' },
  // Anime / cartoons
  { name: 'Anime x HIDIVE', country: 'Global', category: 'Anime', url: 'https://d3f088nnrrvkwf.cloudfront.net/v1/amc_anime_x_hidive_1/samsungheadend_us/latest/main/hls/playlist.m3u8' },
  { name: 'FilmRise Anime', country: 'Global', category: 'Anime', url: 'https://dvu7aia8rjlfm.cloudfront.net/master.m3u8' },
  { name: 'Kartoon Channel', country: 'USA', category: 'Anime', url: 'https://d2z0ysa6dgxhlc.cloudfront.net/kchan.m3u8' },
  { name: 'Toon Goggles', country: 'Global', category: 'Anime', url: 'https://amg01329-otterainc-toongoggles-samsungau-ad-4c.amagi.tv/playlist/amg01329-otterainc-toongoggles-samsungau/playlist.m3u8' },
  // Music. "Lofi Girl Radio" is gone: it was a YouTube live_stream embed, which
  // now returns Error 153, and there is no CORS-clean lofi HLS equivalent. Lofi
  // is well covered by the Radio section instead.
  { name: 'Trace Urban', country: 'France', category: 'Music', url: 'https://channels.trace.plus/Traceprod/URBAN_AFRIC_FR_hd/index.m3u8' },
  // Renamed from "Vevo Dance": the working Vevo feed is the Pop channel, and
  // labelling it Dance would promise a genre it does not play.
  { name: 'Stingray Classica', country: 'Canada', category: 'Music', url: 'https://lotus.stingray.com/manifest/classica-cla008-montreal/samsungtvplus/master.m3u8' },
  // Lifestyle / Kids
  { name: 'Fashion TV', country: 'France', category: 'Lifestyle', url: 'https://edge-fast3.evrideo.tv/bfdbb576-83f7-11f0-9f89-0200170e3e04_1000028043_HLS/manifest.m3u8' },
  { name: 'ZooMoo Kids', country: 'Global', category: 'Kids', url: 'https://zoomoo-samsungau.amagi.tv/playlist.m3u8' },
  { name: 'ABC Kids', country: 'Australia', category: 'Kids', url: 'https://c.mjh.nz/abc-kids.m3u8' },
  { name: 'Akili Kids', country: 'Kenya', category: 'Kids', url: 'https://m6.livecdn.io/akilikids.co.ke/akilikids.smil/playlist.m3u8' },
];

const CAT_STYLE: Record<Category, string> = {
  News: 'from-sky-500 to-blue-700',
  Regional: 'from-red-500 to-amber-600',
  Sports: 'from-emerald-500 to-teal-700',
  Documentary: 'from-cyan-500 to-teal-700',
  Science: 'from-indigo-500 to-violet-700',
  Wildlife: 'from-lime-500 to-green-700',
  Anime: 'from-violet-500 to-purple-700',
  Music: 'from-rose-500 to-fuchsia-700',
  Kids: 'from-orange-400 to-amber-600',
  Lifestyle: 'from-pink-500 to-rose-700',
};
const initials = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const proxied = (u: string) =>
  Capacitor.isNativePlatform() ? `https://localhost/__hlsproxy?u=${encodeURIComponent(u)}` : u;

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
    let hls: Hls | null = null;
    let started = false;
    let attempt = 0;
    // Proxy FIRST — the native HLS proxy binds the CDN token to this device and
    // sidesteps CORS/mixed-content (exactly how Sports streams play). Only if the
    // proxy fails do we try the URL direct, then report offline.
    const urls = Capacitor.isNativePlatform() ? [proxied(src), src] : [src];
    let watchdog: ReturnType<typeof setTimeout>;

    const fail = () => {
      attempt += 1;
      if (attempt >= urls.length) { cleanup(); offRef.current(); return; }
      load(urls[attempt]);
    };

    const load = (url: string) => {
      clearTimeout(watchdog);
      started = false;
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
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls?.recoverMediaError(); return; }
          const transientNet = data.type === Hls.ErrorTypes.NETWORK_ERROR && !String(data.details || '').includes('manifestLoad');
          if (transientNet) hls?.startLoad(); else fail();
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => {});
        video.onerror = () => fail();
      }
      watchdog = setTimeout(() => { if (!started) fail(); }, 12000);
    };
    const cleanup = () => { clearTimeout(watchdog); if (hls) hls.destroy(); };
    load(urls[0]);
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

  // Show EVERY channel, always. The old on-device probe hid any channel that
  // didn't return a playlist to it — but the proxy probe throws false negatives,
  // so good channels (Al Jazeera etc.) flashed then vanished. A listed channel
  // that's genuinely down just shows the player's "offline, try another" state.

  const cats = ['All', 'Favorites', ...Array.from(new Set<string>(CHANNELS.map((c) => c.category)))];

  const toggleFav = (name: string) => setFavs((prev) => { const n = prev.includes(name) ? prev.filter((x) => x !== name) : [name, ...prev]; try { localStorage.setItem(FAV_KEY, JSON.stringify(n)); } catch { /* */ } return n; });

  const open = (ch: Channel) => {
    setActive(ch); setOffline(false);
    setRecent((prev) => { const n = [ch.name, ...prev.filter((x) => x !== ch.name)].slice(0, 8); try { localStorage.setItem(RECENT_KEY, JSON.stringify(n)); } catch { /* */ } return n; });
  };

  // "Watch Sky News" opens that channel here. Subscribing (rather than reading
  // once on mount) means it works whether the command arrived before this view
  // existed or while the user was already looking at it.
  useEffect(() => onChannelRequest((wanted) => {
    const ch = CHANNELS.find((c) => c.name === wanted);
    if (ch) open(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHANNELS
      .filter((c) => (cat === 'Favorites' ? favs.includes(c.name) : cat === 'All' ? true : c.category === cat))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
  }, [cat, query, favs]);

  const recentChannels = (recent.map((n) => CHANNELS.find((c) => c.name === n)).filter(Boolean) as Channel[]);

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
              {/* Our controls sit CENTRED, not flush right. The embedded player
                  stacks its own volume / CC / quality buttons in the top-right
                  corner, so edge-anchored buttons landed on top of them and you
                  could not reach CC without hitting close. Centring separates
                  the two clusters entirely. */}
              <div className="absolute top-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-center">
                <div className="flex items-center gap-3 min-w-0 pr-28">
                  <div className="flex items-center gap-1.5 bg-red-500 text-white px-2.5 py-1 rounded-sm shrink-0"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span className="text-xs font-bold uppercase tracking-wider">Live</span></div>
                  <h3 className="text-white font-bold text-sm md:text-lg truncate">{active.name}</h3>
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 shrink-0">
                  <button onClick={toggleFullScreen} tabIndex={0} data-tv-focusable aria-label="Toggle full screen" className="w-10 h-10 rounded-full bg-black/60 hover:bg-white/20 text-white flex items-center justify-center border border-white/10 backdrop-blur"><Maximize className="w-5 h-5" /></button>
                  <button onClick={() => setActive(null)} tabIndex={0} data-tv-focusable data-tv-close aria-label="Close player" className="w-10 h-10 rounded-full bg-red-500/85 hover:bg-red-500 text-white flex items-center justify-center backdrop-blur"><X className="w-5 h-5" /></button>
                </div>
              </div>
              {offline ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <WifiOff className="w-10 h-10 text-zinc-600" />
                  <p className="text-zinc-300 font-semibold">{active.name} is offline right now</p>
                  <p className="text-zinc-500 text-sm max-w-xs">This broadcaster's stream isn't live at the moment. Try another channel.</p>
                  <button onClick={() => setActive(null)} className="btn-gold px-5 py-2 rounded-full text-sm font-bold mt-2">Back to channels</button>
                </div>
              ) : active.kind === 'yt' ? (
                <iframe
                  src={active.url}
                  title={active.name}
                  className="absolute inset-0 w-full h-full border-none bg-black"
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
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

      <Coachmark id="livetv" text="Tap any channel to start watching. The news channels stream live 24/7." />

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
        <p className="text-zinc-500 py-12 text-center">{cat === 'Favorites' ? 'No favorites yet, tap the heart on a channel.' : 'No channels match your search.'}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {visible.map(renderCard)}
        </div>
      )}
    </div>
  );
}
