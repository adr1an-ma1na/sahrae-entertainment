import { X, ExternalLink, AlertCircle, Info, Star, Calendar, Clock, Play, RefreshCw, Plus, Check, Maximize, ArrowLeft, SkipBack, SkipForward, ThumbsUp, ThumbsDown, Download, Server, Waves, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchMediaDetails, MediaDetails, getImageUrl, fetchSimilar, MediaItem, SeasonDetails, fetchSeasonDetails } from '../services/tmdb';
import { useWatchProgress } from '../hooks/useWatchProgress';
import { useMyList } from '../hooks/useMyList';
import { loadEq, saveEq, EQ_PRESETS, PRESET_EXTRAS } from '../services/eq';
import { haptics } from '../services/haptics';
import { videoDownloads, VideoDownloadItem } from '../services/videoDownloads';

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
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [downloadItem, setDownloadItem] = useState<VideoDownloadItem | null>(null);

  // Check if this video (movie or TV episode) is downloaded offline
  useEffect(() => {
    let active = true;
    const checkOffline = async () => {
      if (!currentMediaId || !currentMediaType) {
        if (active) setLocalVideoUrl(null);
        return;
      }
      const id = currentMediaType === 'movie' 
        ? `movie_${currentMediaId}` 
        : `tv_${currentMediaId}_s${selectedSeason}_e${selectedEpisode}`;
      
      const item = await videoDownloads.get(id);
      if (item && item.status === 'done') {
        const url = await videoDownloads.localUrl(id);
        if (active) {
          setLocalVideoUrl(url);
          console.log('Playing downloaded local media file!', url);
        }
      } else {
        if (active) setLocalVideoUrl(null);
      }
    };
    checkOffline();
    // Subscribe to download events to refresh localUrl if it finishes while the modal is open
    const unsubscribe = videoDownloads.subscribe(checkOffline);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentMediaId, currentMediaType, selectedSeason, selectedEpisode, isOpen]);

  // Check download progress/status
  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      if (!currentMediaId || !currentMediaType) return;
      const id = currentMediaType === 'movie' 
        ? `movie_${currentMediaId}` 
        : `tv_${currentMediaId}_s${selectedSeason}_e${selectedEpisode}`;
      const item = await videoDownloads.get(id);
      if (active) setDownloadItem(item);
    };
    fetchStatus();
    const unsubscribe = videoDownloads.subscribe(fetchStatus);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentMediaId, currentMediaType, selectedSeason, selectedEpisode, isOpen]);

  const handleToggleDownload = async () => {
    if (!currentMediaId || !currentMediaType || !details) return;
    const id = currentMediaType === 'movie' 
      ? `movie_${currentMediaId}` 
      : `tv_${currentMediaId}_s${selectedSeason}_e${selectedEpisode}`;

    if (downloadItem) {
      if (downloadItem.status === 'downloading') {
        videoDownloads.cancel(id);
      } else {
        if (confirm('Delete this download from the app?')) {
          await videoDownloads.remove(id);
        }
      }
    } else {
      const ep = currentMediaType === 'tv' ? (seasonDetails?.episodes?.find(e => e.episode_number === selectedEpisode)) : undefined;
      await videoDownloads.download({
        mediaId: currentMediaId,
        type: currentMediaType,
        title: details.title || details.name,
        season: currentMediaType === 'tv' ? selectedSeason : undefined,
        episode: currentMediaType === 'tv' ? selectedEpisode : undefined,
        episodeTitle: ep?.name || (currentMediaType === 'tv' ? `Episode ${selectedEpisode}` : undefined),
        posterPath: details.poster_path || '',
        backdropPath: details.backdrop_path || '',
        overview: details.overview || '',
        // Download source = VidVault (kept out of the play servers on purpose).
        sourceUrl: vidvaultDownloadUrl(currentMediaType, currentMediaId, selectedSeason, selectedEpisode),
      });
    }
  };
  const [showXRay, setShowXRay] = useState(false);
  // Loading indicator + slow-load recovery for the video embed.
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  // Audio enhancement (native global EQ / virtualizer — affects the movie audio too).
  const [eqPreset, setEqPreset] = useState<string>(() => loadEq().preset);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showAdNotice, setShowAdNotice] = useState(false);
  const [failedServers, setFailedServers] = useState<string[]>([]);
  const [showServerDeadNotice, setShowServerDeadNotice] = useState(false);

  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadTimerRef = useRef<NodeJS.Timeout | null>(null);
  const slowTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoRetriedRef = useRef(false);

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

  // Ad Shield redirect prevention for Movies and Series
  useEffect(() => {
    if (!isOpen || !isPlaying) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const msg = 'Ad Shield protected you from an external redirect attempt.';
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isOpen, isPlaying]);

  // Detect clicks/interaction on the third-party iframe (blur of parent window)
  useEffect(() => {
    if (!isOpen || !isPlaying) {
      setShowAdNotice(false);
      return;
    }

    const handleBlur = () => {
      setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) {
          setShowAdNotice(true);
          // Auto-hide after 8 seconds
          setTimeout(() => setShowAdNotice(false), 8000);
        }
      }, 100);
    };

    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
    };
  }, [isOpen, isPlaying]);

  // Ad Shield: Intercept window.open popup attempts globally while playing
  useEffect(() => {
    if (!isOpen || !isPlaying) return;
    const originalOpen = window.open;
    window.open = function (...args: any[]) {
      console.warn('[Ad Shield] Intercepted and blocked popup attempt:', args);
      setShowAdNotice(true);
      setTimeout(() => setShowAdNotice(false), 6000);
      return null;
    };
    return () => {
      window.open = originalOpen;
    };
  }, [isOpen, isPlaying]);

  useEffect(() => {
    setCurrentMediaId(mediaId);
    setCurrentMediaType(mediaType);
    setFailedServers([]);
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

  const reportCurrentMovieServerDead = () => {
    haptics.tap();
    const currentServerId = SERVERS[selectedServer]?.id;
    if (!currentServerId) return;

    setFailedServers(prev => {
      if (prev.includes(currentServerId)) return prev;
      return [...prev, currentServerId];
    });

    // Automatically switch to the next non-failed server in sequence
    let nextIdx = (selectedServer + 1) % SERVERS.length;
    let iterations = 0;
    while (iterations < SERVERS.length) {
      const serverId = SERVERS[nextIdx].id;
      // Is this server also failed?
      if (!failedServers.includes(serverId) && serverId !== currentServerId) {
        break;
      }
      nextIdx = (nextIdx + 1) % SERVERS.length;
      iterations++;
    }

    setSelectedServer(nextIdx);
    setShowServerDeadNotice(true);
    setTimeout(() => setShowServerDeadNotice(false), 4000);
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

  // Streaming servers. NOTE: vidvault.ru is deliberately NOT here — it is a
  // download portal ("Download movies and TV shows"), not a stream. It now lives
  // only behind the Download button (see DOWNLOAD_SOURCE below), per the request
  // that it stop being the default play server.
  const SERVERS = [
    { id: 'multiembed', name: 'Ultra HD (MultiEmbed)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://multiembed.mov/?video_id=${id}&tmdb=1` : `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`, type: 'iframe' },
    { id: 'vidsrccc', name: 'Ultra HD V3 (VidSrc.cc)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidsrc.cc/v3/embed/movie/${id}` : `https://vidsrc.cc/v3/embed/tv/${id}/${s}/${e}`, type: 'iframe' },
    { id: 'smashystream', name: 'Multi-Source HQ (SmashyStream)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://embed.smashystream.com/playere.php?tmdb=${id}` : `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`, type: 'iframe' },
    { id: 'vidsrcto', name: 'Premium 4K CDN (VidSrc.to)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidsrc.to/embed/movie/${id}` : `https://vidsrc.to/embed/tv/${id}/${s}/${e}`, type: 'iframe' },
    { id: 'vidbinge', name: 'HQ Cinema (VidBinge)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidbinge.com/embed/movie/${id}` : `https://vidbinge.com/embed/tv/${id}/${s}/${e}`, type: 'iframe' },
    { id: 'superembed', name: 'Ultra HD 3 (SuperEmbed)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://multiembed.mov/direct/superembed/movie/${id}` : `https://multiembed.mov/direct/superembed/tv/${id}/${s}/${e}`, type: 'iframe' },
    { id: 'moviesapi', name: 'HiFi Premium (MoviesAPI)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://moviesapi.club/movie/${id}` : `https://moviesapi.club/tv/${id}-${s}-${e}`, type: 'iframe' },
    { id: 'autoembed', name: 'Cloud AutoEmbed (AutoEmbed)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://autoembed.co/movie/tmdb/${id}` : `https://autoembed.co/tv/tmdb/${id}-${s}-${e}`, type: 'iframe' },
    { id: 'vidsrcpro', name: 'Premium HD (VidSrc.pro)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidsrc.pro/embed/movie/${id}` : `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`, type: 'iframe' },
    { id: '2embed', name: 'HQ Stream (2Embed)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://www.2embed.cc/embed/${id}` : `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`, type: 'iframe' },
    { id: 'vidsrcnet', name: 'Fast Stream (VidSrc.net)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidsrc.net/embed/movie?tmdb=${id}` : `https://vidsrc.net/embed/tv?tmdb=${id}&season=${s}&episode=${e}`, type: 'iframe' },
    { id: 'vidsrcme', name: 'Fast Stream 2 (VidSrc.me)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://vidsrc.me/embed/movie?tmdb=${id}` : `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`, type: 'iframe' },
    { id: 'embedsu', name: 'Backup (Embed.su)', getUrl: (type: string, id: number, s: number, e: number) => type === 'movie' ? `https://embed.su/embed/movie/${id}` : `https://embed.su/embed/tv/${id}/${s}/${e}`, type: 'iframe' },
  ];

  // VidVault is the DOWNLOAD source only (never a play server). Downloads are
  // saved into the app's own private storage (IndexedDB via videoDownloads),
  // not the device's public Downloads folder, as requested.
  const vidvaultDownloadUrl = (type: string, id: number, s: number, e: number) =>
    type === 'movie' ? `https://vidvault.ru/movie/${id}` : `https://vidvault.ru/tv/${id}/${s}/${e}`;

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

  // Loading indicator + slow-load recovery. We can't read inside the cross-origin
  // embed, so progress is a smooth simulation that completes when the iframe fires
  // `load`; after ~12s with no load we surface Reload / Next-server. That's the
  // in-app fix for the transient "no content available" — a reload usually clears
  // it, so users don't have to close and reopen the whole app.
  useEffect(() => {
    if (!isPlaying) { setVideoLoaded(false); setLoadPct(0); setSlowLoad(false); return; }
    setVideoLoaded(false); setLoadPct(8); setSlowLoad(false);
    if (loadTimerRef.current) clearInterval(loadTimerRef.current);
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    loadTimerRef.current = setInterval(() => { setLoadPct(p => (p >= 92 ? p : p + Math.max(0.7, (92 - p) * 0.05))); }, 250);
    // First: silently remount once (the embed 'load' fires fast on any reachable
    // provider, so no load in ~10s = a real failure — a remount usually fixes it,
    // like closing/reopening the app). If it STILL fails, show manual recovery.
    slowTimerRef.current = setTimeout(() => {
      if (!autoRetriedRef.current) { autoRetriedRef.current = true; setRefreshKey(k => k + 1); }
      else { setSlowLoad(true); }
    }, 10000);
    return () => { if (loadTimerRef.current) clearInterval(loadTimerRef.current); if (slowTimerRef.current) clearTimeout(slowTimerRef.current); };
  }, [isPlaying, selectedServer, selectedSeason, selectedEpisode, refreshKey]);

  // Reset the one-shot auto-retry when the content or server actually changes.
  useEffect(() => { autoRetriedRef.current = false; }, [isPlaying, selectedServer, selectedSeason, selectedEpisode]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  // Curated audio-enhancement presets for the player (map to the global native EQ).
  const AUDIO_PRESETS: { key: string; label: string }[] = [
    { key: 'Off', label: 'Off' },
    { key: 'Cinema', label: 'Cinema · Spatial' },
    { key: 'Premium', label: 'Premium' },
    { key: 'Bass Boost', label: 'Bass Boost' },
    { key: 'Vocal', label: 'Dialogue Clarity' },
  ];
  const applyAudioPreset = (name: string) => {
    if (name === 'Off') saveEq({ on: false, bands: [0, 0, 0, 0, 0], bass: 0, spatial: 0, loud: 0, preset: 'Off' });
    else {
      const extra = PRESET_EXTRAS[name] || { bass: 0, spatial: 0, loud: 0 };
      saveEq({ on: true, bands: EQ_PRESETS[name] || [0, 0, 0, 0, 0], ...extra, preset: name });
    }
    setEqPreset(name);
    setShowAudioMenu(false);
  };
  const audioOn = eqPreset !== 'Off' && eqPreset !== 'Flat';

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
                {localVideoUrl ? (
                  <div className="w-full h-full absolute inset-0 bg-black flex items-center justify-center">
                    <video 
                      src={localVideoUrl}
                      controls
                      autoPlay
                      className="w-full h-full object-contain"
                      onPlay={() => setVideoLoaded(true)}
                      onEnded={() => handleSkipEpisode('next')}
                    />
                  </div>
                ) : (
                  <iframe
                    key={`player-${refreshKey}`}
                    src={src}
                    frameBorder="0"
                    // `clipboard-write` was granted to the embeds and is now gone:
                    // it let a hostile ad script silently replace the contents of
                    // the user's clipboard, and no player needs it.
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    // NO sandbox attribute, on any platform. Every one of these
                    // providers runs an anti-tamper check and refuses to play with
                    // "Remove sandbox attributes on the iframe tag" as soon as it
                    // sees one — a permissive sandbox granting scripts and
                    // same-origin still trips it. Popup defence lives in the native
                    // Android shell instead; the web build is not ad-protected.
                    // Auto-fullscreen once the embed has loaded + autostarted
                    // (media playback no longer needs a separate gesture), so a
                    // single Play tap ends up fullscreen and playing.
                    onLoad={() => { setVideoLoaded(true); setLoadPct(100); if (loadTimerRef.current) clearInterval(loadTimerRef.current); if (slowTimerRef.current) clearTimeout(slowTimerRef.current); setTimeout(enterFullscreen, 600); }}
                    className="w-full h-full absolute inset-0 bg-black"
                    title="Video Player"
                  />
                )}
                {/* Netflix-style loading ring + slow-load recovery (Reload / Next server) */}
                {!videoLoaded && !localVideoUrl && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 pointer-events-none">
                    <div className="relative w-20 h-20">
                      <svg viewBox="0 0 48 48" className="w-20 h-20 -rotate-90">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="4" />
                        <circle cx="24" cy="24" r="20" fill="none" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" strokeDasharray={125.66} strokeDashoffset={125.66 * (1 - loadPct / 100)} style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">{Math.round(loadPct)}%</span>
                    </div>
                    <p className="text-zinc-300 text-sm mt-4 font-medium px-6 text-center max-w-full truncate">Loading {details.title || details.name}…</p>
                    {slowLoad && (
                      <div className="pointer-events-auto mt-5 flex flex-col items-center gap-3 px-6">
                        <p className="text-zinc-400 text-xs text-center max-w-xs">Still loading? Reload, or switch to another server.</p>
                        <div className="flex gap-2">
                          <button onClick={() => setRefreshKey(k => k + 1)} data-tv-focusable className="px-4 py-2 bg-white text-black text-sm font-bold rounded-full flex items-center gap-2 active:scale-95"><RefreshCw className="w-4 h-4" /> Reload</button>
                          <button onClick={() => setSelectedServer(s => (s + 1) % dynamicServers.length)} data-tv-focusable className="px-4 py-2 bg-zinc-800 text-white text-sm font-bold rounded-full flex items-center gap-2 border border-white/15 active:scale-95"><Server className="w-4 h-4" /> Next server</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {isSandboxed && (['superembed', 'vidsrcpro', '2embed', 'vidbinge', 'multiembed', 'vidsrcnet', 'vidsrcme', 'embedsu'].includes(currentServerObj.id)) && (
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
                    (currentServerObj.id === 'vidsrcpro' || currentServerObj.id === 'multiembed')
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
                <div className={`absolute top-4 right-4 md:right-16 z-20 flex gap-2 items-center transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                  {/* Switch server WHILE watching — the fix for "content isn't available". */}
                  <select value={selectedServer} onChange={e => setSelectedServer(Number(e.target.value))} data-tv-focusable aria-label="Switch server" title="Switch server if it won't play"
                    className="bg-black/50 hover:bg-black/80 text-white text-xs font-bold rounded-full px-3 py-1.5 border border-white/20 outline-none cursor-pointer backdrop-blur appearance-none">
                    {dynamicServers.map((server, idx) => {
                      const isDown = failedServers.includes(server.id);
                      return (
                        <option key={server.id} value={idx} className="bg-zinc-900 text-white">
                          {`Server ${idx + 1}${isDown ? ' (🔴 Down)' : ''}`}
                        </option>
                      );
                    })}
                  </select>
                  {currentServerObj.type !== 'youtube' && (
                    <button
                      onClick={reportCurrentMovieServerDead}
                      className="px-3 py-1.5 text-xs font-bold bg-black/50 hover:bg-red-500/20 border border-white/20 hover:border-red-500/50 text-zinc-300 hover:text-red-400 rounded-full flex items-center gap-1.5 transition-all shadow-md active:scale-95 backdrop-blur"
                      title="Report server dead/broken and switch to next server"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" /> Dead Server?
                    </button>
                  )}
                  {currentMediaType === 'tv' && currentServerObj.type !== 'youtube' && (
                    <>
                      <button onClick={() => handleSkipEpisode('prev')} disabled={!hasPrevEpisode()} className="p-2 bg-black/50 hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Previous Episode"><SkipBack className="w-4 h-4"/></button>
                      <button onClick={() => handleSkipEpisode('next')} disabled={!hasNextEpisode()} className="p-2 bg-black/50 hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Next Episode"><SkipForward className="w-4 h-4"/></button>
                    </>
                  )}
                  <button onClick={() => setShowAudioMenu(v => !v)} data-tv-focusable className={`p-2 rounded-full transition-colors backdrop-blur border ${audioOn ? 'bg-amber-500 text-amber-950 border-amber-500' : 'bg-black/50 hover:bg-black/80 text-white border-white/20'}`} title="Audio enhancement"><Waves className="w-4 h-4"/></button>
                  <button onClick={toggleFullScreen} className="p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Full Screen"><Maximize className="w-4 h-4"/></button>
                  <button onClick={() => setRefreshKey(prev=>prev+1)} className="p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Reload Video"><RefreshCw className="w-4 h-4"/></button>
                  <button onClick={() => setIsPlaying(false)} className="p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur border border-white/20" title="Back to Details"><ArrowLeft className="w-4 h-4"/></button>
                </div>
                {/* Audio-enhancement presets — enables spatial/EQ on the global native mix */}
                {showAudioMenu && (
                  <div className="absolute top-16 right-4 md:right-16 z-50 w-56 bg-zinc-950/95 backdrop-blur rounded-xl border border-white/15 shadow-2xl p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 px-2 pt-1 pb-2 flex items-center gap-1.5"><Waves className="w-3.5 h-3.5" /> Audio Enhancement</p>
                    {AUDIO_PRESETS.map(p => (
                      <button key={p.key} onClick={() => applyAudioPreset(p.key)} data-tv-focusable className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-between transition-colors ${eqPreset === p.key ? 'bg-amber-500 text-amber-950' : 'text-white hover:bg-white/10'}`}>
                        {p.label} {eqPreset === p.key && <Check className="w-4 h-4"/>}
                      </button>
                    ))}
                    <p className="text-[10px] text-zinc-500 px-2 pt-2 leading-snug">Enhances all app audio — movies, music &amp; podcasts.</p>
                  </div>
                )}

                {showAdNotice && (
                  <div className="absolute bottom-24 right-4 z-[100] max-w-sm bg-zinc-950/95 border border-amber-500/30 text-white rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-500">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-amber-400">Ad Shield protected you</h4>
                          <button onClick={() => setShowAdNotice(false)} className="text-zinc-400 hover:text-white transition-colors ml-2">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                          A background pop-up was blocked or opened. <b>Simply close the ad tab</b> to resume watching without interruption!
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {showServerDeadNotice && (
                  <div className="absolute bottom-24 left-4 z-[100] max-w-sm bg-zinc-950/95 border border-red-500/30 text-white rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded-lg bg-red-500/15 text-red-400">
                        <AlertTriangle className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-red-400">Server marked offline</h4>
                          <button onClick={() => setShowServerDeadNotice(false)} className="text-zinc-400 hover:text-white transition-colors ml-2">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                          We've flagged that server down in your session and successfully switched you to the next server.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
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
                      onClick={handleToggleDownload}
                      className={`group px-6 md:px-8 py-2 md:py-3 font-bold flex items-center justify-center gap-2 border rounded transition-colors shadow-lg ml-2 ${
                        downloadItem?.status === 'done'
                          ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/40'
                          : downloadItem?.status === 'downloading'
                          ? 'border-amber-500/50 bg-amber-950/40 text-amber-400 hover:bg-amber-900/40'
                          : 'border-zinc-600/60 bg-zinc-900/90 text-white hover:bg-zinc-800'
                      }`}
                      title={downloadItem?.status === 'done' ? 'Downloaded (Click to delete)' : downloadItem?.status === 'downloading' ? 'Downloading (Click to cancel)' : 'Download inside the app'}
                    >
                      {downloadItem?.status === 'done' ? (
                        <>
                          <Check className="w-5 h-5 text-emerald-400" />
                          <span className="text-sm">Downloaded</span>
                        </>
                      ) : downloadItem?.status === 'downloading' ? (
                        <>
                          <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
                          <span className="text-sm">Downloading {Math.round((downloadItem.progress || 0) * 100)}%</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5 group-hover:animate-bounce"/>
                          <span className="text-sm">Download</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

            <div className="p-8 md:p-10 pb-16">
              {/* Pick-a-server-before-you-play. Shown for BOTH movies and series
                  (the old prominent picker was movies-only, and the series one
                  was a small dropdown that appeared only after playback began).
                  Chips are far more discoverable than a <select> on TV + touch,
                  and the choice is made here, before Play is ever pressed. */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Server className="w-4 h-4 text-amber-400 shrink-0" />
                  <h4 className="text-white font-bold text-sm">Choose your server</h4>
                  <span className="text-xs text-zinc-500">Pick one before you play — switch anytime if a title won't load</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x">
                  {dynamicServers.map((server, idx) => (
                    <button key={server.id} onClick={() => setSelectedServer(idx)} data-tv-focusable
                      aria-pressed={selectedServer === idx}
                      className={`shrink-0 snap-start px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                        selectedServer === idx
                          ? 'bg-amber-500 text-amber-950 border-amber-400'
                          : 'bg-zinc-900/80 text-zinc-300 border-zinc-700 hover:bg-zinc-800 hover:text-white'
                      }`}>
                      {server.name}
                    </button>
                  ))}
                </div>
              </div>
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
    </>
  );
}
