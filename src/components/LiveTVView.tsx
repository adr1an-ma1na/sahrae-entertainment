import { Tv, Play, RadioTower, X, Maximize } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';

const CHANNELS = [
  // ── News — verified direct HLS (play instantly, reliable) ──
  { name: 'Al Jazeera English', country: 'Qatar', category: 'News', url: 'https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8' },
  { name: 'NBC News NOW', country: 'USA', category: 'News', url: 'https://d1si3n1st4nkgb.cloudfront.net/10502/88896001/hls/master.m3u8?ads.xumo_channelId=88896001' },
  { name: 'WION', country: 'India', category: 'News', url: 'https://d7x8z4yuq42qn.cloudfront.net/index_7.m3u8' },
  { name: 'Africanews', country: 'Africa', category: 'News', url: 'https://c3c275b999764df8a2dd55ffe2996818.mediatailor.eu-west-1.amazonaws.com/v1/master/0547f18649bd788bec7b67b746e47670f558b6b2/production-LiveChannel-6576/bitok/eyJzdGlkIjoiOTU0NDAyODQtOTU0My00Yzc2LThmZjQtNDRhY2YwYmQxYTYwIiwibWt0IjoicGwiLCJjaCI6NjYwNiwicHRmIjo1fQ==/26036/africanews-en.m3u8' },
  { name: 'CBS News', country: 'USA', category: 'News', url: 'https://cbsn-us-vtt.cbsnstream.cbsnews.com/out/v1/ef868690d34144509eda696884bf1619/master.m3u8' },
  { name: 'India Today', country: 'India', category: 'News', url: 'https://d1rc86nwwc9fag.cloudfront.net/vglive-sk-293160/master.m3u8' },
  { name: 'DW News', country: 'Germany', category: 'News', url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8' },
  { name: 'France 24 English', country: 'France', category: 'News', url: 'https://static.france24.com/live/F24_EN_HI_HLS/live_web.m3u8' },
  { name: 'CNA', country: 'Singapore', category: 'News', url: 'https://d2e1asnsl7br7b.cloudfront.net/7782e205e72f43aeb4a48ec97f66ebbe/index.m3u8' },
  { name: 'TRT World', country: 'Turkey', category: 'News', url: 'https://tv-trtworld.medya.trt.com.tr/master.m3u8' },
  { name: 'CGTN', country: 'China', category: 'News', url: 'https://amg00405-rakutentv-cgtn-rakuten-i9tar.amagi.tv/master.m3u8' },

  // ── News — YouTube live (best-effort; live when the channel is broadcasting) ──
  { name: 'CNN', country: 'USA', category: 'News', url: 'youtube_channel:UCupvZG-5ko_eiXAupbDfxWw' },
  { name: 'Firstpost', country: 'India', category: 'News', url: 'youtube_channel:UCz8QaiQxApLq8sLNcszYyJw' },

  // ── Documentary ──
  { name: 'BBC Earth', country: 'UK', category: 'Documentary', url: 'https://amg00793-amg00793c6-xumo-us-2669.playouts.now.amagi.tv/BBCStudios-BBCEarthA-hls/playlist.m3u8' },
  { name: 'CGTN Documentary', country: 'China', category: 'Documentary', url: 'https://amg00405-rakutentv-cgtndocumentary-rakuten-0ql8j.amagi.tv/master.m3u8' },
  { name: 'CNA Originals', country: 'Singapore', category: 'Documentary', url: 'https://amg01082-cna-amg01082c1-rlaxx-us-11304.playouts.now.amagi.tv/playlist.m3u8' },

  // ── Animation ──
  { name: 'FilmRise Anime', country: 'Global', category: 'Animation', url: 'https://dvu7aia8rjlfm.cloudfront.net/master.m3u8' },
  { name: 'Naruto', country: 'Global', category: 'Animation', url: 'https://d21vn5eki5qsdi.cloudfront.net/playlist.m3u8' },

  // ── Science (bonus) ──
  { name: 'NASA TV', country: 'USA', category: 'Science', url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8' },
];

const HLSPlayer = ({ src }: { src: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log('Auto-play prevented:', e));
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error', event, data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });

      return () => {
        hls.destroy();
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.log('Auto-play prevented:', e));
      });
    }
  }, [src]);

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full object-contain bg-black"
      controls
      autoPlay
      playsInline
      muted={false}
    />
  );
};


