import { useState } from 'react';
import { Play, Pause, Radio, Headphones } from 'lucide-react';
import { useRadio } from '../hooks/useRadio';

const STATIONS = [
  // Expanded Radio Stations with Real URLs
  { name: 'Capital FM', country: 'Kenya', category: 'Pop', frequency: '98.4', url: 'https://capitalfm.cloudrad.io/stream' },
  { name: 'Nation FM', country: 'Kenya', category: 'Talk', frequency: '96.3', url: 'https://nimbus.iono.fm/stream/nation_fm_kenya' },
  { name: 'Classic 105', country: 'Kenya', category: 'Classic', frequency: '105.2', url: 'https://classic105-atunwadigital.streamguys1.com/classic105' },
  { name: 'Radio Jambo', country: 'Kenya', category: 'Talk', frequency: '97.5', url: 'https://radiojambo-atunwadigital.streamguys1.com/radiojambo' },
  { name: 'East FM', country: 'Kenya', category: 'Asian', frequency: '106.3', url: 'https://eastfm-atunwadigital.streamguys1.com/eastfm' },
  { name: 'BBC World Service', country: 'UK', category: 'News', frequency: 'Digital', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service' },
  { name: 'NPR', country: 'USA', category: 'News', frequency: 'Digital', url: 'https://npr-ice.streamguys1.com/npr-live' },
  { name: 'KEXP', country: 'USA', category: 'Indie', frequency: '90.3', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { name: 'SomaFM Groove Salad', country: 'USA', category: 'Ambient', frequency: 'Digital', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'SomaFM Drone Zone', country: 'USA', category: 'Ambient', frequency: 'Digital', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { name: 'SomaFM Secret Agent', country: 'USA', category: 'Lounge', frequency: 'Digital', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { name: 'SomaFM Def Con Radio', country: 'USA', category: 'Electronic', frequency: 'Digital', url: 'https://ice1.somafm.com/defcon-128-mp3' },
  { name: 'Dance Wave', country: 'Global', category: 'Dance', frequency: 'Digital', url: 'https://dancewave.online/dance.mp3' },
  { name: 'Jazz24', country: 'USA', category: 'Jazz', frequency: 'Digital', url: 'https://live.wostreaming.net/direct/ppm-jazz24aac256-ibc1' },
  { name: 'Classic FM', country: 'UK', category: 'Classical', frequency: '100.0', url: 'https://media-ice.musicradio.com/ClassicFMMP3' },
  { name: 'WNYC FM', country: 'USA', category: 'Public', frequency: '93.9', url: 'https://fm939.wnyc.org/wnycfm.aac' },
  { name: 'KCRW', country: 'USA', category: 'Public', frequency: '89.9', url: 'https://kcrw.streamguys1.com/kcrw_192k_mp3_on_air' },
  { name: 'Radio Swiss Jazz', country: 'Switzerland', category: 'Jazz', frequency: 'Digital', url: 'https://stream.srg-ssr.ch/m/rsj/mp3_128' },
  { name: 'Radio Swiss Classic', country: 'Switzerland', category: 'Classical', frequency: 'Digital', url: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128' },
  { name: 'NRJ', country: 'France', category: 'Pop', frequency: 'Digital', url: 'https://cdn.nrjaudio.fm/audio1/fr/30001/mp3_128.mp3' },
  { name: 'Amsterdam Trance', country: 'Netherlands', category: 'Trance', frequency: 'Digital', url: 'https://strm112.1.fm/atr_mobile_mp3' },
  { name: 'Ibiza Global Radio', country: 'Spain', category: 'Electronic', frequency: 'Digital', url: 'https://listenssl.ibizaglobalradio.com:8024/igr' },
  { name: 'Chill Trax', country: 'Global', category: 'Chillout', frequency: 'Digital', url: 'https://icecast.chilltrax.com:8000/chilltrax_128.mp3' },
  { name: 'Venice Classic Radio', country: 'Italy', category: 'Classical', frequency: 'Digital', url: 'https://174.36.206.197:8000/stream' },
  { name: '1.FM - Acoustic Guitar', country: 'Switzerland', category: 'Acoustic', frequency: 'Digital', url: 'https://strm112.1.fm/acg_mobile_mp3' },
];

export default function AudioHubView() {
  // Radio State
  const [radioCategory, setRadioCategory] = useState<string>('All');
  const { playingUrl, togglePlay } = useRadio();
  const radioCategories = ['All', ...Array.from(new Set(STATIONS.map(s => s.category)))].sort();
  const filteredStations = radioCategory === 'All' ? STATIONS : STATIONS.filter(s => s.category === radioCategory);

  return (
    <div className="pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Headphones className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white">Live Radio</h2>
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex overflow-x-auto gap-2 pb-4 scrollbar-hide mb-6 border-b border-white/5">
          {radioCategories.map(category => (
            <button
              key={category}
              onClick={() => setRadioCategory(category)}
              className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                radioCategory === category 
                  ? 'bg-white text-zinc-950' 
                  : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {filteredStations.map((station) => (
            <div 
              key={station.name}
              className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 hover:bg-zinc-800 transition-all duration-300 group relative overflow-hidden flex flex-col cursor-pointer"
              onClick={() => togglePlay(station.url, station.name)}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              <div className="w-full aspect-square bg-zinc-950 rounded-xl mb-4 flex items-center justify-center relative shadow-inner overflow-hidden border border-white/5 group-hover:border-amber-500/30 transition-colors">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-zinc-950"></div>
                {playingUrl === station.url ? (
                  <div className="relative z-10 flex flex-col items-center gap-2">
                     <div className="flex gap-1 items-end h-6">
                        <div className="w-1.5 bg-amber-500 rounded-t h-2 animate-[bounce_1s_infinite]"></div>
                        <div className="w-1.5 bg-amber-500 rounded-t h-4 animate-[bounce_1.2s_infinite]"></div>
                        <div className="w-1.5 bg-amber-500 rounded-t h-3 animate-[bounce_0.8s_infinite]"></div>
                        <div className="w-1.5 bg-amber-500 rounded-t h-5 animate-[bounce_1.1s_infinite]"></div>
                     </div>
                  </div>
                ) : (
                  <Radio className="w-12 h-12 text-zinc-700 relative z-10 group-hover:scale-110 group-hover:text-amber-500 transition-all duration-500" />
                )}
                
                <div className={`absolute bottom-2 right-2 w-10 h-10 rounded-full flex flex-col items-center justify-center shadow-xl transition-all duration-300 ${playingUrl === station.url ? 'bg-amber-500 text-amber-950 opacity-100 translate-y-0' : 'bg-white text-zinc-950 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0'}`}>
                  {playingUrl === station.url ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                </div>
              </div>

              <div className="relative z-10">
                <h3 className="text-base font-bold text-white mb-1 truncate">{station.name}</h3>
                <div className="flex items-center justify-between">
                  <p className="text-zinc-500 text-xs font-medium truncate">{station.category} • {station.country}</p>
                  <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ml-2">
                    {station.frequency}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
