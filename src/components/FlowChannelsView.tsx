import React, { useState, useEffect, useRef } from 'react';
import { Play, Flame, Ghost, Heart, Rocket, Compass, Volume2, VolumeX, AlertCircle, Sparkles, Swords, ShieldAlert, Film, Library, Drama } from 'lucide-react';
import { fetchDiscover, fetchMediaDetails, getImageUrl, MediaDetails } from '../services/tmdb';
import { LiveMeta, LuxChapter, RailHeader } from './ui/Lux';
import { useRail } from '../hooks/useRail';

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

export default function FlowChannelsView({ onPlay, paused = false }: { onPlay: (id: number, type: 'movie' | 'tv') => void; paused?: boolean }) {
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
          const withArt = res.find((m) => m.backdrop_path || m.poster_path);
          return [c.id, withArt ? getImageUrl(withArt.backdrop_path || withArt.poster_path, 'w300') : ''] as const;
        } catch { return [c.id, ''] as const; }
      }));
      if (!cancelled) setChannelArt(Object.fromEntries(entries.filter(([, u]) => u)));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Auto-hide overlay after 5 seconds of no mouse movement. Only where there
    // is a mouse: on a phone or a TV the title and buttons stay, since there is
    // no pointer to bring them back with a glance.
    if (!window.matchMedia?.('(hover: hover)').matches) { setShowOverlay(true); return; }
    const handleMouseMove = () => {
      setShowOverlay(true);
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = setTimeout(() => {
        setShowOverlay(false);
      }, 5000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('pointerdown', handleMouseMove);
    window.addEventListener('keydown', handleMouseMove);
    // Initial timeout
    overlayTimeoutRef.current = setTimeout(() => setShowOverlay(false), 5000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerdown', handleMouseMove);
      window.removeEventListener('keydown', handleMouseMove);
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

  const jumpTo = (index: number) => {
    playlistIndexRef.current = index;
    playNext(playlist, index);
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

  // While a film is open over the channel (Watch the film, or any title opened
  // from elsewhere), the trailer is paused and silent: two soundtracks at once
  // was the complaint. When the film closes, the trailer carries on with the
  // viewer's own mute choice.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const hush = () => { post('pauseVideo'); post('mute'); };
  useEffect(() => {
    if (!videoUrl) return;
    if (paused) { hush(); return; }
    post(mutedRef.current ? 'mute' : 'unMute');
    post('playVideo');
    // post reads the live iframe; hush is post twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, videoUrl]);
  const watchFilm = (id: number) => { hush(); onPlay(id, 'movie'); };

  // Listen for the embed's state changes (handshake sent on iframe load).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // Only this channel's own player: the film's trailers post the same messages.
      if (e.source !== ytFrameRef.current?.contentWindow) return;
      if (typeof e.data !== 'string') return;
      let d: any; try { d = JSON.parse(e.data); } catch { return; }
      const st = d?.event === 'onStateChange' ? d.info
        : d?.event === 'infoDelivery' && d.info && typeof d.info.playerState === 'number' ? d.info.playerState
        : undefined;
      if (st === undefined) return;
      // A trailer that starts while a film is open (autoplay) is stopped again.
      if (st === 1 && pausedRef.current) { hush(); return; }
      if (st === 1) setIsActuallyPlaying(true);
      else if (st === 2) setIsActuallyPlaying(false);
      else if (st === 0 && !pausedRef.current) handleEndedRef.current(); // ended → next in channel
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If a trailer never starts within 15s, skip to the next so a channel never
  // stalls; not while a film is open, when it is paused on purpose.
  useEffect(() => {
    if (!videoUrl || isActuallyPlaying || paused) return;
    const t = setTimeout(() => handleEndedRef.current(), 15000);
    return () => clearTimeout(t);
  }, [videoUrl, isActuallyPlaying, paused]);

  const activeChannel = CHANNELS.find(c => c.id === activeChannelId);
  const ytId = videoUrl ? (videoUrl.match(/[?&]v=([^&]+)/)?.[1] || '') : '';

  const upNext = playlist.slice(playlistIndexRef.current + 1).map((m, n) => ({ m, index: playlistIndexRef.current + 1 + n }));

  return (
    <div className="min-h-screen pb-24 relative">
      {/* The stage: the channel playing full width, the trailer cropped to fill
          it (container units where the WebView has them, letterboxed where not). */}
      <section className="lux-stage lux-fade-foot relative w-full h-[64vh] md:h-[80vh] min-h-[420px] overflow-hidden bg-zinc-950 group">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
            <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-zinc-400 font-medium animate-pulse">Tuning to {activeChannel?.name}...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 text-center px-4">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <p className="text-zinc-300 font-medium">Channel signal lost.</p>
            <button onClick={() => loadChannel(activeChannelId)} className="lux-btn mt-4 px-6 py-2.5 text-sm">Retune channel</button>
          </div>
        )}

        {/* The film's still under the video: the stage is never black while a
            trailer tunes in, or where the video cannot play. */}
        {playingMedia?.backdrop_path && (
          <img key={playingMedia.id} src={getImageUrl(playingMedia.backdrop_path, 'original')} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover kenburns" />
        )}

        {ytId && (
          <div className="flow-cover absolute inset-0 z-0 pointer-events-none">
            <iframe
              key={ytId}
              ref={ytFrameRef}
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&playsinline=1&enablejsapi=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0`}
              title="Flow Channel"
              className="flow-cover-frame border-none bg-black"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              onLoad={() => { try { ytFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*'); } catch { /* ignore */ } if (pausedRef.current) hush(); else if (!muted) post('unMute'); }}
            />
          </div>
        )}

        <div aria-hidden className="absolute inset-0 z-[1] bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
        <div aria-hidden className="absolute inset-0 z-[1] bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div aria-hidden className="absolute inset-0 z-[1] lux-scan opacity-60" />

        {/* The HUD: hides after a few quiet seconds, back on any touch, key or move. */}
        <div className={`absolute inset-0 z-10 flex flex-col justify-end px-4 md:px-12 pb-24 md:pb-28 transition-opacity duration-500 ${showOverlay || !videoUrl ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute top-24 md:top-20 right-4 md:right-12 flex items-center gap-3">
            {isActuallyPlaying && (
              <span className="flex items-center gap-1.5 bg-red-500 text-[#fff] px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-[#fff] animate-pulse" /> On air</span>
            )}
            {isActuallyPlaying && (
              <button onClick={toggleMute} data-tv-focusable aria-label={muted ? 'Unmute' : 'Mute'} className="btn-glass w-11 h-11 rounded-full flex items-center justify-center">
                {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}
          </div>

          {playingMedia && (
            <div key={playingMedia.id} className="max-w-2xl lux-enter">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {activeChannel?.icon && <activeChannel.icon className="w-4 h-4 text-amber-400" />}
                <span className="lux-kicker">{activeChannel?.name} · Flow</span>
              </div>
              <h1 className="tv-hero-title lux-title text-4xl md:text-6xl pb-1 mb-3 line-clamp-2">{playingMedia.title}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-zinc-200 mb-3">
                {playingMedia.vote_average ? <span className="text-amber-300 tabular">★ {playingMedia.vote_average.toFixed(1)}</span> : null}
                {playingMedia.release_date && <span className="tabular">{playingMedia.release_date.slice(0, 4)}</span>}
                {playingMedia.runtime ? <span className="tabular">{playingMedia.runtime} min</span> : null}
                <LiveMeta>{CHANNELS.length} channels, always on</LiveMeta>
              </div>
              <p className="tv-hero-desc text-zinc-300 text-sm md:text-base leading-relaxed mb-6 line-clamp-2 max-w-xl">{playingMedia.overview}</p>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => watchFilm(playingMedia.id)} data-tv-focusable data-tv-initial className="lux-btn px-6 md:px-8 py-3 text-sm md:text-base">
                  <Play className="w-4 h-4 fill-current" /> Watch the film
                </button>
                <button onClick={() => handleEnded()} data-tv-focusable className="btn-glass px-5 py-3 font-bold rounded-full text-sm md:text-base">
                  Next trailer
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="-mt-16 relative z-10">
        <ChannelGuide
          active={activeChannelId}
          playing={isActuallyPlaying}
          art={channelArt}
          onTune={setActiveChannelId}
        />

        {upNext.length > 0 && (
          <UpNextRail items={upNext} channel={activeChannel?.name || ''} onJump={jumpTo} />
        )}

        {playingMedia && <LuxChapter kicker={`Now on ${activeChannel?.name}`} title={playingMedia.title} />}
      {/* Redesigned Active Channel Interactive Dashboard (Effective Space Use) */}
      {playingMedia && (
        <div className="px-4 md:px-12 mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Column 1: Poster and Essential Quick Info (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-4 text-left">
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-xl aspect-[2/3] group bg-zinc-900">
              <img loading="lazy" decoding="async" 
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
            <div className="lux-card p-4 space-y-3">
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
            <div className="lux-card p-6 md:p-8 space-y-5">
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
    </div>
  );
}

/** The guide: every channel as a wide still in its colours, the live one lit. */
function ChannelGuide({ active, playing, art, onTune }: {
  active: string; playing: boolean; art: Record<string, string>; onTune: (id: string) => void;
}) {
  const rail = useRail([Object.keys(art).length]);
  return (
    <div className="px-4 md:px-12 py-5">
      <RailHeader
        title="Channel guide" kicker="Tune in" count={CHANNELS.length} unit="channels"
        canPrev={rail.canPrev} canNext={rail.canNext} onPrev={rail.prev} onNext={rail.next}
      />
      <div ref={rail.ref} className="flex gap-3 md:gap-4 overflow-x-auto pt-1 pb-4 scrollbar-hide snap-x scroll-smooth">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          const on = c.id === active;
          return (
            <button
              key={c.id} onClick={() => onTune(c.id)} data-tv-focusable aria-pressed={on} aria-label={`Tune to ${c.name}`}
              className={`lux-card group flex-none w-[200px] md:w-[250px] snap-start text-left focus:outline-none ${on ? 'ring-2 ring-amber-400' : ''}`}
            >
              <span className="relative block aspect-video overflow-hidden rounded-[inherit]">
                <span className={`absolute inset-0 bg-gradient-to-br ${c.color}`} />
                {art[c.id] && <img src={art[c.id]} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-luminosity transition-transform duration-700 group-hover:scale-105" />}
                <span className={`absolute inset-0 bg-gradient-to-br ${c.color} opacity-55 mix-blend-multiply`} />
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                {on && (
                  <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-red-500 text-[#fff] px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#fff] animate-pulse" /> {playing ? 'On air' : 'Tuning'}
                  </span>
                )}
                <span className="absolute bottom-0 inset-x-0 p-3 flex items-center gap-2">
                  <Icon className="w-4 h-4 text-[#fff] shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-[#fff] truncate">{c.name}</span>
                    <span className="block text-[11px] text-[#fff]/70 truncate">{on ? 'Now playing' : c.tag}</span>
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** What the channel plays next; any one can be pulled forward. */
function UpNextRail({ items, channel, onJump }: { items: { m: MediaDetails; index: number }[]; channel: string; onJump: (index: number) => void }) {
  const rail = useRail([items.length]);
  return (
    <div className="px-4 md:px-12 py-5">
      <RailHeader
        title="Up next" kicker={channel} count={items.length} unit="trailers"
        canPrev={rail.canPrev} canNext={rail.canNext} onPrev={rail.prev} onNext={rail.next}
      />
      <div ref={rail.ref} className="flex gap-3 md:gap-4 overflow-x-auto pt-1 pb-4 scrollbar-hide snap-x scroll-smooth">
        {items.map(({ m, index }, n) => (
          <button
            key={`${m.id}-${index}`} onClick={() => onJump(index)} data-tv-focusable aria-label={`Play the trailer for ${m.title}`}
            className="lux-card group flex-none w-[200px] md:w-[250px] snap-start text-left focus:outline-none"
          >
            <span className="relative block aspect-video overflow-hidden rounded-[inherit] bg-zinc-800">
              <img src={getImageUrl(m.backdrop_path || m.poster_path, 'w300')} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              {n === 0 && <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-[9px] font-bold uppercase tracking-wider text-amber-300">Next</span>}
              <span aria-hidden className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                <span className="btn-gold w-10 h-10 rounded-full flex items-center justify-center"><Play className="w-4 h-4 fill-current ml-0.5" /></span>
              </span>
              <span className="absolute bottom-0 inset-x-0 p-3">
                <span className="block text-sm font-bold text-[#fff] truncate">{m.title}</span>
                <span className="block text-[11px] text-[#fff]/70 tabular">{m.release_date?.slice(0, 4) || 'Film'}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