export default function LiveTVView() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeChannel, setActiveChannel] = useState<typeof CHANNELS[0] | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  
  const categories = ['All', ...Array.from(new Set(CHANNELS.map(c => c.category)))].sort();
  
  const filteredChannels = selectedCategory === 'All' 
    ? CHANNELS 
    : CHANNELS.filter(c => c.category === selectedCategory);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeChannel) {
        setActiveChannel(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeChannel]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.error(`Error attempting to exit fullscreen: ${err.message}`);
      });
    }
  };

  return (
    <div className="pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12 relative">
      {activeChannel && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm p-4 md:p-12">
          <div ref={playerContainerRef} className="w-full max-w-5xl aspect-video bg-black rounded-lg shadow-2xl overflow-hidden relative border border-white/10 flex flex-col">
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-center transition-opacity">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-red-500 text-white px-2.5 py-1 rounded-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                  <span className="text-xs font-bold uppercase tracking-wider">Live</span>
                </div>
                <h3 className="text-white font-bold text-lg drop-shadow-md">{activeChannel.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={toggleFullScreen}
                  className="w-10 h-10 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center transition-colors border border-white/10"
                >
                  <Maximize className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setActiveChannel(null)}
                  className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="w-full h-full flex-grow relative bg-black">
              {(() => {
                const isYouTubeChannel = activeChannel.url.startsWith('youtube_channel:');
                const isYouTubeVideo = activeChannel.url.startsWith('youtube_video:');
                
                if (isYouTubeChannel) {
                  const channelId = activeChannel.url.split(':')[1];
                  return (
                    <iframe
                      src={`https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1&rel=0&showinfo=0&modestbranding=1&iv_load_policy=3`}
                      className="w-full h-full border-none bg-black absolute inset-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      sandbox="allow-same-origin allow-scripts allow-presentation allow-popups"
                    />
                  );
                }
                
                if (isYouTubeVideo) {
                  const videoId = activeChannel.url.split(':')[1];
                  return (
                    <iframe
                      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&showinfo=0&modestbranding=1&iv_load_policy=3`}
                      className="w-full h-full border-none bg-black absolute inset-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      sandbox="allow-same-origin allow-scripts allow-presentation allow-popups"
                    />
                  );
                }
                
                const isTwitch = activeChannel.url.includes('twitch.tv/');
                if (isTwitch) {
                  const channel = activeChannel.url.split('.tv/')[1];
                  return (
                    <iframe
                      src={`https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}&autoplay=true`}
                      className="w-full h-full border-none bg-black absolute inset-0"
                      allowFullScreen
                      sandbox="allow-same-origin allow-scripts allow-presentation"
                      referrerPolicy="no-referrer"
                    />
                  );
                }
                
                // Use HLSPlayer for .m3u8 links
                return <HLSPlayer src={activeChannel.url} />;
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <RadioTower className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white">Live Broadcasts</h2>
        </div>
        
        <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === category 
                  ? 'bg-white text-zinc-950 shadow-md' 
                  : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {filteredChannels.map((channel) => (
          <div 
            key={channel.name}
            className="bg-zinc-900/60 border border-white/5 rounded-3xl p-5 hover:bg-zinc-800 transition-all duration-300 group relative flex flex-col"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
            
            <div className="flex-grow z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                  <Tv className="w-5 h-5 text-zinc-400 group-hover:text-amber-500 transition-colors" />
                </div>
                <div className="flex items-center gap-1.5 bg-red-500/10 text-red-500 px-2.5 py-1 rounded-full border border-red-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    On Air
                  </span>
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-white leading-tight mb-2 group-hover:text-amber-400 transition-colors line-clamp-2">{channel.name}</h3>
              
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="px-2.5 py-1 bg-white/5 rounded-lg text-xs font-medium text-zinc-400">{channel.country}</span>
                <span className="px-2.5 py-1 bg-white/5 rounded-lg text-xs font-medium text-zinc-400">{channel.category}</span>
              </div>
            </div>
            
            <button
              onClick={() => setActiveChannel(channel)}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold bg-white/10 text-white hover:bg-amber-500 hover:text-amber-950 transition-all z-10"
            >
              <Play className="w-4 h-4 fill-current" />
              Watch Stream
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
