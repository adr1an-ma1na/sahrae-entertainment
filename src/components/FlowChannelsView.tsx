import React, { useState, useEffect, useRef } from 'react';
import { Play, Flame, Ghost, Heart, Rocket, Compass, Layers, Tv, Volume2, VolumeX, AlertCircle, Sparkles, Swords, ShieldAlert, Film, Library, Drama } from 'lucide-react';
import { fetchDiscover, fetchMediaDetails, getImageUrl, MediaDetails } from '../services/tmdb';

const CHANNELS = [
  { id: '1', name: 'Action Cinema', icon: Flame, genreId: 28, color: 'from-orange-500 to-red-600', tag: 'Action' },
  { id: '2', name: 'Sci-Fi Universe', icon: Rocket, genreId: 878, color: 'from-blue-500 to-indigo-600', tag: 'Sci-Fi' },
  { id: '3', name: 'Laugh Lounge', icon: Heart, genreId: 35, color: 'from-yellow-400 to-orange-500', tag: 'Comedy' },
  { id: '4', name: 'Horror Fest', icon: Ghost, genreId: 27, color: 'from-zinc-700 to-black', tag: 'Horror' },
  { id: '5', name: 'Drama Desk', icon: Drama, genreId: 18, color: 'from-purple-500 to-pink-600', tag: 'Drama' },
  { id: '6', name: 'Adventure Quest', icon: Compass, genreId: 12, color: 'from-green-500 to-emerald-700', tag: 'Adventure' },
  { id: '7', name: 'Animation Zone', icon: Sparkles, genreId: 16, color: 'from-cyan-400 to-blue-500', tag: 'Animation' },
  { id: '8', name: 'Thriller Hour', icon: ShieldAlert, genreId: 53, color: 'from-red-600 to-stone-900', tag: 'Thriller' },
  { id: '9', name: 'Fantasy Realms', icon: Swords, genreId: 14, color: 'from-teal-500 to-indigo-700', tag: 'Fantasy' },
  { id: '10', name: 'Mystery Files', icon: Film, genreId: 9648, color: 'from-amber-600 to-yellow-800', tag: 'Mystery' },
  { id: '11', name: 'Crime Central', icon: Library, genreId: 80, color: 'from-slate-600 to-zinc-800', tag: 'Crime' },
  { id: '12', name: 'Romance Retreat', icon: Heart, genreId: 10749, color: 'from-pink-500 to-rose-600', tag: 'Romance' }
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
  const ytFrameRef = useRef<HTMLIFrameElement>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Real movie poster per channel for the guide tiles (instead of a flat icon).
  const [channelArt, setChannelArt] = useState<Record<string, string>>({});

  useEffect(() => {
    loadChannel(activeChannelId);
  }, [activeChannelId]);

  // Fetch a representative poster for each themed channel once, for the guide.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(CHANNELS.map(async (c) => {
        try {
          const res = await fetchDiscover('movie', 1, c.genreId);
          const withArt = res.find((m) => m.poster_path || m.backdrop_path);
          return [c.id, withArt ? getImageUrl(withArt.poster_path || withArt.backdrop_path, 'w300') : ''] as const;
        } catch { return [c.id, ''] as const; }
      }));
      if (!cancelled) setChannelArt(Object.fromEntries(entries.filter(([, u]) => u)));
    })();
    return () => { cancelled = true; };
  }, []);

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
  // Keep a live ref so the (mount-only) postMessage listener always advances the
  // CURRENT playlist, not a stale closure.
  const handleEndedRef = useRef(handleEnded);
  handleEndedRef.current = handleEnded;

  // Drive the plain YouTube /embed/ iframe (the path that actually plays in this
  // WebView — the IFrame-API/ReactPlayer path renders 0:00 on https://localhost).
  const post = (func: string, args: unknown[] = []) => {
    try { ytFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch { /* ignore */ }
  };
  const toggleMute = () => { const n = !muted; setMuted(n); post(n ? 'mute' : 'unMute'); };

  // Listen for the embed's state changes (handshake sent on iframe load).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      let d: any; try { d = JSON.parse(e.data); } catch { return; }
      const st = d?.event === 'onStateChange' ? d.info
        : d?.event === 'infoDelivery' && d.info && typeof d.info.playerState === 'number' ? d.info.playerState
        : undefined;
      if (st === undefined) return;
      if (st === 1) setIsActuallyPlaying(true);
      else if (st === 2) setIsActuallyPlaying(false);
      else if (st === 0) handleEndedRef.current(); // ended → next in channel
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // If a trailer never starts within 15s, skip to the next so a channel never stalls.
  useEffect(() => {
    if (!videoUrl || isActuallyPlaying) return;
    const t = setTimeout(() => handleEndedRef.current(), 15000);
    return () => clearTimeout(t);
  }, [videoUrl, isActuallyPlaying]);

  const activeChannel = CHANNELS.find(c => c.id === activeChannelId);
  const ytId = videoUrl ? (videoUrl.match(/[?&]v=([^&]+)/)?.[1] || '') : '';

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-[1600px] mx-auto pb-24">
      {/* Page Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
          <Tv className="w-6 h-6 text-white animate-pulse" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Flow Channels</h2>
          <p className="text-sm text-zinc-400">Continuous 24/7 themed cinematic streams. Sit back and discover.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Main TV Player (3 cols wide) */}
        <div className="lg:col-span-3">
          <div className="relative w-full aspect-video bg-zinc-950 rounded-2xl overflow-hidden border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.6)] group">
            
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

            {ytId && (
              <div className="absolute inset-0 z-0 pointer-events-none">
                <iframe
                  key={ytId}
                  ref={ytFrameRef}
                  src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&playsinline=1&enablejsapi=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0`}
                  title="Flow Channel"
                  className="w-full h-full border-none bg-black"
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  onLoad={() => { try { ytFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*'); } catch { /* ignore */ } if (!muted) post('unMute'); }}
                />
              </div>
            )}

            {/* TV Overlay HUD */}
            <div className={`absolute inset-0 z-10 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent flex flex-col justify-end p-6 md:p-8 transition-opacity duration-500 ${showOverlay || !videoUrl ? 'opacity-100' : 'opacity-0'}`}>
              
              <div className="absolute top-6 right-6 flex items-center gap-3">
                {isActuallyPlaying && (
                  <button
                    onClick={toggleMute}
                    className="p-3 bg-black/50 hover:bg-black/80 backdrop-blur-md rounded-full text-white transition-colors pointer-events-auto shadow-lg"
                  >
                    {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                )}
                {isActuallyPlaying && (
                  <div className={`px-4 py-2 bg-gradient-to-r ${activeChannel?.color} rounded-xl text-white font-bold text-xs shadow-xl border border-white/20 flex items-center gap-2 transition-all`}>
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    LIVE STREAM
                  </div>
                )}
              </div>

              {playingMedia && (
                <div className="flex flex-col md:flex-row items-end justify-between gap-6 w-full animate-in slide-in-from-bottom-4">
                  <div className="max-w-2xl text-left">
                    <div className="flex items-center gap-3 mb-2">
                      {activeChannel?.icon && <activeChannel.icon className="w-5 h-5 text-amber-500 animate-pulse" />}
                      <span className="text-amber-500 font-bold tracking-widest text-xs uppercase">{activeChannel?.name}</span>
                    </div>
                    <h2 className="text-2xl md:text-4xl font-black text-white mb-2 line-clamp-1">{playingMedia.title}</h2>
                    <p className="text-zinc-300 line-clamp-2 text-xs md:text-sm leading-relaxed mb-4">
                      {playingMedia.overview}
                    </p>
                    <div className="flex items-center gap-3 pointer-events-auto">
                      <button 
                        onClick={() => onPlay(playingMedia.id, 'movie')}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center gap-2 transition-all hover:scale-105 shadow-xl text-xs"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Play Movie Fullscreen
                      </button>
                      <button 
                        onClick={() => handleEnded()}
                        className="btn-glass px-5 py-2.5 font-bold rounded-xl text-xs"
                      >
                        Skip Trailer
                      </button>
                    </div>
                  </div>
                  
                  {/* Up Next Queue Overlay */}
                  {playlist.length > 1 && (
                    <div className="hidden lg:flex flex-col gap-2 shrink-0 self-end">
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Up Next</h4>
                      <div className="flex items-end gap-2.5 justify-end pointer-events-none">
                        {playlist.slice(playlistIndexRef.current + 1, playlistIndexRef.current + 4).map((item, idx) => (
                           <div key={item.id + idx} className={`relative rounded-lg overflow-hidden border border-white/10 shadow-lg ${idx === 0 ? 'w-28 aspect-video opacity-100' : 'w-20 aspect-video opacity-50'}`}>
                             <img src={getImageUrl(item.backdrop_path, 'w300')} alt={item.title} className="w-full h-full object-cover" />
                             <div className="absolute inset-0 bg-gradient-to-t from-black/80 flex items-end p-1.5">
                               <p className="text-white text-[9px] font-bold line-clamp-1">{item.title}</p>
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

        {/* Channel Switcher (1 col wide, tall list for 12 channels) */}
        <div className="lg:col-span-1 glass rounded-2xl p-4 flex flex-col h-[56.25vw] max-h-[500px] lg:h-auto lg:max-h-[56.25vw] overflow-hidden">
          <div className="flex items-center justify-between mb-3 px-2 border-b border-white/5 pb-2">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Channel Guide</h3>
            <span className="text-[10px] font-mono font-bold text-amber-500 animate-pulse">● 12 ACTIVE CHANNELS</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {CHANNELS.map(channel => {
              const Icon = channel.icon;
              const isActive = activeChannelId === channel.id;
              
              return (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannelId(channel.id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all border text-left ${
                    isActive 
                      ? 'bg-zinc-900 border-amber-500/50 shadow-lg scale-[1.01]' 
                      : 'bg-zinc-950/40 border-transparent hover:bg-zinc-900/60 hover:border-white/5'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden relative flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 shrink-0 shadow-inner">
                    {channelArt[channel.id] ? (
                      <img src={channelArt[channel.id]} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Icon className="w-5 h-5 text-zinc-500" />
                    )}
                    <div className="absolute inset-0 bg-black/20" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <h4 className={`font-bold text-xs truncate ${isActive ? 'text-amber-400 font-black' : 'text-zinc-200'}`}>{channel.name}</h4>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 font-bold border border-white/5 scale-90">{channel.tag}</span>
                    </div>
                    {isActive ? (
                      isActuallyPlaying ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="flex gap-0.5 items-end h-2.5">
                            <span className="w-0.5 h-1.5 bg-amber-500 rounded-full animate-[eq_0.9s_ease-in-out_infinite_alternate]" style={{ animationDelay: '0.1s' }}></span>
                            <span className="w-0.5 h-2.5 bg-amber-500 rounded-full animate-[eq_0.9s_ease-in-out_infinite_alternate]" style={{ animationDelay: '0.2s' }}></span>
                            <span className="w-0.5 h-1 bg-amber-500 rounded-full animate-[eq_0.9s_ease-in-out_infinite_alternate]" style={{ animationDelay: '0.3s' }}></span>
                          </div>
                          <span className="text-[10px] text-amber-500 font-bold">ON AIR</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-400 block mt-0.5 animate-pulse">Tuning signal...</span>
                      )
                    ) : (
                      <span className="text-[10px] text-zinc-500 block mt-0.5">Static broadcast</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Redesigned Active Channel Interactive Dashboard (Effective Space Use) */}
      {playingMedia && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in slide-in-from-bottom-6 duration-700">
          
          {/* Column 1: Poster and Essential Quick Info (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-4 text-left">
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-xl aspect-[2/3] group bg-zinc-900">
              <img
                src={getImageUrl(playingMedia.poster_path || playingMedia.backdrop_path, 'w500')}
                alt={playingMedia.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
              />
              <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15 flex items-center gap-1 text-xs font-bold text-amber-400 shadow-md">
                <span className="text-amber-500">★</span>
                <span>{playingMedia.vote_average?.toFixed(1) || '0.0'}</span>
              </div>
            </div>
            
            {/* Quick Specs */}
            <div className="bg-zinc-950/80 border border-white/5 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center text-xs text-zinc-500 font-bold uppercase tracking-wider border-b border-white/5 pb-2">
                <span>Release Year</span>
                <span className="text-white">{playingMedia.release_date?.split('-')[0] || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-zinc-500 font-bold uppercase tracking-wider border-b border-white/5 pb-2">
                <span>Runtime</span>
                <span className="text-white">{playingMedia.runtime ? `${playingMedia.runtime}m` : 'N/A'}</span>
              </div>
              <div className="flex flex-col gap-1.5 text-xs text-zinc-500 font-bold uppercase tracking-wider">
                <span>Genres</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {playingMedia.genres?.map((g) => (
                    <span key={g.id} className="px-2.5 py-1 bg-white/5 text-zinc-300 rounded-lg text-[9px] font-bold border border-white/5">
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Column 2: Synopsis and Rich Interactive Metadata (9 cols) */}
          <div className="lg:col-span-9 space-y-6 text-left">
            
            {/* Show Overview / Details Card */}
            <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-6 md:p-8 space-y-5">
              <div>
                <span className="text-amber-500 font-bold text-[10px] uppercase tracking-widest block mb-1">Now Streaming on {activeChannel?.name}</span>
                <h3 className="text-2xl md:text-3xl font-display font-black text-white tracking-tight">{playingMedia.title}</h3>
              </div>
              
              <div className="border-t border-white/5 pt-4">
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Synopsis</h4>
                <p className="text-zinc-300 text-sm md:text-base leading-relaxed">{playingMedia.overview || "No synopsis available for this title."}</p>
              </div>
              
              {/* Director Card details */}
              {playingMedia.credits?.crew && playingMedia.credits.crew.some(c => c.job === 'Director') && (
                <div className="border-t border-white/5 pt-4">
                  <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Director</h4>
                  <p className="text-white font-bold text-sm">
                    {playingMedia.credits.crew.filter(c => c.job === 'Director').map(c => c.name).join(', ')}
                  </p>
                </div>
              )}
            </div>
            
            {/* Cast Carousel - beautiful horizontal scroll with profile images */}
            {playingMedia.credits?.cast && playingMedia.credits.cast.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">Starring Cast</h4>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {playingMedia.credits.cast.slice(0, 10).map((actor) => (
                    <div key={actor.id} className="flex flex-col items-center text-center shrink-0 w-20">
                      <div className="w-16 h-16 rounded-full overflow-hidden border border-white/10 shadow-md mb-2 bg-zinc-900">
                        {actor.profile_path ? (
                          <img
                            src={getImageUrl(actor.profile_path, 'w185')}
                            alt={actor.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-500 font-display font-bold text-sm">
                            {actor.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-white line-clamp-1 w-full">{actor.name}</span>
                      <span className="text-[9px] text-zinc-500 line-clamp-1 w-full mt-0.5">{actor.character}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
          </div>
        </div>
      )}
    </div>
  );
}
