import { X, ExternalLink, AlertCircle, Info, Star, Calendar, Clock, Play, RefreshCw, Plus, Check, Maximize, ArrowLeft, SkipBack, SkipForward, ThumbsUp, ThumbsDown, Download } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { fetchMediaDetails, MediaDetails, getImageUrl, fetchSimilar, MediaItem, SeasonDetails, fetchSeasonDetails } from '../services/tmdb';
import { useWatchProgress } from '../hooks/useWatchProgress';
import { useMyList } from '../hooks/useMyList';
import MovieDownloadModal from './MovieDownloadModal';

interface PlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId: number | null;
  mediaType: 'movie' | 'tv' | null;
  startInInfo?: boolean;
  initialSeason?: number;
  initialEpisode?: number;
  playTrailer?: boolean;
}

export default function PlayerModal({ isOpen, onClose, mediaId, mediaType, startInInfo = false, initialSeason, initialEpisode, playTrailer = false }: PlayerModalProps) {
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [seasonDetails, setSeasonDetails] = useState<SeasonDetails | null>(null);
  const [similar, setSimilar] = useState<MediaItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [infoTab, setInfoTab] = useState<'details' | 'similar' | 'episodes'>('details');
  const [playingTrailer, setPlayingTrailer] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState(initialSeason || 1);
  const [selectedEpisode, setSelectedEpisode] = useState(initialEpisode || 1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentMediaId, setCurrentMediaId] = useState<number | null>(mediaId);
  const [currentMediaType, setCurrentMediaType] = useState<'movie' | 'tv' | null>(mediaType);
  const [isSandboxed, setIsSandboxed] = useState(false);
  const [showNextEpisodeOverlay, setShowNextEpisodeOverlay] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [offlineBlobUrl, setOfflineBlobUrl] = useState<string | null>(null);
  const [showDownload, setShowDownload] = useState(false);
  const [showXRay, setShowXRay] = useState(false);

  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Go fullscreen AFTER the embed has loaded and started playing (fired from the
  // iframe's onLoad), not the instant Play is tapped. Tapping Play then waiting
  // for the embed to autostart and only then fullscreening avoids the old
  // "fullscreen first → tap play → drops out of fullscreen" double-tap mess.
  const enterFullscreen = useCallback(() => {
    if (document.fullscreenElement) return; // already fullscreen — don't re-request
    playerContainerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    setIsSandboxed(window.self !== window.top);
  }, []);

  useEffect(() => {
    setCurrentMediaId(mediaId);
    setCurrentMediaType(mediaType);
  }, [mediaId, mediaType]);
  
  const { saveProgress } = useWatchProgress();
  const { toggleMyList, isInMyList } = useMyList();
  const wakeLockRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const toggleFullScreen = () => {
    const doc = document as any;
    const el = playerContainerRef.current as any;
    const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (fsEl) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      try { exit?.call(document); } catch { /* noop */ }
    } else if (el) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      try { const p = req?.call(el); if (p && p.catch) p.catch(() => {}); } catch { /* noop */ }
    }
  };

  // When a movie/show starts playing, silence music & radio (claim the speaker).
  useEffect(() => {
    if (isOpen && isPlaying) {
      window.dispatchEvent(new CustomEvent('sahrae:audioclaim', { detail: 'video' }));
    }
  }, [isOpen, isPlaying]);

  // Prevent screen from sleeping while video is active
  useEffect(() => {
    const acquireWakeLock = async () => {
      if ('wakeLock' in navigator && isOpen && isPlaying) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.log('Wake Lock permission denied or not supported');
        }
      }
    };

    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquireWakeLock();
    };

    if (isOpen && isPlaying) {
      acquireWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isOpen, isPlaying]);

  // Server priority per user: VidLink → VidZee → VidRock, then the most reliable
  // high-quality embeds. Dropped VidLink-API (returns JSON, not a player) and the
  // flaky AutoEmbed; added VidSrc.cc + VidFast (4K/HD, multi-audio).
  const SERVERS = [
    { id: 'vidlink', name: 'Server 1 (VidLink)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidlink.pro/movie/${id}?primaryColor=f59e0b&autoplay=true` : `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=f59e0b&autoplay=true&nextbutton=false`, type: 'iframe' },
    { id: 'vidzee', name: 'Server 2 (VidZee)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://player.vidzee.wtf/embed/movie/${id}` : `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}`, type: 'iframe' },
    { id: 'vidrock', name: 'Server 3 (VidRock)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidrock.ru/embed/movie/${id}` : `https://vidrock.ru/embed/tv/${id}/${s}/${e}`, type: 'iframe' },
    { id: 'vidsrccc', name: 'Server 4 (VidSrc CC)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidsrc.cc/v2/embed/movie/${id}?autoPlay=true` : `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}?autoPlay=true`, type: 'iframe' },
    { id: 'vidfast', name: 'Server 5 (VidFast)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidfast.pro/movie/${id}?theme=f59e0b&autoPlay=true` : `https://vidfast.pro/tv/${id}/${s}/${e}?theme=f59e0b&autoPlay=true`, type: 'iframe' },
    { id: 'vidsrcto', name: 'Server 6 (VidSrc To)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidsrc.to/embed/movie/${id}` : `https://vidsrc.to/embed/tv/${id}/${s}/${e}`, type: 'iframe' },
    { id: 'vidsrcpm', name: 'Server 7 (VidSrc PM)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidsrc.pm/embed/movie?tmdb=${id}` : `https://vidsrc.pm/embed/tv?tmdb=${id}&season=${s}&episode=${e}`, type: 'iframe' },
    { id: 'vidsrcicu', name: 'Server 8 (VidSrc ICU)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidsrc.icu/embed/movie/${id}` : `https://vidsrc.icu/embed/tv/${id}/${s}/${e}`, type: 'iframe' },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      setIsPlaying(!startInInfo && !playTrailer); 
      setPlayingTrailer(null);
      setSelectedServer(0); 
      setSelectedSeason(initialSeason || 1);
      setSelectedEpisode(initialEpisode || 1);
      setRating(null);
      if (currentMediaId && currentMediaType) {
        fetchMediaDetails(currentMediaId, currentMediaType).then(data => {
          setDetails(data);
          
          if (playTrailer && data.videos && data.videos.results) {
            const t = data.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'en') 
                   || data.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
            if (t) setPlayingTrailer(t.key);
          }
          
          if (!startInInfo && !playTrailer) {
            saveProgress(currentMediaId, currentMediaType, data, initialSeason || 1, initialEpisode || 1);
          }
        }).catch(console.error);
        
        fetchSimilar(currentMediaId, currentMediaType).then(data => {
          setSimilar(data);
        }).catch(console.error);
      }
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
      setDetails(null);
      setPlayingTrailer(null);
    };
  }, [isOpen, onClose, currentMediaId, currentMediaType, startInInfo, initialSeason, initialEpisode, playTrailer]);

  // Update progress when season/episode changes or when switching from info to player
  useEffect(() => {
    if (isOpen && isPlaying && details && currentMediaId && currentMediaType) {
      saveProgress(currentMediaId, currentMediaType, details, selectedSeason, selectedEpisode);
    }
  }, [selectedSeason, selectedEpisode, isPlaying, isOpen, details, currentMediaId, currentMediaType]);

  // Fetch season details when season changes
  useEffect(() => {
    if (isOpen && currentMediaType === 'tv' && currentMediaId) {
      setSeasonDetails(null);
      fetchSeasonDetails(currentMediaId, selectedSeason)
        .then(data => {
          if (data && data.episodes) {
            setSeasonDetails(data);
          } else {
            setSeasonDetails({ episodes: [], ...data });
          }
        })
        .catch(console.error);
    }
  }, [isOpen, currentMediaType, currentMediaId, selectedSeason]);

  const handleSkipEpisode = (direction: 'next' | 'prev') => {
    if (currentMediaType === 'tv' && details?.seasons) {
      const currentSeasonData = details.seasons.find(s => s.season_number === selectedSeason);
      if (direction === 'next') {
        if (currentSeasonData && selectedEpisode < currentSeasonData.episode_count) {
          setSelectedEpisode(prev => prev + 1);
        } else {
          const nextSeasonData = details.seasons.find(s => s.season_number === selectedSeason + 1);
          if (nextSeasonData) {
            setSelectedSeason(selectedSeason + 1);
            setSelectedEpisode(1);
          }
        }
      } else {
        if (selectedEpisode > 1) {
          setSelectedEpisode(prev => prev - 1);
        } else if (selectedSeason > 1) {
          const prevSeasonData = details.seasons.find(s => s.season_number === selectedSeason - 1);
          if (prevSeasonData) {
            setSelectedSeason(selectedSeason - 1);
            setSelectedEpisode(prevSeasonData.episode_count);
          }
        }
      }
      setRefreshKey(prev => prev + 1);
      setShowNextEpisodeOverlay(false);
    }
  };

  const hasNextEpisode = () => {
    if (currentMediaType !== 'tv' || !details?.seasons) return false;
    const currentSeasonData = details.seasons.find(s => s.season_number === selectedSeason);
    if (!currentSeasonData) return false;
    
    if (selectedEpisode < currentSeasonData.episode_count) return true;
    return !!details.seasons.find(s => s.season_number === selectedSeason + 1);
  };
  
  const hasPrevEpisode = () => {
    if (currentMediaType !== 'tv' || !details?.seasons) return false;
    if (selectedEpisode > 1) return true;
    return !!details.seasons.find(s => s.season_number === selectedSeason - 1);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data === 'object' && event.data?.type === 'PLAYER_EVENT') {
        const payload = event.data.data;
        if (payload?.event === 'timeupdate') {
          if (payload.currentTime > 0 && payload.duration > 0) {
            const perc = payload.currentTime / payload.duration;
            if (perc >= 0.90 && hasNextEpisode()) {
              setShowNextEpisodeOverlay(true);
            } else {
              setShowNextEpisodeOverlay(false);
            }
          }
        }
        if (payload?.event === 'ended' || payload?.event === 'next_episode') {
          handleSkipEpisode('next');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentMediaType, details, selectedSeason, selectedEpisode]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  if (!isOpen || !currentMediaId || !currentMediaType || !details) return null;

  const dynamicServers = [...SERVERS];

  const currentServerObj = dynamicServers[selectedServer] || dynamicServers[0];
  const src = currentServerObj.getUrl(currentMediaType, currentMediaId || 0, selectedSeason, selectedEpisode);

  
  const videos = details?.videos?.results || [];
  const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'en')
    || videos.find(v => v.site === 'YouTube' && v.type === 'Trailer')
    || videos.find(v => v.site === 'YouTube' && v.iso_639_1 === 'en')
    || videos.find(v => v.site === 'YouTube');

  return (
    <>
      <div id="player-modal-container" role="dialog" data-tv-layer className="fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm overflow-y-auto scroll-smooth py-[5vh] px-4 custom-scrollbar" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="relative w-full max-w-[900px] bg-zinc-950 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 ring-1 ring-zinc-800 h-fit">
          <button onClick={onClose} data-tv-close className="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center bg-zinc-950/60 hover:bg-zinc-800 backdrop-blur rounded-full text-white ring-1 ring-white/20 transition-all">
            <X className="w-5 h-5"/>
          </button>

          <div className="relative w-full aspect-video md:aspect-[2.2/1] bg-black">
            {playingTrailer ? (
              <div className="absolute inset-0 z-10 bg-black flex items-center justify-center">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${playingTrailer}?autoplay=1&rel=0&showinfo=0&modestbranding=1&iv_load_policy=3`}
                  className="w-full h-full border-none bg-black"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  sandbox="allow-same-origin allow-scripts allow-presentation allow-popups"
                />
                <div className="absolute top-4 right-16 md:right-32 z-20 flex gap-2">
                  {/* External YouTube link removed to keep users on platform */}
                </div>
                <button onClick={() => setPlayingTrailer(null)} className="absolute top-4 right-4 md:right-16 z-20 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors border border-white/20 shadow-lg">
                  <X className="w-5 h-5"/>
                </button>
              </div>
            ) : isPlaying ? (
              <div ref={playerContainerRef} className="absolute inset-0 z-10 bg-black group" onMouseMove={handleMouseMove} onMouseLeave={() => setShowControls(false)}>
                {/* Always-visible Back — reverses an accidental Play / lets you bail
                    out anytime. Drops out of fullscreen and returns to details. */}
                <button onClick={() => { setIsPlaying(false); const d = document as any; if (d.fullscreenElement || d.webkitFullscreenElement) { try { (d.exitFullscreen || d.webkitExitFullscreen)?.call(document); } catch { /* noop */ } } }}
                  data-tv-focusable tabIndex={0}
                  className="absolute top-4 left-4 z-40 flex items-center gap-1.5 px-3.5 py-2 bg-black/60 hover:bg-black/85 backdrop-blur rounded-full text-white text-sm font-semibold border border-white/20 shadow-lg transition-colors active:scale-95"
                  title="Back to details">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                {['m3u8', 'youtube'].includes(currentServerObj?.type || '') ? (
                  <div className="w-full h-full absolute inset-0">
                    {(() => {
                      const Player = ReactPlayer as any;
                      return <Player key={`player-${refreshKey}`} url={src} width="100%" height="100%" controls playing onEnded={() => handleSkipEpisode('next')} />
                    })()}
                  </div>
                ) : (
                  <iframe
                    key={`player-${refreshKey}`}
                    src={src}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                    // No sandbox attribute — VidZee/VidRock/etc. refuse to play
                    // in any sandboxed context. Native Android MainActivity
                    // (top-frame whitelist + popup refusal + ad-host blocklist
                    // + JS shim) handles ad defence.
                    // Auto-fullscreen once the embed has loaded + autostarted
                    // (media playback no longer needs a separate gesture), so a
                    // single Play tap ends up fullscreen and playing.
                    onLoad={() => setTimeout(enterFullscreen, 600)}
                    className="w-full h-full absolute inset-0 bg-black"
                    title="Video Player"
                  />
                )}
                {isSandboxed && (['vidlink', 'vidsrccc', 'vidfast', 'vidsrcto', 'vidsrcpm', 'vidrock', 'vidsrcicu', 'vidzee'].includes(currentServerObj.id)) && (
                  <div className="absolute top-0 left-0 w-full z-40 bg-[#e50914]/95 text-white text-xs md:text-sm font-bold px-4 py-3 flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4 text-center backdrop-blur shadow-2xl border-b border-white/20 animate-in slide-in-from-top-2">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>Google AI Studio's preview window secretly blocks this server. <b>Sahrae works perfectly on its own tab!</b></span>
                    <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="bg-white text-[#e50914] px-4 py-1.5 rounded-full whitespace-nowrap hover:bg-zinc-200 transition-colors shadow-lg active:scale-95 flex items-center gap-1">
                      Open Sahrae App Natively <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                
                {/* Floating "Next Episode" button overlay at 90% completion (for APIs that emit progress) or on hover for TV shows */}
                {currentMediaType === 'tv' && hasNextEpisode() && currentServerObj.type !== 'youtube' && (
                  <div className={`absolute bottom-24 right-4 z-50 transition-all duration-500 ${
                    (currentServerObj.id === 'vidlink' || currentServerObj.id === 'vidsrccc')
                      ? (showNextEpisodeOverlay ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none')
                      : 'opacity-50 hover:opacity-100 translate-y-0 pointer-events-auto'
                  }`}>
                    <button 
                      onClick={() => handleSkipEpisode('next')}
                      className="flex items-center gap-2 px-4 py-2 md:px-5 md:py-3 bg-[#e50914] text-white font-bold rounded-lg shadow-2xl hover:bg-[#b8070f] hover:scale-105 transition-all text-sm md:text-base border border-red-500/50"
                    >
                      Next Episode <SkipForward className="w-4 h-4 md:w-5 md:h-5"/>
                    </button>
                  </div>
                )}
                
                {/* Floating Top Controls */}
                <div className={`absolute top-4 right-4 md:right-16 z-20 flex gap-2 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                  {currentMediaType === 'tv' && currentServerObj.type !== 'youtube' && (
                    <>
                      <button onClick={() => handleSkipEpisode('prev')} disabled={!hasPrevEpisode()} className="p-2 bg-black/50 hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Previous Episode"><SkipBack className="w-4 h-4"/></button>
                      <button onClick={() => handleSkipEpisode('next')} disabled={!hasNextEpisode()} className="p-2 bg-black/50 hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Next Episode"><SkipForward className="w-4 h-4"/></button>
                    </>
                  )}
                  <button onClick={toggleFullScreen} className="p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Full Screen"><Maximize className="w-4 h-4"/></button>
                  <button onClick={() => setRefreshKey(prev=>prev+1)} className="p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Reload Video"><RefreshCw className="w-4 h-4"/></button>
                  <button onClick={() => setIsPlaying(false)} className="p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Back to Details"><ArrowLeft className="w-4 h-4"/></button>
                </div>
              </div>
            ) : (
              <>
                <img src={getImageUrl(details.backdrop_path, 'original')} className="w-full h-full object-cover opacity-80" />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 md:via-zinc-950/20 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/80 via-zinc-950/40 md:via-transparent to-transparent" />
                
                <div className="absolute bottom-8 left-8 md:bottom-10 md:left-10 pr-12 flex flex-col gap-4 z-10 w-full max-w-2xl">
                  <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-extrabold text-white tracking-tight leading-none drop-shadow-2xl">
                    {details.title || details.name}
                  </h1>
                  <div className="flex gap-3 items-center flex-wrap mt-2">
                    <button data-tv-autofocus onClick={() => { setIsPlaying(true); }} className="px-6 md:px-8 py-2 md:py-3 bg-white text-black font-bold rounded flex items-center gap-2 hover:bg-white/80 transition-colors shadow-lg text-sm md:text-base whitespace-nowrap">
                      <Play className="w-5 h-5 md:w-6 md:h-6 fill-current"/>
                      {currentMediaType === 'tv' ? `Play S${selectedSeason} E${selectedEpisode}` : 'Play'}
                    </button>
                    {trailer && (
                      <button onClick={() => setPlayingTrailer(trailer.key)} className="px-6 md:px-8 py-2 md:py-3 bg-zinc-900/90 text-white font-semibold rounded flex items-center gap-2 hover:bg-zinc-800 transition-colors border border-zinc-600/60 shadow-lg text-sm md:text-base whitespace-nowrap">
                        <Play className="w-5 h-5 md:w-6 md:h-6 fill-current text-white"/> Trailer
                      </button>
                    )}
                    <button onClick={() => toggleMyList(details)} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center border border-zinc-600/60 bg-zinc-900/90 text-white rounded-full hover:bg-white/10 hover:border-white transition-colors shadow-lg shrink-0" title="My List">
                      {isInMyList(details.id) ? <Check className="w-5 h-5 md:w-6 md:h-6"/> : <Plus className="w-5 h-5 md:w-6 md:h-6"/>}
                    </button>
                    <button onClick={() => setRating(rating === 'up' ? null : 'up')} className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center border border-zinc-600/60 bg-zinc-900/90 rounded-full transition-colors shadow-lg shrink-0 ${rating === 'up' ? 'text-green-400 bg-zinc-800 border-green-500/50' : 'text-white hover:bg-white/10 hover:border-white'}`} title="Like">
                      <ThumbsUp className="w-4 h-4 md:w-5 md:h-5"/>
                    </button>
                    <button onClick={() => setRating(rating === 'down' ? null : 'down')} className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center border border-zinc-600/60 bg-zinc-900/90 rounded-full transition-colors shadow-lg shrink-0 ${rating === 'down' ? 'text-red-400 bg-zinc-800 border-red-500/50' : 'text-white hover:bg-white/10 hover:border-white'}`} title="Not for me">
                      <ThumbsDown className="w-4 h-4 md:w-5 md:h-5"/>
                    </button>
                    <button
                      onClick={() => setShowDownload(true)}
                      className="group px-6 md:px-8 py-2 md:py-3 font-bold flex items-center justify-center gap-2 border border-zinc-600/60 bg-zinc-900/90 text-white rounded hover:bg-zinc-800 transition-colors shadow-lg ml-2"
                      title="Download to your device"
                    >
                      <Download className="w-5 h-5 group-hover:animate-bounce"/>
                      <span className="text-sm">Download</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

            <div className="p-8 md:p-10 pb-16">
              {currentMediaType === 'movie' && (
                <div className="mb-8 p-4 bg-zinc-900/40 border border-zinc-800 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <h4 className="text-white font-bold">Server Selection</h4>
                    <p className="text-sm text-zinc-400">Try a different server if you experience playback issues.</p>
                  </div>
                  <select value={selectedServer} onChange={e => setSelectedServer(Number(e.target.value))} className="bg-zinc-950 text-white font-bold outline-none cursor-pointer rounded px-4 py-2 border border-zinc-800 text-sm w-full sm:w-auto shrink-0">
                    {dynamicServers.map((server, idx) => <option key={server.id} value={idx}>{server.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex flex-col lg:flex-row gap-10">
                <div className="lg:w-2/3 space-y-5">
                  <div className="flex items-center gap-3 text-sm font-semibold text-zinc-400">
                    {details.vote_average ? <span className="text-green-500 font-bold">{Math.round(details.vote_average * 10)}% Match</span> : null}
                    <span className="text-white">{(details.release_date || details.first_air_date)?.slice(0, 4)}</span>
                    {details.seasons ? <span>{details.seasons.filter(s => s.season_number > 0).length} Seasons</span> : details.runtime ? <span>{details.runtime} min</span> : null}
                    <span className="px-1 border border-zinc-600 rounded text-xs leading-5 uppercase">HD</span>
                  </div>
                  <p className="text-white text-base leading-relaxed font-medium">{details.overview}</p>
                </div>
                <div className="lg:w-1/3 text-sm space-y-4">
                  <p className="text-white"><span className="text-zinc-500">Genres: </span>{details.genres?.slice(0, 3).map(g => g.name).join(', ')}</p>
                  <p className="text-white"><span className="text-zinc-500">Director: </span>{details.credits?.crew?.find(c => c.job === 'Director')?.name || 'N/A'}</p>
                </div>
              </div>

              {details.credits?.cast && details.credits.cast.length > 0 && (
                <div className="mt-12">
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight mb-6">Cast</h3>
                  <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar snap-x">
                    {details.credits.cast.slice(0, 15).map(actor => (
                      <div key={actor.id} className="flex-shrink-0 w-28 md:w-32 snap-start group cursor-pointer">
                        <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-zinc-800 mb-2 relative">
                          {actor.profile_path ? (
                            <img src={getImageUrl(actor.profile_path, 'w185')} alt={actor.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-900 border border-zinc-700/50">
                              <span className="text-zinc-500 text-xs">No Image</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                        </div>
                        <p className="text-white text-sm font-bold truncate">{actor.name}</p>
                        <p className="text-zinc-500 text-xs truncate">{actor.character}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentMediaType === 'tv' && (
                <div className="mt-12">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight">Episodes</h3>
                    <div className="flex items-center gap-4">
                      {isPlaying && (
                        <select value={selectedServer} onChange={e => setSelectedServer(Number(e.target.value))} className="bg-zinc-900 text-white font-bold outline-none cursor-pointer rounded px-3 py-2 border border-zinc-800 text-sm md:max-w-[200px]">
                          {dynamicServers.map((server, idx) => <option key={server.id} value={idx}>{server.name}</option>)}
                        </select>
                      )}
                      <div className="bg-zinc-900 rounded px-4 py-2 border border-zinc-800 hover:bg-zinc-800 transition-colors">
                        <select value={selectedSeason} onChange={e => setSelectedSeason(Number(e.target.value))} className="bg-transparent text-white font-bold outline-none w-full cursor-pointer">
                          {details.seasons?.filter(s => s.season_number > 0).map( season => (
                            <option key={season.id} value={season.season_number}>Season {season.season_number}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  {!seasonDetails ? (
                    <div className="flex flex-col gap-0 border-t border-zinc-800">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex flex-col md:flex-row items-center gap-4 py-4 md:py-6 border-b border-zinc-800 animate-pulse">
                          <div className="w-12 hidden md:block"></div>
                          <div className="w-full md:w-48 aspect-video shrink-0 bg-zinc-800 rounded"></div>
                          <div className="flex-1 w-full space-y-3">
                            <div className="h-5 bg-zinc-800 rounded w-1/3"></div>
                            <div className="h-4 bg-zinc-800 rounded w-full"></div>
                            <div className="h-4 bg-zinc-800 rounded w-5/6"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : seasonDetails?.episodes && seasonDetails.episodes.length > 0 ? (
                    <div className="flex flex-col gap-0 border-t border-zinc-800">
                      {seasonDetails.episodes.map(episode => (
                        <div key={episode.id} onClick={() => { setSelectedEpisode(episode.episode_number); setIsPlaying(true); document.getElementById('player-modal-container')?.scrollTo({top: 0, behavior: 'smooth'}); }} className={`flex flex-col md:flex-row items-center gap-4 py-4 md:py-6 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/50 transition-colors group ${selectedEpisode === episode.episode_number && isPlaying ? 'bg-zinc-800/30' : ''}`}>
                          <div className="text-4xl font-light text-zinc-500 w-12 text-center shrink-0 hidden md:block opacity-60">
                            {episode.episode_number}
                          </div>
                          <div className="w-full md:w-48 aspect-video shrink-0 relative rounded overflow-hidden bg-zinc-800">
                            {episode.still_path ? <img src={getImageUrl(episode.still_path)} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center opacity-50"><Play className="w-8 h-8 text-white"/></div>}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity"><Play className="w-8 h-8 text-white fill-current shadow-lg drop-shadow"/></div>
                          </div>
                          <div className="flex-1 min-w-0 md:pr-4">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-base font-bold text-white line-clamp-1">{episode.name}</h4>
                              <span className="text-sm font-bold text-white shrink-0 ml-4">{episode.runtime ? `${episode.runtime}m` : ''}</span>
                            </div>
                            <p className="text-sm text-zinc-400 line-clamp-3 md:line-clamp-2 leading-snug w-11/12">{episode.overview || 'No description available for this episode.'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-zinc-500 py-10 text-center font-semibold">Episodes currently unavailable for this season.</div>
                  )}
                </div>
              )}

              {videos.filter(v => v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip').length > 0 && (
                <div className="mt-12">
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight mb-6">Trailers & Extras</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {videos.filter(v => v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip').slice(0, 6).map(v => (
                      <div key={v.id} onClick={() => { setPlayingTrailer(v.key); document.getElementById('player-modal-container')?.scrollTo({top: 0, behavior: 'smooth'}); }} className="cursor-pointer group relative rounded overflow-hidden aspect-video bg-zinc-800">
                         <img src={`https://img.youtube.com/vi/${v.key}/maxresdefault.jpg`} onError={(e) => { e.currentTarget.src = `https://img.youtube.com/vi/${v.key}/hqdefault.jpg`; e.currentTarget.onerror = null; }} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 opacity-80 group-hover:opacity-100" />
                         <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-all"><Play className="w-12 h-12 text-white fill-current shadow-lg drop-shadow"/></div>
                         <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                           <p className="text-white text-sm font-bold line-clamp-1">{v.name}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {similar.length > 0 && (
                <div className="mt-12">
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight mb-6">More Like This</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {similar.slice(0, 9).map(item => (
                      <div key={item.id} onClick={() => { setDetails(null); setSimilar([]); setCurrentMediaId(item.id); setCurrentMediaType(item.media_type || currentMediaType); setSelectedSeason(1); setSelectedEpisode(1); document.getElementById('player-modal-container')?.scrollTo({top: 0}); }}
                        className="cursor-pointer group relative rounded overflow-hidden bg-zinc-800 transition-transform duration-300 hover:scale-[1.03] shadow-lg">
                        <div className="relative w-full aspect-[16/9]">
                          <img src={getImageUrl(item.backdrop_path || item.poster_path)} className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                        </div>
                        <div className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-white font-bold text-sm leading-tight">{item.title || item.name}</p>
                          </div>
                          <p className="text-xs text-zinc-400 line-clamp-3">{item.overview}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {showDownload && currentMediaId != null && (
          <MovieDownloadModal
            url={currentMediaType === 'movie'
              ? `https://vidvault.ru/movie/${currentMediaId}`
              : `https://vidvault.ru/tv/${currentMediaId}/${selectedSeason}/${selectedEpisode}`}
            title={(details?.title || details?.name || 'Download') + (currentMediaType === 'tv' ? ` S${selectedSeason}E${selectedEpisode}` : '')}
            onClose={() => setShowDownload(false)}
          />
        )}
    </>
  );
}
