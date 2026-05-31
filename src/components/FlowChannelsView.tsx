import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { Play, Info, Flame, Ghost, Heart, Rocket, Compass, Layers, Tv, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { fetchDiscover, fetchMediaDetails, getImageUrl, MediaDetails } from '../services/tmdb';

const CHANNELS = [
  { id: '1', name: 'Action Cinema', icon: Flame, genreId: 28, color: 'from-orange-500 to-red-600' },
  { id: '2', name: 'Sci-Fi Universe', icon: Rocket, genreId: 878, color: 'from-blue-500 to-indigo-600' },
  { id: '3', name: 'Laugh Lounge', icon: Heart, genreId: 35, color: 'from-yellow-400 to-orange-500' },
  { id: '4', name: 'Horror Fest', icon: Ghost, genreId: 27, color: 'from-zinc-700 to-black' },
  { id: '5', name: 'Drama Desk', icon: Layers, genreId: 18, color: 'from-purple-500 to-pink-600' },
  { id: '6', name: 'Adventure Quest', icon: Compass, genreId: 12, color: 'from-green-500 to-emerald-700' },
];

export default function FlowChannelsView({ onPlay }: { onPlay: (id: number, type: 'movie' | 'tv') => void }) {
  const [activeChannelId, setActiveChannelId] = useState(CHANNELS[0].id);
  const [playingMedia, setPlayingMedia] = useState<MediaDetails | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isActuallyPlaying, setIsActuallyPlaying] = useState(false);
  
  const [playlist, setPlaylist] = useState<MediaDetails[]>([]);
  const playlistIndexRef = useRef(0);
  const playerRef = useRef<any>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadChannel(activeChannelId);
  }, [activeChannelId]);

  useEffect(() => {
    // Auto-hide overlay after 5 seconds of no mouse movement
    const handleMouseMove = () => {
      setShowOverlay(true);
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = setTimeout(() => {
        setShowOverlay(false);
      }, 5000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    // Initial timeout
    overlayTimeoutRef.current = setTimeout(() => setShowOverlay(false), 5000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    };
  }, []);

  const loadChannel = async (channelId: string) => {
    setLoading(true);
    setError(false);
    setVideoUrl(null);
    setPlayingMedia(null);
    setIsActuallyPlaying(false);
    playlistIndexRef.current = 0;
    
    const channel = CHANNELS.find(c => c.id === channelId);
    if (!channel) return;

    try {
      const randomPage = Math.floor(Math.random() * 5) + 1;
      const results = await fetchDiscover('movie', randomPage, channel.genreId);
      
      const shuffled = [...results].sort(() => 0.5 - Math.random()).slice(0, 10); 
      
      const detailsPromises = shuffled.map(m => fetchMediaDetails(m.id, 'movie'));
      const detailsList = await Promise.all(detailsPromises);
      
      // Filter those with youtube trailers
      const withTrailers = detailsList.filter(m => m.videos && m.videos.results && m.videos.results.some(v => v.site === 'YouTube' && v.type === 'Trailer'));
      
      if (withTrailers.length > 0) {
        setPlaylist(withTrailers);
        playNext(withTrailers, 0);
      } else {
        setError(true);
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
      setError(true);
      setLoading(false);
    }
  };

  const playNext = (list = playlist, index = playlistIndexRef.current) => {
    if (!list || list.length === 0) return;
    
    if (index >= list.length) {
      // Re-tune to get a fresh batch of movies when we reach the end
      loadChannel(activeChannelId);
      return;
    }
    
    const media = list[index];
    setPlayingMedia(media);
    setIsActuallyPlaying(false);
    
    const trailer = media.videos?.results.find(v => v.site === 'YouTube' && v.type === 'Trailer') || 
                    media.videos?.results.find(v => v.site === 'YouTube'); // fallback to any yt video
                    
    if (trailer) {
      setVideoUrl(`https://www.youtube.com/watch?v=${trailer.key}`);
    } else {
      // Skip if no trailer somehow
      playlistIndexRef.current += 1;
      playNext(list, playlistIndexRef.current);
    }
    setLoading(false);
  };

  const handleEnded = () => {
    playlistIndexRef.current += 1;
    playNext();
  };

  const handleError = () => {
    console.log("Video error, skipping...");
    handleEnded();
  };

  const activeChannel = CHANNELS.find(c => c.id === activeChannelId);

  return (
    <div className="pt-20 px-4 md:px-12 max-w-[1600px] mx-auto pb-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3 mb-2">
            <Tv className="w-8 h-8 text-amber-500" />
            Flow Channels
          </h1>
          <p className="text-zinc-400">Continuous 24/7 themed streams. Sit back and discover.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Main TV Player */}
        <div className="lg:col-span-3">
          <div className="relative w-full aspect-video bg-zinc-950 rounded-2xl overflow-hidden border border-white/10 shadow-2xl group">
            
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-20">
                <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-zinc-400 font-medium animate-pulse">Tuning to {activeChannel?.name}...</p>
              </div>
            )}
            
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-20 text-center px-4">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <p className="text-zinc-300 font-medium">Channel signal lost.</p>
                <button 
                  onClick={() => loadChannel(activeChannelId)}
                  className="mt-4 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors text-sm font-bold"
                >
                  Retune Channel
                </button>
              </div>
            )}

            {videoUrl && (
              <div className="absolute inset-0 z-0">
                <ReactPlayer
                  ref={playerRef}
                  url={videoUrl}
                  width="100%"
                  height="100%"
                  playing={true}
                  muted={muted}
                  controls={false}
                  onPlay={() => setIsActuallyPlaying(true)}
                  onPause={() => setIsActuallyPlaying(false)}
                  onEnded={handleEnded}
                  onError={handleError}
                  config={{ 
                    youtube: { 
                      playerVars: { 
                        showinfo: 0, 
                        modestbranding: 1, 
                        rel: 0,
                        disablekb: 1
                      } 
                    } 
                  }}
                  style={{ pointerEvents: 'none' }} // Prevent clicking the youtube iframe directly
                />
              </div>
            )}

            {/* TV Overlay / Guide */}
            <div className={`absolute inset-0 z-10 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent flex flex-col justify-end p-6 md:p-8 transition-opacity duration-500 ${showOverlay || !videoUrl ? 'opacity-100' : 'opacity-0'}`}>
              
              <div className="absolute top-6 right-6 flex items-center gap-3">
                {isActuallyPlaying && (
                  <button 
                    onClick={() => setMuted(!muted)}
                    className="p-3 bg-black/50 hover:bg-black/80 backdrop-blur-md rounded-full text-white transition-colors"
                  >
                    {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                )}
                {isActuallyPlaying && (
                  <div className={`px-4 py-2 bg-gradient-to-r ${activeChannel?.color} rounded-full text-white font-bold text-sm shadow-lg border border-white/20 flex items-center gap-2 transition-all`}>
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    LIVE
                  </div>
                )}
              </div>

              {playingMedia && (
                <div className="flex flex-col md:flex-row items-end justify-between gap-6 w-full animate-in slide-in-from-bottom-4">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-3 mb-3">
                      {activeChannel?.icon && <activeChannel.icon className="w-5 h-5 text-amber-500 animate-pulse" />}
                      <span className="text-amber-500 font-bold tracking-widest text-sm uppercase">{activeChannel?.name}</span>
                    </div>
                    <h2 className="text-3xl md:text-5xl font-black text-white mb-2 line-clamp-1">{playingMedia.title}</h2>
                    <p className="text-zinc-300 line-clamp-2 md:line-clamp-3 mb-6 text-sm md:text-base leading-relaxed">
                      {playingMedia.overview}
                    </p>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => onPlay(playingMedia.id, 'movie')}
                        className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center gap-2 transition-all hover:scale-105 shadow-xl"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        Play Movie
                      </button>
                      <button 
                        onClick={() => handleEnded()}
                        className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-bold rounded-xl transition-all border border-white/10"
                      >
                        Skip Trailer
                      </button>
                    </div>
                  </div>
                  
                  {/* Up Next Queue */}
                  {playlist.length > 1 && (
                    <div className="hidden lg:flex flex-col gap-3 shrink-0 self-end">
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest text-right">Up Next</h4>
                      <div className="flex items-end gap-3 justify-end pointer-events-none">
                        {playlist.slice(playlistIndexRef.current + 1, playlistIndexRef.current + 4).map((item, idx) => (
                           <div key={item.id + idx} className={`relative rounded-lg overflow-hidden border border-white/10 shadow-lg ${idx === 0 ? 'w-32 aspect-video opacity-100' : 'w-24 aspect-video opacity-50'}`}>
                             <img src={getImageUrl(item.backdrop_path, 'w300')} alt={item.title} className="w-full h-full object-cover" />
                             <div className="absolute inset-0 bg-gradient-to-t from-black/80 flex items-end p-2">
                               <p className="text-white text-[10px] font-bold line-clamp-1">{item.title}</p>
                             </div>
                           </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Scanlines Effect */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] z-10 opacity-30"></div>
          </div>
        </div>

        {/* Channel Switcher */}
        <div className="lg:col-span-1 bg-zinc-900/50 rounded-2xl border border-white/5 p-4 flex flex-col max-h-[80vh] overflow-hidden">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 px-2">Channel Guide</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {CHANNELS.map(channel => {
              const Icon = channel.icon;
              const isActive = activeChannelId === channel.id;
              
              return (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannelId(channel.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all border ${
                    isActive 
                      ? 'bg-zinc-800 border-amber-500/50 shadow-lg' 
                      : 'bg-zinc-950/50 border-transparent hover:bg-zinc-800/80 hover:border-white/10'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-gradient-to-br ${channel.color} shrink-0 shadow-inner`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h4 className={`font-bold ${isActive ? 'text-white' : 'text-zinc-300'}`}>{channel.name}</h4>
                    {isActive ? (
                      isActuallyPlaying ? (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex gap-1">
                            <span className="w-1 h-3 bg-amber-500 rounded-full animate-[bounce_1s_infinite_100ms]"></span>
                            <span className="w-1 h-3 bg-amber-500 rounded-full animate-[bounce_1s_infinite_200ms]"></span>
                            <span className="w-1 h-3 bg-amber-500 rounded-full animate-[bounce_1s_infinite_300ms]"></span>
                          </div>
                          <span className="text-xs text-amber-500 font-medium">Playing</span>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 block mt-1 animate-pulse">Tuning in...</span>
                      )
                    ) : (
                      <span className="text-xs text-zinc-500 block mt-1">Tap to tune in</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
