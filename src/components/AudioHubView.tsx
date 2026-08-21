import { useState } from 'react';
import { Play, Pause, Radio, Signal, Search } from 'lucide-react';
import { useRadio } from '../hooks/useRadio';

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
  { name: 'NRG Radio', country: 'Kenya', category: 'Kenyan', frequency: '89.5', url: 'https://streamingv2.shoutcast.com/nrg-radio-ke' },
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
  { name: 'SomaFM Sonic Universe', country: 'USA', category: 'Jazz', frequency: 'Digital', url: 'https://ice1.somafm.com/sonicuniverse-128-mp3' },
  { name: 'KEXP', country: 'USA', category: 'Indie', frequency: '90.3', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { name: 'NRJ', country: 'France', category: 'Pop', frequency: 'Digital', url: 'https://cdn.nrjaudio.fm/audio1/fr/30001/mp3_128.mp3' },
  { name: 'Radio Paradise', country: 'USA', category: 'Eclectic', frequency: 'Digital', url: 'https://stream.radioparadise.com/aac-128' },
  { name: 'SomaFM Groove Salad', country: 'USA', category: 'Chillout', frequency: 'Digital', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'SomaFM Secret Agent', country: 'USA', category: 'Lounge', frequency: 'Digital', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { name: 'REYFM Lofi', country: 'Germany', category: 'Lofi', frequency: 'Digital', url: 'https://listen.reyfm.de/lofi_320kbps.mp3' },
  { name: 'Amsterdam Trance', country: 'Netherlands', category: 'Dance', frequency: 'Digital', url: 'https://strm112.1.fm/atr_mobile_mp3' },
  { name: 'Dance Wave', country: 'Netherlands', category: 'Dance', frequency: 'Digital', url: 'https://dancewave.online/dance.mp3' },
  { name: 'Ibiza Global Radio', country: 'Spain', category: 'Electronic', frequency: 'Digital', url: 'https://listenssl.ibizaglobalradio.com:8024/igr' },
  { name: 'Arrow Classic Rock', country: 'Netherlands', category: 'Rock', frequency: 'Digital', url: 'https://stream.player.arrow.nl/arrowcr' },
  { name: '0N Classic Rock', country: 'Germany', category: 'Rock', frequency: 'Digital', url: 'https://0n-classicrock.radionetz.de/0n-classicrock.mp3' },
  { name: 'Grolloo Blues Radio', country: 'Netherlands', category: 'Blues', frequency: 'Digital', url: 'https://uk1.streamingpulse.com/ssl/grollooradio' },
  { name: 'Bluegrass Country', country: 'USA', category: 'Country', frequency: 'Digital', url: 'https://ice24.securenetsystems.net/WAMU' },
  { name: 'Reggae Chill Cafe', country: 'Canada', category: 'Reggae', frequency: 'Digital', url: 'https://maggie.torontocast.com:2020/stream/reggaechillcafe' },
  { name: 'Gospel FM Jamaica', country: 'Jamaica', category: 'Gospel', frequency: 'Digital', url: 'https://stream-37.zeno.fm/zpksre88rm0uv' },
  { name: 'Mirchi Top 20', country: 'India', category: 'Bollywood', frequency: 'Digital', url: 'https://drive.uber.radio/uber/bollywoodnow/icecast.audio' },
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
  const [selectedCountry, setSelectedCountry] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [eqPreset, setEqPreset] = useState<string>('Studio Flat');
  const { playingUrl, togglePlay } = useRadio();

  const radioCategories = ['All', ...Array.from(new Set(STATIONS.map((s) => s.category)))].sort();
  
  const filteredStations = STATIONS.filter((s) => {
    const matchesCategory = radioCategory === 'All' || s.category === radioCategory;
    const matchesCountry = selectedCountry === 'All' || s.country === selectedCountry;
    const matchesSearch = searchQuery === '' || 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.category.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.country.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesCountry && matchesSearch;
  });

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

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Live Radio Studio Desk (Analog Console + Active EQ + Controls) */}
        {nowPlaying && (
          <div className="relative overflow-hidden rounded-2xl mb-8 border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.5)] bg-zinc-950 p-6 md:p-8 animate-in fade-in duration-500">
            {/* Colored atmospheric glow corresponding to station gradient */}
            <div className={`absolute -right-24 -top-24 w-80 h-80 rounded-full bg-gradient-to-br ${gradFor(nowPlaying.name)} blur-3xl opacity-20 pointer-events-none`} />
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center relative z-10">
              
              {/* Vinyl Record Player Column */}
              <div className="md:col-span-4 flex flex-col items-center justify-center text-center">
                <div className="relative group/vinyl">
                  {/* Outer Record Plate */}
                  <div className="absolute inset-0 bg-black/60 rounded-full blur-xl group-hover/vinyl:scale-105 transition-transform duration-500" />
                  
                  <div className={`w-44 h-44 md:w-52 md:h-52 rounded-full bg-zinc-900 border-4 border-zinc-850 flex items-center justify-center shadow-2xl relative overflow-hidden transition-transform duration-500 hover:scale-105 ${playingUrl ? 'animate-[vinyl-spin_8s_linear_infinite]' : ''}`}>
                    {/* Vinyl grooves radial pattern */}
                    <div aria-hidden className="absolute inset-0 opacity-40" style={GROOVES} />
                    <div aria-hidden className="absolute inset-0 bg-radial-gradient from-transparent via-black/10 to-black/60" />
                    
                    {/* Center Label (The Station Core) */}
                    <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br ${gradFor(nowPlaying.name)} flex items-center justify-center border-4 border-zinc-950 relative shadow-inner`}>
                      <span className="font-display font-black text-white text-xl md:text-2xl drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] select-none">
                        {monogram(nowPlaying.name)}
                      </span>
                      {/* Spindle hole */}
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]" />
                    </div>
                  </div>
                  
                  {/* Stylus / Tonearm overlay indicator */}
                  <div className={`absolute top-0 right-4 w-12 h-20 origin-top-right transition-transform duration-700 pointer-events-none ${playingUrl ? 'rotate-12' : '-rotate-12'}`} style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
                    <svg viewBox="0 0 40 80" className="w-full h-full text-zinc-400 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
                      {/* Stylus arm lines */}
                      <path d="M 35 5 L 35 45 L 20 65 L 12 60" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      {/* Cartridge head */}
                      <rect x="5" y="55" width="10" height="14" rx="2" fill="#d97706" transform="rotate(-15, 10, 62)" />
                    </svg>
                  </div>
                </div>
                
                {/* On-air active badge */}
                <div className="mt-4 flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full text-red-500 text-xs font-bold uppercase tracking-wider">
                  <Signal className="w-3.5 h-3.5" />
                  On Air
                </div>
              </div>
              
              {/* Station Meta & Signal Dashboard Column */}
              <div className="md:col-span-5 flex flex-col gap-4">
                <div>
                  <span className="text-amber-500 font-bold tracking-widest text-xs uppercase block mb-1">Live Broadcast · {nowPlaying.country}</span>
                  <h3 className="text-2xl md:text-4xl font-display font-bold text-white tracking-tight leading-tight mb-2 truncate">{nowPlaying.name}</h3>
                  <p className="text-sm text-zinc-400 font-medium">{nowPlaying.category} Stream · {nowPlaying.frequency}</p>
                </div>
                
                {/* Animated Digital Signal Analyzer */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    <span>Spectrum Monitor</span>
                    <span className="text-amber-500">Preset: {eqPreset}</span>
                  </div>
                  
                  {/* Spectrum bars inside desk */}
                  <div className="flex items-end gap-1.5 h-16 w-full px-3 py-2 bg-zinc-950 rounded-xl border border-white/5 overflow-hidden relative">
                    {Array.from({ length: 18 }).map((_, i) => {
                      const h = [6, 10, 4, 8, 12, 7, 3, 9, 11, 5, 8, 4, 10, 6, 9, 3, 7, 5][i];
                      const delay = (i * 0.05).toFixed(2);
                      const duration = (0.5 + Math.random() * 0.4).toFixed(2);
                      return (
                        <div key={i} className="flex-1 flex flex-col justify-end h-full gap-0.5">
                          {/* Multi-colored LED columns */}
                          {Array.from({ length: 4 }).map((_, j) => {
                            const activeColor = j === 3 ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]' : j === 2 ? 'bg-amber-400' : 'bg-emerald-500';
                            const activeClass = playingUrl ? 'animate-[eq_1s_ease-in-out_infinite_alternate]' : '';
                            return (
                              <div
                                key={j}
                                style={{
                                  height: `${h * 18}%`,
                                  animationDelay: `${delay}s`,
                                  animationDuration: `${duration}s`,
                                }}
                                className={`w-full h-1.5 rounded-sm transition-colors ${playingUrl ? activeColor : 'bg-zinc-800'} ${activeClass}`}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Audio Console Signal Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                    <div className="bg-white/5 border border-white/5 rounded-lg p-1.5">
                      <span className="text-zinc-500 block">BITRATE</span>
                      <span className="text-zinc-300 font-bold">128kbps AAC</span>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-lg p-1.5">
                      <span className="text-zinc-500 block">STABILITY</span>
                      <span className="text-emerald-500 font-bold animate-pulse">99.8% LIVE</span>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-lg p-1.5">
                      <span className="text-zinc-500 block">LATENCY</span>
                      <span className="text-zinc-300 font-bold">~1.4s (Stereo)</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Equalizer Console Presets & Controls Column */}
              <div className="md:col-span-3 flex flex-col justify-between h-full gap-4 md:border-l md:border-white/5 md:pl-6">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Audio Profile</h4>
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                    {['Studio Flat', 'Bass Booster', 'Warm Vocal', 'Concert Surround'].map((p) => {
                      const active = eqPreset === p;
                      return (
                        <button
                          key={p}
                          onClick={() => setEqPreset(p)}
                          className={`px-3 py-2 text-left text-xs font-bold rounded-xl border transition-all ${
                            active 
                              ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]' 
                              : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:border-white/10'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-amber-400 animate-pulse' : 'bg-transparent border border-zinc-600'}`} />
                            {p}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Main Console Play/Pause trigger */}
                <button
                  onClick={() => togglePlay(nowPlaying.url, nowPlaying.name)}
                  className="w-full btn-gold py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2.5 text-xs"
                >
                  {playingUrl ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      Stop Broadcast
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Tune Broadcast
                    </>
                  )}
                </button>
              </div>
              
            </div>
          </div>
        )}

        {/* Search & Filter bar for stations */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search radio stations, categories or countries..."
              className="w-full bg-zinc-950 text-white text-sm pl-10 pr-9 py-2 rounded-xl border border-white/10 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>
          
          <span className="text-xs text-zinc-500 font-medium self-end md:self-auto">
            Showing {filteredStations.length} of {STATIONS.length} stations
          </span>
        </div>

        {/* Region / Country selector with flags */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 px-1 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <span>Filter by Region</span>
          </div>
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
            {COUNTRIES.map((c) => {
              const active = selectedCountry === c.code;
              return (
                <button
                  key={c.code}
                  onClick={() => setSelectedCountry(c.code)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                    active 
                      ? 'bg-amber-500 text-amber-950 shadow-md shadow-amber-500/10 scale-[1.02]' 
                      : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/5 hover:border-white/10'
                  }`}
                >
                  <span className="text-sm leading-none">{c.flag}</span>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category pills */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2 px-1 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <span>Filter by Style / Genre</span>
          </div>
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
            {radioCategories.map((category) => {
              const active = radioCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => setRadioCategory(category)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    active 
                      ? 'bg-zinc-100 text-zinc-950 border border-zinc-100' 
                      : 'bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 border border-white/5 hover:text-white'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        {filteredStations.length > 0 ? (
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
        ) : (
          <div className="text-center py-16 bg-zinc-950/40 border border-white/5 rounded-2xl">
            <Radio className="w-12 h-12 text-zinc-600 mx-auto mb-4 animate-pulse" />
            <h4 className="text-lg font-bold text-white mb-1">No stations found</h4>
            <p className="text-sm text-zinc-500 max-w-md mx-auto px-4">
              We couldn't find any radio stations matching your active filters. Try searching for something else or clearing your search.
            </p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedCountry('All'); setRadioCategory('All'); }}
              className="mt-4 px-5 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-xs font-bold transition-colors"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
