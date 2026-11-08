import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Play, Square, Radio, Search, Loader2, SkipBack, SkipForward, Heart, RotateCw, WifiOff } from 'lucide-react';
import { useRadio } from '../hooks/useRadio';
import { LuxHeader, LiveMeta } from './ui/Lux';
import Illustration from './ui/Illustration';

const COUNTRIES = [
  { code: 'All', name: 'All Regions', flag: '🌍' },
  { code: 'Kenya', name: 'Kenya', flag: '🇰🇪' },
  { code: 'Nigeria', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'South Africa', name: 'South Africa', flag: '🇿🇦' },
  { code: 'Tanzania', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'Uganda', name: 'Uganda', flag: '🇺🇬' },
  { code: 'UK', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'USA', name: 'United States', flag: '🇺🇸' },
  { code: 'India', name: 'India', flag: '🇮🇳' },
  { code: 'Switzerland', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'France', name: 'France', flag: '🇫🇷' },
  { code: 'Germany', name: 'Germany', flag: '🇩🇪' },
  { code: 'Netherlands', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'Canada', name: 'Canada', flag: '🇨🇦' },
  { code: 'Jamaica', name: 'Jamaica', flag: '🇯🇲' },
];

/**
 * 45 stations, every one of them fetched and confirmed to be serving live audio
 * on 2026-07-26 — not copied from a directory listing and hoped for. New entries
 * came from the radio-browser directory filtered to https (an http stream is
 * blocked as mixed content on the hosted PWA) and ranked by listener votes; of
 * 75 candidates tested, 5 were dead and were dropped rather than shipped, and
 * duplicates that appeared under several genre queries were removed.
 *
 * Rechecked in a browser on 2026-11-01: NRG Radio, Dance Wave and SomaFM's
 * direct streams no longer played (SomaFM refuses them from Kenya; its Groove
 * Salad HLS stream plays), and were replaced with stations that did.
 */
