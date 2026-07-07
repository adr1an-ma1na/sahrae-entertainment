import { useState } from 'react';
import { Play, Pause, Radio, Signal } from 'lucide-react';
import { useRadio } from '../hooks/useRadio';
import ListenTabs from './ListenTabs';

const STATIONS = [
  // ── Kenya (all verified working) ──
  { name: 'Capital FM', country: 'Kenya', category: 'Kenyan', frequency: '98.4', url: 'https://capitalfm.cloudrad.io/stream' },
  { name: 'Kiss 100', country: 'Kenya', category: 'Kenyan', frequency: '100.3', url: 'https://kiss100fm-atunwadigital.streamguys1.com/kiss100fm' },
  { name: 'Classic 105', country: 'Kenya', category: 'Kenyan', frequency: '105.2', url: 'https://classic105-atunwadigital.streamguys1.com/classic105' },
  { name: 'Radio Jambo', country: 'Kenya', category: 'Kenyan', frequency: '97.5', url: 'https://radiojambo-atunwadigital.streamguys1.com/radiojambo' },
  { name: 'Nation FM', country: 'Kenya', category: 'Kenyan', frequency: '96.3', url: 'https://stream.zeno.fm/vy0gmg7pb2zuv' },
  { name: 'Radio Maisha', country: 'Kenya', category: 'Kenyan', frequency: '94.0', url: 'https://radiomaisha-atunwadigital.streamguys1.com/radiomaisha' },
  { name: 'Hot 96', country: 'Kenya', category: 'Kenyan', frequency: '96.3', url: 'https://hot96-atunwadigital.streamguys1.com/hot96' },

  // ── News / Talk ──
  { name: 'BBC World Service', country: 'UK', category: 'News', frequency: 'Digital', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service' },
  { name: 'NPR', country: 'USA', category: 'News', frequency: 'Digital', url: 'https://npr-ice.streamguys1.com/live.mp3' },

  // ── Music ──
  { name: 'Classic FM', country: 'UK', category: 'Classical', frequency: '100.0', url: 'https://media-ice.musicradio.com/ClassicFMMP3' },
  { name: 'Radio Swiss Jazz', country: 'Switzerland', category: 'Jazz', frequency: 'Digital', url: 'https://stream.srg-ssr.ch/m/rsj/mp3_128' },
  { name: 'KEXP', country: 'USA', category: 'Indie', frequency: '90.3', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { name: 'NRJ', country: 'France', category: 'Pop', frequency: 'Digital', url: 'https://cdn.nrjaudio.fm/audio1/fr/30001/mp3_128.mp3' },
  { name: 'Radio Paradise', country: 'USA', category: 'Eclectic', frequency: 'Digital', url: 'https://stream.radioparadise.com/aac-128' },
  { name: 'SomaFM Groove Salad', country: 'USA', category: 'Chillout', frequency: 'Digital', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'SomaFM Secret Agent', country: 'USA', category: 'Lounge', frequency: 'Digital', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { name: 'Amsterdam Trance', country: 'Netherlands', category: 'Dance', frequency: 'Digital', url: 'https://strm112.1.fm/atr_mobile_mp3' },
];

// Each station gets a stable, hand-picked duotone so the grid reads as a wall of
// distinct stations (not identical grey tiles). Literal class strings so Tailwind
// keeps them. Deterministic by name → the same station is always the same colour.
const STATION_GRADS = [
  'from-rose-500 to-orange-600',
  'from-amber-400 to-orange-700',
  'from-emerald-500 to-teal-700',
  'from-sky-500 to-indigo-700',
  'from-violet-500 to-fuchsia-700',
  'from-fuchsia-500 to-rose-700',
  'from-cyan-500 to-blue-700',
  'from-lime-500 to-emerald-700',
  'from-indigo-500 to-purple-800',
  'from-red-500 to-rose-800',
  'from-teal-400 to-cyan-700',
  'from-orange-500 to-red-700',
];
const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const gradFor = (name: string) => STATION_GRADS[hashStr(name) % STATION_GRADS.length];
const monogram = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
// Concentric "vinyl grooves" texture painted over each station's colour.
const GROOVES = { backgroundImage: 'repeating-radial-gradient(circle at 50% 46%, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 8px)' } as const;

// Animated equalizer bars — the universal "this is playing" signal.
function EqBars({ className = 'h-6', bar = 'bg-white' }: { className?: string; bar?: string }) {
  return (
    <div className={`flex items-end gap-1 ${className}`} aria-hidden>
      {[3, 5, 2, 4].map((h, i) => (
        <span key={i} className={`w-1.5 rounded-full ${bar} animate-[eq_0.9s_ease-in-out_infinite]`} style={{ height: `${h * 16}%`, animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

export default function AudioHubView({ onNav }: { onNav?: (tab: string) => void }) {
  const [radioCategory, setRadioCategory] = useState<string>('All');
  const { playingUrl, togglePlay } = useRadio();

  // Show EVERY station, always. A previous on-device health probe hid any station
  // that didn't answer its probe — but the probe throws false negatives on many
  // networks, so good stations silently vanished. A listed station that's
  // genuinely down just shows the player's offline state; nothing is ever dropped.
  const radioCategories = ['All', ...Array.from(new Set(STATIONS.map((s) => s.category)))].sort();
  const filteredStations = (radioCategory === 'All' ? STATIONS : STATIONS.filter((s) => s.category === radioCategory));
  const nowPlaying = STATIONS.find((s) => s.url === playingUrl) || null;

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-40 relative">
      {/* Aurora glow behind the header — warms to the now-playing station's colour */}
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-64 -z-10 opacity-70"
        style={{ background: 'radial-gradient(60% 70% at 12% 0%, rgba(245,158,11,0.22), transparent 70%), radial-gradient(50% 60% at 80% 10%, rgba(251,191,36,0.12), transparent 72%)', filter: 'blur(8px)' }} />
      {/* Header */}
      <div className="overline mb-1.5">Sahrae · Listen</div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-300 via-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
          <Radio className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Radio</h2>
          <p className="text-sm text-zinc-400">Live stations · news · music</p>
        </div>
      </div>

      <ListenTabs active="audio" onNav={onNav ?? (() => {})} />

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* ── Now-playing banner — the station's colour, an equalizer, and a big pause ── */}
        {nowPlaying && (
          <div className="relative overflow-hidden rounded-2xl mb-6 border border-white/10 elev-2">
            <div className={`absolute inset-0 bg-gradient-to-br ${gradFor(nowPlaying.name)}`} />
            <div aria-hidden className="absolute inset-0 opacity-25" style={GROOVES} />
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-black/45" />
            <div className="relative flex items-center gap-4 p-4 md:p-5">
              <div className="w-16 h-16 rounded-full bg-black/30 border border-white/25 flex items-center justify-center shrink-0 shadow-lg">
                <EqBars className="h-7" bar="bg-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="live-dot inline-block w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/90">On Air · {nowPlaying.country}</span>
                </div>
                <h3 className="text-xl md:text-2xl font-display font-bold text-white truncate drop-shadow">{nowPlaying.name}</h3>
                <p className="text-sm text-white/70 truncate">{nowPlaying.category} · {nowPlaying.frequency}</p>
              </div>
              <button onClick={() => togglePlay(nowPlaying.url, nowPlaying.name)} aria-label="Pause"
                className="w-14 h-14 rounded-full btn-glass flex items-center justify-center shrink-0">
                <Pause className="w-6 h-6 fill-current" />
              </button>
            </div>
          </div>
        )}

        {/* Category pills — gold active state, frosted chip rest (matches Sauti) */}
        <div className="flex overflow-x-auto gap-2 pb-4 scrollbar-hide mb-6 border-b border-white/5">
          {radioCategories.map((category) => (
            <button
              key={category}
              onClick={() => setRadioCategory(category)}
              tabIndex={0}
              data-tv-focusable
              className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none ${
                radioCategory === category ? 'bg-sauti text-amber-950' : 'chip text-zinc-300 hover:text-white'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {filteredStations.map((station) => {
            const active = playingUrl === station.url;
            const grad = gradFor(station.name);
            return (
              <div
                key={station.name}
                tabIndex={0}
                data-tv-focusable
                role="button"
                aria-pressed={active}
                className={`card-lift tier-card rounded-2xl p-3 group relative overflow-hidden flex flex-col cursor-pointer focus:outline-none ${active ? 'border-amber-400/60' : ''}`}
                onClick={() => togglePlay(station.url, station.name)}
              >
                {/* Station "cover" — its signature colour + vinyl grooves + monogram */}
                <div className={`w-full aspect-square rounded-xl mb-3 flex items-center justify-center relative overflow-hidden bg-gradient-to-br ${grad} shadow-lg`}>
                  <div aria-hidden className="absolute inset-0 opacity-30" style={GROOVES} />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/25" />
                  {/* Center label: equalizer when playing, else the monogram */}
                  {active ? (
                    <EqBars className="h-8 relative z-10" bar="bg-white" />
                  ) : (
                    <span className="relative z-10 font-display font-black text-white/95 text-4xl md:text-5xl tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] group-hover:scale-110 transition-transform duration-500">{monogram(station.name)}</span>
                  )}

                  {/* Live / on-air chip */}
                  <div className={`absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/40 backdrop-blur-sm transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Signal className="w-3 h-3 text-white" />
                    <span className="text-[9px] font-bold uppercase tracking-wide text-white">Live</span>
                  </div>

                  {/* Play / pause */}
                  <div className={`absolute bottom-2 right-2 w-10 h-10 rounded-full btn-sauti flex items-center justify-center shadow-xl transition-all duration-300 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0'}`}>
                    {active ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </div>
                </div>

                <div className="relative z-10 px-0.5">
                  <h3 className={`text-base font-bold mb-1 truncate ${active ? 'text-sauti' : 'text-white'}`}>{station.name}</h3>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-zinc-400 text-xs font-medium truncate">{station.category} · {station.country}</p>
                    <span className="bg-white/10 text-zinc-200 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 tabular">{station.frequency}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
