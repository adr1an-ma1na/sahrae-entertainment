import { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Play, X, Maximize, Loader2, Radio, CalendarClock, Flame, Tv } from 'lucide-react';
import Hls from 'hls.js';

/**
 * Live Sports.
 *
 * PLAYBACK uses direct HLS sports channels (verified, ad-free, high quality)
 * played natively — the obfuscated event-embeds actively block in-app WebViews,
 * so we don't rely on them. The "Live Now" rail pulls today's live fixtures
 * from the open Streamed API purely to INFORM the user (sport, teams, kick-off
 * time, popularity); tapping a fixture filters the channels to that sport so
 * they can jump to a channel carrying it.
 */

// ── Reliable, verified sports channels (direct HLS) ──
interface Channel {
  name: string;
  category: 'Football' | 'Combat' | 'Cricket' | 'Tennis' | 'Motorsport' | 'General';
  desc: string;
  url: string;
}

const CHANNELS: Channel[] = [
  { name: 'beIN Sports XTRA', category: 'Football', desc: 'Football & global sports', url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8' },
  { name: 'FIFA+', category: 'Football', desc: 'Football, live & archive', url: 'https://a62dad94.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0ZJRkFQbHVzRW5nbGlzaF9ITFM/playlist.m3u8' },
  { name: 'Real Madrid TV', category: 'Football', desc: 'Los Blancos 24/7', url: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8' },
  { name: 'CazeTV', category: 'Football', desc: 'Football & more (BR)', url: 'https://dfr80qz435crc.cloudfront.net/MNOP/Amagi/Caze/Caze_TV_BR/Caze_TV.m3u8' },
  { name: 'DAZN Combat', category: 'Combat', desc: 'Boxing, MMA & combat', url: 'https://dazn-combat-rakuten.amagi.tv/hls/amagi_hls_data_rakutenAA-dazn-combat-rakuten/CDN/master.m3u8' },
  { name: 'GLORY Kickboxing', category: 'Combat', desc: 'Kickboxing events', url: 'https://6f972d29.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0dsb3J5S2lja2JveGluZ19ITFM/playlist.m3u8' },
  { name: 'Unbeaten Sports', category: 'Combat', desc: 'Boxing & combat sports', url: 'https://d1t5afz6qed3xk.cloudfront.net/Unbeaten.m3u8' },
  { name: 'Cricket Gold', category: 'Cricket', desc: 'Cricket, all formats', url: 'https://streams2.sofast.tv/ptnr-yupptv/title-cricketgold/v1/master/611d79b11b77e2f571934fd80ca1413453772ac7/b2048bb8-1686-4432-aa50-647245383e0c/manifest.m3u8' },
  { name: 'Tennis Channel', category: 'Tennis', desc: 'ATP / WTA tennis', url: 'https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01444-tennischannelth-tennischannelnl-samsungnl/playlist.m3u8' },
  { name: 'Red Bull TV', category: 'Motorsport', desc: 'Motorsport & action', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8' },
  { name: 'ACI Sport TV', category: 'Motorsport', desc: 'Racing & motorsport', url: 'https://webstream.multistream.it/memfs/e2cb3629-c1a2-495b-b43a-9eb386f04ed8.m3u8' },
  { name: 'ESPN8: The Ocho', category: 'General', desc: 'Wild & wonderful sports', url: 'https://d3b6q2ou5kp8ke.cloudfront.net/ESPNTheOcho.m3u8' },
  { name: 'Stadium', category: 'General', desc: 'Live US sports', url: 'https://wurl120sports.global.transmit.live/hls/679a907dce42a042c23ace37/v1/stadium_gracenote/samsung_us/latest/main/hls/playlist.m3u8' },
  { name: 'Fubo Sports', category: 'General', desc: 'Live sports & talk', url: 'https://dnf08l6u6uxnz.cloudfront.net/master.m3u8' },
  { name: 'World Poker Tour', category: 'General', desc: 'Poker tournaments', url: 'https://d39g1vxj2ef6in.cloudfront.net/v1/master/3fec3e5cac39a52b2132f9c66c83dae043dc17d4/prod-rakuten-stitched/playlist.m3u8?ads.xumo_channelId=88883102' },
];

const CATEGORIES = ['All', 'Football', 'Combat', 'Cricket', 'Tennis', 'Motorsport', 'General'] as const;

// ── Live events (informational) from the Streamed API ──
const API_DOMAINS = ['streamed.pk', 'streamed.su', 'streamed.st'];

interface Match {
  id: string;
  title: string;
  category: string;
  date: number;
  popular?: boolean;
  teams?: { home?: { name?: string }; away?: { name?: string } };
}

const SPORT_LABELS: Record<string, string> = {
  football: 'Football',
  'american-football': 'NFL',
  basketball: 'Basketball',
  baseball: 'Baseball',
  hockey: 'Hockey',
  'motor-sports': 'Motorsport',
  fight: 'Combat',
  tennis: 'Tennis',
  cricket: 'Cricket',
  golf: 'Golf',
  rugby: 'Rugby',
  other: 'Sport',
};

function categoryFromSport(sport: string): (typeof CATEGORIES)[number] {
  switch (sport) {
    case 'football': return 'Football';
    case 'fight': return 'Combat';
    case 'cricket': return 'Cricket';
    case 'tennis': return 'Tennis';
    case 'motor-sports': return 'Motorsport';
    default: return 'General';
  }
}

// ── Native HLS player ──
const HLSPlayer = ({ src }: { src: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
            case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
            default: hls.destroy(); break;
          }
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

export default function SportsView() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const [liveEvents, setLiveEvents] = useState<Match[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Load currently-live fixtures for the info rail.
  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    for (const d of API_DOMAINS) {
      try {
        const res = await fetch(`https://${d}/api/matches/live`, { cache: 'no-store' });
        if (!res.ok) continue;
        const live: Match[] = await res.json();
        live.sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0) || a.date - b.date);
        setLiveEvents(live.slice(0, 30));
        setEventsLoading(false);
        return;
      } catch {
        /* try next */
      }
    }
    setLiveEvents([]);
    setEventsLoading(false);
  }, []);

  useEffect(() => {
    loadEvents();
    const t = setInterval(loadEvents, 120000);
    return () => clearInterval(t);
  }, [loadEvents]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeChannel) setActiveChannel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeChannel]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const visibleChannels = category === 'All' ? CHANNELS : CHANNELS.filter((c) => c.category === category);

  const eventTime = (d: number) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const matchTitle = (m: Match) =>
    m.teams?.home?.name && m.teams?.away?.name ? `${m.teams.home.name} v ${m.teams.away.name}` : m.title;

  return (
    <div className="pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12 relative">
      {/* ── Player overlay ── */}
      {activeChannel && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-sm p-3 md:p-10">
          <div
            ref={playerContainerRef}
            className="w-full max-w-5xl aspect-video bg-black rounded-lg shadow-2xl overflow-hidden relative border border-white/10"
          >
            <div className="absolute top-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-center">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center gap-1.5 bg-red-500 text-white px-2.5 py-1 rounded-sm shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider">Live</span>
                </div>
                <h3 className="text-white font-bold text-sm md:text-lg drop-shadow-md truncate">{activeChannel.name}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={toggleFullScreen} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center transition-colors border border-white/10">
                  <Maximize className="w-5 h-5" />
                </button>
                <button onClick={() => setActiveChannel(null)} tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <HLSPlayer src={activeChannel.url} />
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Trophy className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white leading-tight">Live Sports</h2>
          <p className="text-sm text-zinc-400">Reliable HD channels · Football · Combat · Cricket · Tennis · Motorsport</p>
        </div>
      </div>

      {/* ── Live Now rail (informational) ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <h3 className="text-lg font-bold text-white">Live Now</h3>
          {!eventsLoading && <span className="text-xs text-zinc-500">· {liveEvents.length} events worldwide</span>}
        </div>

        {eventsLoading ? (
          <div className="flex items-center gap-3 text-zinc-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading live fixtures…
          </div>
        ) : liveEvents.length === 0 ? (
          <p className="text-sm text-zinc-500 py-2">No fixtures are live this minute — browse the channels below.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {liveEvents.map((m) => (
              <button
                key={m.id}
                onClick={() => setCategory(categoryFromSport(m.category))}
                tabIndex={0}
                data-tv-focusable
                className="shrink-0 w-60 text-left bg-zinc-900/70 border border-white/5 rounded-xl p-3 hover:bg-zinc-800 hover:border-amber-500/40 transition-colors focus:outline-none"
                title="Find a channel showing this sport"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    {SPORT_LABELS[m.category] || m.category}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                  </span>
                </div>
                <p className="text-sm font-semibold text-white leading-snug line-clamp-2 mb-2">{matchTitle(m)}</p>
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {eventTime(m.date)}</span>
                  {m.popular && <span className="flex items-center gap-1 text-amber-500"><Flame className="w-3 h-3" /> Popular</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Channel filters ── */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <h3 className="text-lg font-bold text-white flex items-center gap-2"><Tv className="w-5 h-5 text-amber-500" /> Sports Channels</h3>
        <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              tabIndex={0}
              data-tv-focusable
              className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                category === c ? 'bg-white text-zinc-950 shadow-md' : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Channels grid ── */}
      {visibleChannels.length === 0 ? (
        <p className="text-zinc-500 py-8 text-center">No channels in this category.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
          {visibleChannels.map((ch) => (
            <div
              key={ch.name}
              onClick={() => setActiveChannel(ch)}
              tabIndex={0}
              data-tv-focusable
              role="button"
              aria-label={ch.name}
              className="group relative bg-zinc-900/60 border border-white/5 rounded-3xl p-5 hover:bg-zinc-800 transition-all duration-300 cursor-pointer flex flex-col focus:outline-none overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity rounded-3xl" />
              <div className="flex items-center justify-between mb-4 z-10">
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Tv className="w-5 h-5 text-zinc-400 group-hover:text-amber-500 transition-colors" />
                </div>
                <div className="flex items-center gap-1.5 bg-red-500/10 text-red-500 px-2.5 py-1 rounded-full border border-red-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">On Air</span>
                </div>
              </div>
              <div className="flex-grow z-10">
                <h3 className="text-xl font-bold text-white leading-tight mb-1 group-hover:text-amber-400 transition-colors">{ch.name}</h3>
                <p className="text-sm text-zinc-400 mb-4">{ch.desc}</p>
                <span className="px-2.5 py-1 bg-white/5 rounded-lg text-xs font-medium text-zinc-400">{ch.category}</span>
              </div>
              <button className="mt-4 w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold bg-white/10 text-white group-hover:bg-amber-500 group-hover:text-amber-950 transition-all z-10 pointer-events-none">
                <Play className="w-4 h-4 fill-current" /> Watch Live
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-600 mt-8 flex items-center gap-2">
        <Radio className="w-3.5 h-3.5" />
        Channels stream in HD with no pop-ups. Major fixtures (football, F1, cricket, tennis, boxing) are usually carried live on the relevant channel above.
      </p>
    </div>
  );
}