export const STATIONS = [
  // ── Kenya ──
  { name: 'Capital FM', country: 'Kenya', category: 'Kenyan', frequency: '98.4', url: 'https://capitalfm.cloudrad.io/stream' },
  { name: 'Kiss 100', country: 'Kenya', category: 'Kenyan', frequency: '100.3', url: 'https://kiss100fm-atunwadigital.streamguys1.com/kiss100fm' },
  { name: 'Classic 105', country: 'Kenya', category: 'Kenyan', frequency: '105.2', url: 'https://classic105-atunwadigital.streamguys1.com/classic105' },
  { name: 'Radio Jambo', country: 'Kenya', category: 'Kenyan', frequency: '97.5', url: 'https://radiojambo-atunwadigital.streamguys1.com/radiojambo' },
  { name: 'Radio Citizen', country: 'Kenya', category: 'Kenyan', frequency: '106.7', url: 'https://radiocitizen-atunwadigital.streamguys1.com/radiocitizen' },
  { name: 'Nation FM', country: 'Kenya', category: 'Kenyan', frequency: '96.3', url: 'https://stream.zeno.fm/vy0gmg7pb2zuv' },
  { name: 'Radio Maisha', country: 'Kenya', category: 'Kenyan', frequency: '94.0', url: 'https://radiomaisha-atunwadigital.streamguys1.com/radiomaisha' },
  { name: 'Hot 96', country: 'Kenya', category: 'Kenyan', frequency: '96.3', url: 'https://hot96-atunwadigital.streamguys1.com/hot96' },
  { name: 'Ghetto Radio', country: 'Kenya', category: 'Kenyan', frequency: '89.5', url: 'https://stream.zeno.fm/kvudezx1h2zuv' },
  { name: 'Kameme FM', country: 'Kenya', category: 'Kenyan', frequency: '101.1', url: 'https://kamemefm-atunwadigital.streamguys1.com/kamemefm' },
  { name: 'East FM', country: 'Kenya', category: 'Asian', frequency: '106.3', url: 'https://eastfm-atunwadigital.streamguys1.com/eastfm' },

  // ── Rest of Africa ──
  { name: 'Metro FM Lagos', country: 'Nigeria', category: 'Pop', frequency: '97.7', url: 'https://go.webgateready.com/metrofm/radio.mp3' },
  { name: 'LagosJump Radio', country: 'Nigeria', category: 'Afrobeats', frequency: 'Digital', url: 'https://radio.lagosjumpradio.com/listen/lagosjump_radio/radio.mp3' },
  { name: 'Jacaranda FM', country: 'South Africa', category: 'Pop', frequency: '94.2', url: 'https://edge.iono.fm/xice/jacarandafm_live_medium.aac' },
  { name: 'Kaya FM', country: 'South Africa', category: 'Soul', frequency: '95.9', url: 'https://edge.iono.fm/xice/82_medium.aac' },
  { name: 'Amapiano FM', country: 'South Africa', category: 'Amapiano', frequency: 'Digital', url: 'https://stream.zeno.fm/xs6zeac1ts8uv' },
  { name: 'East Africa Radio', country: 'Tanzania', category: 'Bongo', frequency: '88.6', url: 'https://eatv.radioca.st/stream' },
  { name: 'Capital Radio', country: 'Tanzania', category: 'Pop', frequency: '88.9', url: 'https://capitalradio.radioca.st/stream' },
  { name: 'Radio One Stereo', country: 'Tanzania', category: 'Bongo', frequency: '92.9', url: 'https://radioonetanzania.radioca.st/stream' },
  { name: 'Pearl FM', country: 'Uganda', category: 'Talk', frequency: '107.9', url: 'https://dc4.serverse.com/proxy/pearlfm/stream/1/' },
  { name: 'Radio Buddu', country: 'Uganda', category: 'Kenyan', frequency: '95.5', url: 'https://dc4.serverse.com/proxy/ccmxrgub/stream' },

  // ── News / Talk ──
  { name: 'BBC World Service', country: 'UK', category: 'News', frequency: 'Digital', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service' },
  { name: 'NPR', country: 'USA', category: 'News', frequency: 'Digital', url: 'https://npr-ice.streamguys1.com/live.mp3' },
  { name: 'WNYC FM', country: 'USA', category: 'News', frequency: '93.9', url: 'https://fm939.wnyc.org/wnycfm.aac' },

  // ── Music ──
  { name: 'Classic FM', country: 'UK', category: 'Classical', frequency: '100.0', url: 'https://media-ice.musicradio.com/ClassicFMMP3' },
  { name: 'Radio Swiss Classic', country: 'Switzerland', category: 'Classical', frequency: 'Digital', url: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128' },
  { name: 'Venice Classic Radio', country: 'Italy', category: 'Classical', frequency: 'Digital', url: 'https://uk2.streamingpulse.com/ssl/vcr1' },
  { name: 'Radio Swiss Jazz', country: 'Switzerland', category: 'Jazz', frequency: 'Digital', url: 'https://stream.srg-ssr.ch/m/rsj/mp3_128' },
  { name: 'Adroit Jazz Underground', country: 'USA', category: 'Jazz', frequency: 'Digital', url: 'https://icecast.walmradio.com:8443/jazz' },
  { name: 'KEXP', country: 'USA', category: 'Indie', frequency: '90.3', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { name: 'NRJ', country: 'France', category: 'Pop', frequency: 'Digital', url: 'https://cdn.nrjaudio.fm/audio1/fr/30001/mp3_128.mp3' },
  { name: 'Radio Paradise', country: 'USA', category: 'Eclectic', frequency: 'Digital', url: 'https://stream.radioparadise.com/aac-128' },
  { name: 'SomaFM Groove Salad', country: 'USA', category: 'Chillout', frequency: 'Digital', url: 'https://hls.somafm.com/hls/groovesalad/320k/program.m3u8' },
  { name: 'Café del Mar', country: 'Spain', category: 'Lounge', frequency: 'Digital', url: 'https://streams.radio.co/se1a320b47/listen' },
  { name: 'REYFM Lofi', country: 'Germany', category: 'Lofi', frequency: 'Digital', url: 'https://listen.reyfm.de/lofi_320kbps.mp3' },
  { name: 'Amsterdam Trance', country: 'Netherlands', category: 'Dance', frequency: 'Digital', url: 'https://strm112.1.fm/atr_mobile_mp3' },
  { name: 'Intense Radio', country: 'Netherlands', category: 'Dance', frequency: 'Digital', url: 'https://secure.live-streams.nl/main' },
  { name: 'Ibiza Global Radio', country: 'Spain', category: 'Electronic', frequency: 'Digital', url: 'https://listenssl.ibizaglobalradio.com:8024/igr' },
  { name: 'Arrow Classic Rock', country: 'Netherlands', category: 'Rock', frequency: 'Digital', url: 'https://stream.player.arrow.nl/arrowcr' },
  { name: '0N Classic Rock', country: 'Germany', category: 'Rock', frequency: 'Digital', url: 'https://0n-classicrock.radionetz.de/0n-classicrock.mp3' },
  { name: 'Grolloo Blues Radio', country: 'Netherlands', category: 'Blues', frequency: 'Digital', url: 'https://uk1.streamingpulse.com/ssl/grollooradio' },
  { name: 'Bluegrass Country', country: 'USA', category: 'Country', frequency: 'Digital', url: 'https://ice24.securenetsystems.net/WAMU' },
  { name: 'Reggae Chill Cafe', country: 'Canada', category: 'Reggae', frequency: 'Digital', url: 'https://maggie.torontocast.com:2020/stream/reggaechillcafe' },
  { name: 'Gospel FM Jamaica', country: 'Jamaica', category: 'Gospel', frequency: 'Digital', url: 'https://stream-37.zeno.fm/zpksre88rm0uv' },
  { name: 'Mirchi Top 20', country: 'India', category: 'Bollywood', frequency: 'Digital', url: 'https://drive.uber.radio/uber/bollywoodnow/icecast.audio' },
];

type Station = (typeof STATIONS)[number];

const FAVS_KEY = 'sahrae.radio.favs.v1';
const readList = (key: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
};

const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** A station's own two colours, the same every time, deep enough for white type. */
const hueOf = (name: string) => hashStr(name) % 360;
const artStyle = (name: string): CSSProperties => {
  const h = hueOf(name);
  return { background: `linear-gradient(150deg, hsl(${h} 58% 36%), hsl(${(h + 42) % 360} 68% 12%))` };
};
const washStyle = (name: string): CSSProperties => {
  const h = hueOf(name);
  return { background: `radial-gradient(90% 140% at 12% 0%, hsl(${h} 60% 30%), transparent 65%), linear-gradient(120deg, hsl(${(h + 42) % 360} 55% 11%), #09090b 85%)` };
};

/** "Kenyan · Kenya" says one thing twice. */
const where = (s: Station) => (s.category === 'Kenyan' ? s.country : `${s.category} · ${s.country}`);
const isFm = (s: Station) => /^\d/.test(s.frequency);
/** Where the needle sits on the FM band. */
const needleAt = (s: Station) => Math.min(96, Math.max(4, ((parseFloat(s.frequency) - 87.5) / 20.5) * 100));

/** The tuner scale along the foot of a station, with its needle on the real frequency. */
function Tuner({ station, active }: { station: Station; active?: boolean }) {
  return (
    <span aria-hidden className="absolute inset-x-3 bottom-3 h-3 block">
      <span className="absolute inset-0 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 6px)' }} />
      {isFm(station) && <span className={`absolute top-[-3px] bottom-[-3px] w-[2px] rounded-full ${active ? 'bg-[#fbbf24]' : 'bg-[#fff]'}`} style={{ left: `${needleAt(station)}%` }} />}
    </span>
  );
}

function EqBars({ className = 'h-5' }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-[3px] ${className}`} aria-hidden>
      {[3, 5, 2, 4].map((h, i) => (
        <span key={i} className="w-1 rounded-full bg-[#fff] animate-[eq_0.9s_ease-in-out_infinite]" style={{ height: `${h * 18}%`, animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

function StationTile({ s, active, tuning, onPlay }: { s: Station; active: boolean; tuning: boolean; onPlay: () => void }) {
  return (
    <button onClick={onPlay} tabIndex={0} data-tv-focusable aria-pressed={active} aria-label={`${s.name}, ${s.category}, ${s.country}`}
      className="group w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
      <span className={`relative block aspect-square rounded-2xl overflow-hidden shadow-[0_14px_30px_-16px_rgba(0,0,0,0.9)] ring-1 transition-transform duration-300 group-hover:-translate-y-1 ${active ? 'ring-2 ring-amber-400' : 'ring-white/10'}`} style={artStyle(s.name)}>
        <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/30" />
        <span className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-semibold text-[#fff]/80 tabular">
          <span>{isFm(s) ? `${s.frequency} FM` : 'Online'}</span>
          {active && (tuning ? <Loader2 className="w-4 h-4 animate-spin text-[#fff]" /> : <EqBars className="h-4" />)}
        </span>
        <span className="absolute inset-x-3 top-1/2 -translate-y-1/2 font-display font-black text-[#fff] text-[1.35rem] md:text-2xl leading-[1.08] tracking-tight line-clamp-3">{s.name}</span>
        <Tuner station={s} active={active} />
        {!active && (
          <span aria-hidden className="absolute right-2.5 bottom-6 w-10 h-10 rounded-full bg-[#fff] text-[#111] grid place-items-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0 transition-all duration-200">
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </span>
        )}
      </span>
      <span className="block mt-2.5 px-0.5 text-xs text-zinc-400 truncate">{where(s)}</span>
    </button>
  );
}

function Rail({ title, list, render }: { title: string; list: Station[]; render: (s: Station) => ReactNode }) {
  if (!list.length) return null;
  return (
    <section className="mb-9">
      <h2 className="lux-h text-xl md:text-2xl mb-3.5">{title}</h2>
      <div className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide py-1 -mx-1 px-1">
        {list.map((s) => <div key={s.name} className="flex-none w-[9.5rem] md:w-44">{render(s)}</div>)}
      </div>
    </section>
  );
}

export default function AudioHubView({ onNav: _onNav }: { onNav?: (tab: string) => void }) {
  const [genre, setGenre] = useState('All');
  const [region, setRegion] = useState('All');
  const [query, setQuery] = useState('');
  const { playingUrl, failedUrl, status, lastUrl, recentUrls, togglePlay } = useRadio();
  const [favs, setFavs] = useState<string[]>(() => readList(FAVS_KEY));

  const toggleFav = (url: string) => setFavs((cur) => {
    const next = cur.includes(url) ? cur.filter((u) => u !== url) : [url, ...cur];
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(next)); } catch { /* storage full */ }
    return next;
  });

  const genres = useMemo(() => ['All', ...Array.from(new Set(STATIONS.map((s) => s.category))).sort()], []);
  const q = query.trim().toLowerCase();
  const filtering = !!q || genre !== 'All' || region !== 'All';
  const filtered = STATIONS.filter((s) => (genre === 'All' || s.category === genre)
    && (region === 'All' || s.country === region)
    && (!q || `${s.name} ${s.category} ${s.country}`.toLowerCase().includes(q)));

  const byUrl = (u: string | null) => STATIONS.find((s) => s.url === u);
  // The stage always has a station on it: playing, just failed, last heard, or the first.
  const stage = byUrl(playingUrl) || byUrl(failedUrl) || byUrl(lastUrl) || STATIONS[0];
  const onAir = playingUrl === stage.url;
  const tuning = onAir && status === 'tuning';
  const failed = failedUrl === stage.url && !onAir;
  const list = filtering && filtered.length ? filtered : STATIONS;
  const step = (by: number) => {
    const at = list.findIndex((s) => s.url === stage.url);
    const next = list[(at + by + list.length) % list.length];
    togglePlay(next.url, next.name);
  };

  const tile = (s: Station) => (
    <StationTile s={s} active={playingUrl === s.url} tuning={playingUrl === s.url && status === 'tuning'} onPlay={() => togglePlay(s.url, s.name)} />
  );
  const yours = [...favs, ...recentUrls.filter((u) => !favs.includes(u))].map(byUrl).filter(Boolean) as Station[];
  const AFRICA = ['Nigeria', 'South Africa', 'Tanzania', 'Uganda'];
  const NEWS = ['News', 'Talk'];
  const CHILL = ['Lofi', 'Lounge', 'Chillout', 'Jazz', 'Classical'];

  const round = 'rounded-full grid place-items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-colors';

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-40 relative">
      <LuxHeader kicker={<><Radio className="w-3.5 h-3.5" /> Sahrae · Listen</>} title="Radio"
        meta={<><LiveMeta>{STATIONS.length} stations on air</LiveMeta><span>News, talk and music, live</span></>} />

      <div className="animate-in fade-in duration-500">
        {/* The stage */}
        <section className="dark relative overflow-hidden rounded-3xl ring-1 ring-white/10 mb-10" style={washStyle(stage.name)} aria-label="Now on air">
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 md:gap-9 p-5 md:p-9">
            <div className="relative w-32 h-32 md:w-52 md:h-52 shrink-0 rounded-3xl overflow-hidden ring-1 ring-white/15 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.9)]" style={artStyle(stage.name)}>
              <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/30" />
              <span className="absolute top-3 left-3 text-xs font-semibold text-[#fff]/80 tabular">{isFm(stage) ? `${stage.frequency} FM` : 'Online'}</span>
              <span className="absolute inset-x-3 top-1/2 -translate-y-1/2 font-display font-black text-[#fff] text-2xl md:text-4xl leading-[1.05] tracking-tight line-clamp-3">{stage.name}</span>
              <Tuner station={stage} active={onAir} />
            </div>

            <div className="min-w-0 flex-1">
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#fff]/85 min-h-5">
                {failed ? <><WifiOff className="w-4 h-4 text-red-400" /> Couldn't reach this station</>
                  : tuning ? <><Loader2 className="w-4 h-4 animate-spin" /> Tuning in</>
                  : onAir ? <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> On air</>
                  : <>Ready to tune</>}
              </p>
              <h2 className="font-display font-black text-[#fff] text-3xl md:text-6xl leading-[1.05] tracking-tight mt-2 truncate pb-1">{stage.name}</h2>
              <p className="text-sm md:text-base text-[#fff]/65 mt-1 truncate">{where(stage)}{isFm(stage) ? ` · ${stage.frequency} FM` : ''}</p>

              <div className="flex items-center gap-2.5 md:gap-3 mt-5">
                <button onClick={() => step(-1)} tabIndex={0} data-tv-focusable aria-label="Previous station" className={`w-11 h-11 md:w-12 md:h-12 bg-white/10 hover:bg-white/20 text-[#fff] ${round}`}><SkipBack className="w-5 h-5 fill-current" /></button>
                <button onClick={() => togglePlay(stage.url, stage.name)} tabIndex={0} data-tv-focusable aria-label={onAir ? 'Stop' : failed ? 'Try again' : 'Play'}
                  className={`w-14 h-14 md:w-16 md:h-16 bg-[#fff] hover:bg-[#f1f1f1] text-[#111] ${round}`}>
                  {tuning ? <Loader2 className="w-6 h-6 animate-spin" /> : onAir ? <Square className="w-5 h-5 fill-current" /> : failed ? <RotateCw className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                </button>
                <button onClick={() => step(1)} tabIndex={0} data-tv-focusable aria-label="Next station" className={`w-11 h-11 md:w-12 md:h-12 bg-white/10 hover:bg-white/20 text-[#fff] ${round}`}><SkipForward className="w-5 h-5 fill-current" /></button>
                <button onClick={() => toggleFav(stage.url)} tabIndex={0} data-tv-focusable aria-pressed={favs.includes(stage.url)} aria-label={favs.includes(stage.url) ? 'Remove from your stations' : 'Add to your stations'}
                  className={`w-11 h-11 md:w-12 md:h-12 bg-white/10 hover:bg-white/20 ${favs.includes(stage.url) ? 'text-[#fbbf24]' : 'text-[#fff]'} ${round}`}><Heart className={`w-5 h-5 ${favs.includes(stage.url) ? 'fill-current' : ''}`} /></button>
                {onAir && !tuning && <span className="ml-2 hidden sm:inline-flex"><EqBars className="h-7" /></span>}
              </div>
            </div>
          </div>
        </section>

        {/* Find a station */}
        <div className="relative max-w-xl mb-4">
          <Search className="absolute z-10 left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stations, styles or countries"
            aria-label="Search stations" className="w-full lux-field text-sm pl-10 pr-14 py-3" />
          {query && <button onClick={() => setQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-bold">Clear</button>}
        </div>
        <div className="flex overflow-x-auto gap-2 py-1 mb-1 scrollbar-hide">
          {COUNTRIES.map((c) => (
            <button key={c.code} onClick={() => setRegion(c.code)} tabIndex={0} data-tv-focusable aria-pressed={region === c.code} className="lux-chip shrink-0">
              <span className="text-sm leading-none">{c.flag}</span>{c.name}
            </button>
          ))}
        </div>
        <div className="flex overflow-x-auto gap-2 py-1 mb-8 scrollbar-hide">
          {genres.map((g) => <button key={g} onClick={() => setGenre(g)} tabIndex={0} data-tv-focusable aria-pressed={genre === g} className="lux-chip shrink-0">{g}</button>)}
        </div>

        {!filtering && (
          <>
            <Rail title="Your stations" list={yours} render={tile} />
            <Rail title="Kenya" list={STATIONS.filter((s) => s.country === 'Kenya')} render={tile} />
            <Rail title="Across Africa" list={STATIONS.filter((s) => AFRICA.includes(s.country))} render={tile} />
            <Rail title="News and talk" list={STATIONS.filter((s) => NEWS.includes(s.category))} render={tile} />
            <Rail title="Slow it down" list={STATIONS.filter((s) => CHILL.includes(s.category))} render={tile} />
          </>
        )}

        {filtered.length > 0 ? (
          <section>
            <h2 className="lux-h text-xl md:text-2xl mb-3.5">{filtering ? `${filtered.length} ${filtered.length === 1 ? 'station' : 'stations'}` : 'Every station'}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6">
              {filtered.map((s) => <div key={s.name}>{tile(s)}</div>)}
            </div>
          </section>
        ) : (
          <div className="text-center py-16 lux-card">
            <Illustration name="radio" className="w-44 md:w-52 h-auto mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-1">No stations found</h3>
            <p className="text-sm text-zinc-500 max-w-md mx-auto px-4">Nothing matches those filters. Try another word or clear them.</p>
            <button onClick={() => { setQuery(''); setRegion('All'); setGenre('All'); }} tabIndex={0} data-tv-focusable className="lux-chip mt-4">Clear filters</button>
          </div>
        )}
      </div>
    </div>
  );
}
