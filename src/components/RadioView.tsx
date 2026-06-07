import { Play, Pause, Radio } from 'lucide-react';
import { useState } from 'react';
import { useRadio } from '../hooks/useRadio';

const STATIONS = [
  // Kenya
  { name: 'Capital FM', country: 'Kenya', category: 'Pop', frequency: '98.4', url: 'https://capitalfm.cloudrad.io/stream' },
  { name: 'Classic 105', country: 'Kenya', category: 'Classic', frequency: '105.2', url: 'https://classic105-atunwadigital.streamguys1.com/classic105' },
  { name: 'Radio Jambo', country: 'Kenya', category: 'Talk', frequency: '97.5', url: 'https://radiojambo-atunwadigital.streamguys1.com/radiojambo' },
  { name: 'Radio Citizen', country: 'Kenya', category: 'Talk', frequency: '106.7', url: 'https://radiocitizen-atunwadigital.streamguys1.com/radiocitizen' },
  { name: 'Hot 96', country: 'Kenya', category: 'Hip-Hop', frequency: '96.3', url: 'https://hot96-atunwadigital.streamguys1.com/hot96' },
  { name: 'East FM', country: 'Kenya', category: 'Asian', frequency: '106.3', url: 'https://eastfm-atunwadigital.streamguys1.com/eastfm' },

  // News / Public
  { name: 'BBC World Service', country: 'UK', category: 'News', frequency: 'Digital', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service' },
  { name: 'NPR', country: 'USA', category: 'News', frequency: 'Digital', url: 'https://npr-ice.streamguys1.com/live.mp3' },
  { name: 'WNYC FM', country: 'USA', category: 'Public', frequency: '93.9', url: 'https://fm939.wnyc.org/wnycfm.aac' },

  // Indie / Pop / Dance
  { name: 'KEXP', country: 'USA', category: 'Indie', frequency: '90.3', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { name: 'NRJ', country: 'France', category: 'Pop', frequency: 'Digital', url: 'https://cdn.nrjaudio.fm/audio1/fr/30001/mp3_128.mp3' },
  { name: 'Dance Wave', country: 'Global', category: 'Dance', frequency: 'Digital', url: 'https://dancewave.online/dance.mp3' },
  { name: 'Amsterdam Trance', country: 'Netherlands', category: 'Trance', frequency: 'Digital', url: 'https://strm112.1.fm/atr_mobile_mp3' },
  { name: 'Ibiza Global Radio', country: 'Spain', category: 'Electronic', frequency: 'Digital', url: 'https://listenssl.ibizaglobalradio.com:8024/igr' },

  // Jazz / Classical
  { name: 'Radio Swiss Jazz', country: 'Switzerland', category: 'Jazz', frequency: 'Digital', url: 'https://stream.srg-ssr.ch/m/rsj/mp3_128' },
  { name: 'SomaFM Sonic Universe', country: 'USA', category: 'Jazz', frequency: 'Digital', url: 'https://ice1.somafm.com/sonicuniverse-128-mp3' },
  { name: 'Classic FM', country: 'UK', category: 'Classical', frequency: '100.0', url: 'https://media-ice.musicradio.com/ClassicFMMP3' },
  { name: 'Radio Swiss Classic', country: 'Switzerland', category: 'Classical', frequency: 'Digital', url: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128' },
  { name: 'Venice Classic Radio', country: 'Italy', category: 'Classical', frequency: 'Digital', url: 'https://uk2.streamingpulse.com/ssl/vcr1' },

  // Chill / Ambient / Eclectic
  { name: 'SomaFM Groove Salad', country: 'USA', category: 'Ambient', frequency: 'Digital', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'SomaFM Drone Zone', country: 'USA', category: 'Ambient', frequency: 'Digital', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { name: 'SomaFM Secret Agent', country: 'USA', category: 'Lounge', frequency: 'Digital', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { name: 'SomaFM Def Con Radio', country: 'USA', category: 'Electronic', frequency: 'Digital', url: 'https://ice1.somafm.com/defcon-128-mp3' },
  { name: 'SomaFM Lush', country: 'USA', category: 'Chillout', frequency: 'Digital', url: 'https://ice1.somafm.com/lush-128-mp3' },
  { name: 'SomaFM Fluid', country: 'USA', category: 'Chillout', frequency: 'Digital', url: 'https://ice1.somafm.com/fluid-128-mp3' },
  { name: 'Radio Paradise', country: 'USA', category: 'Eclectic', frequency: 'Digital', url: 'https://stream.radioparadise.com/aac-128' },
  { name: 'Radio Paradise Mellow', country: 'USA', category: 'Chillout', frequency: 'Digital', url: 'https://stream.radioparadise.com/mellow-128' },
];

export default function RadioView() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const { playingUrl, togglePlay } = useRadio();

  const categories = ['All', ...Array.from(new Set(STATIONS.map(s => s.category)))].sort();
  
  const filteredStations = selectedCategory === 'All' 
    ? STATIONS 
    : STATIONS.filter(s => s.category === selectedCategory);

  return (
    <div className="pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Radio className="w-8 h-8 text-amber-500" />
          <h2 className="text-3xl font-bold text-white">Radio Stations</h2>
        </div>
        
        <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === category 
                  ? 'bg-amber-500 text-amber-950' 
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {filteredStations.map((station) => (
          <div 
            key={station.name}
            className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 hover:bg-zinc-800/50 transition-colors group relative overflow-hidden flex flex-col"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex-grow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 leading-tight">{station.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 text-xs">{station.country}</span>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider">• {station.category}</span>
                  </div>
                </div>
                <div className="bg-amber-500/10 text-amber-500 px-2 py-1 rounded-md text-xs font-mono font-bold shrink-0 ml-2">
                  {station.frequency}
                </div>
              </div>
            </div>
            
            <button
              onClick={() => togglePlay(station.url, station.name)}
              className={`w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all mt-4 ${
                playingUrl === station.url 
                  ? 'bg-amber-500 text-amber-950 shadow-[0_0_20px_rgba(245,158,11,0.3)]' 
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {playingUrl === station.url ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  Playing
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Listen Live
                </>
              )}
            </button>
            
            {playingUrl === station.url && (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-zinc-800">
                <div className="h-full bg-amber-500 animate-pulse"></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
