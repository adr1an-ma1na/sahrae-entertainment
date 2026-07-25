import { useState } from 'react';
import { Download, Play, Pause, Trash2, Music2, Film, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDownloads, downloads } from '../services/downloads';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import { useVideoDownloads } from '../hooks/useVideoDownloads';
import { getImageUrl } from '../services/tmdb';

interface DownloadsViewProps {
  onPlay?: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean, season?: number, episode?: number) => void;
}

export default function DownloadsView({ onPlay }: DownloadsViewProps) {
  const tracks = useDownloads();
  const { current, isPlaying, toggle, playQueue } = useMusic();
  const { downloadedVideos, totalUsedBytes, removeDownload } = useVideoDownloads();
  const [activeTab, setActiveTab] = useState<'videos' | 'audio'>('videos');

  const usedBytes = downloads.bytesUsed() + totalUsedBytes;
  const fmtSize = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);

  return (
    <div className="sauti pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-5xl mx-auto min-h-screen pb-40">
      <div className="overline text-sauti mb-1.5">Sahrae · Offline</div>
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Download className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Downloads</h2>
          <p className="text-sm text-zinc-400">
            {downloadedVideos.length + tracks.length} {(downloadedVideos.length + tracks.length) === 1 ? 'item' : 'items'}
            {usedBytes > 0 ? ` · ${fmtSize(usedBytes)} used` : ''} · plays offline, in-app
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/5 pb-4 mb-6">
        <button
          onClick={() => setActiveTab('videos')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all ${
            activeTab === 'videos'
              ? 'bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20'
              : 'text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10'
          }`}
        >
          <Film className="w-4 h-4" />
          Movies &amp; Series ({downloadedVideos.length})
        </button>
        <button
          onClick={() => setActiveTab('audio')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all ${
            activeTab === 'audio'
              ? 'bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20'
              : 'text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10'
          }`}
        >
          <Music2 className="w-4 h-4" />
          Music &amp; Podcasts ({tracks.length})
        </button>
      </div>

      {/* ── Movies & Series Tab ── */}
      {activeTab === 'videos' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {downloadedVideos.length > 0 ? (
            <div className="grid gap-3">
              {downloadedVideos.map((video) => {
                const isTv = video.type === 'tv';
                return (
                  <div key={video.id} tabIndex={0} data-tv-focusable role="button"
                    onClick={() => video.status === 'done' && onPlay?.(video.mediaId, video.type, false, false, video.season, video.episode)}
                    className={`card-lift group flex flex-col md:flex-row items-start md:items-center gap-4 p-3 rounded-xl border border-white/5 bg-zinc-900/40 focus:outline-none ${video.status === 'done' ? 'cursor-pointer' : 'cursor-default'}`}>
                    
                    {/* Poster/Backdrop */}
                    <div className="relative w-full md:w-32 aspect-video rounded-lg overflow-hidden bg-zinc-800 shrink-0 shadow-inner">
                      {video.backdropPath ? (
                        <img src={getImageUrl(video.backdropPath, 'w300')} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                          <Film className="w-6 h-6 text-zinc-600" />
                        </div>
                      )}
                      {video.status === 'done' && (
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-8 h-8 text-white fill-current" />
                        </div>
                      )}
                    </div>

                    {/* Meta details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-500 rounded text-[9px] font-bold uppercase tracking-wider">
                          {isTv ? 'TV Series' : 'Movie'}
                        </span>
                        {isTv && (
                          <span className="text-zinc-400 text-xs font-semibold">
                            Season {video.season} · Episode {video.episode}
                          </span>
                        )}
                      </div>
                      <p className="text-base font-bold text-white mt-1 truncate">{video.title}</p>
                      {isTv && video.episodeTitle && (
                        <p className="text-xs text-amber-500/90 font-medium truncate mt-0.5">"{video.episodeTitle}"</p>
                      )}
                      <p className="text-xs text-zinc-400 line-clamp-1 mt-1">{video.overview}</p>
                    </div>

                    {/* Status & Size */}
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end shrink-0 border-t border-white/5 md:border-0 pt-3 md:pt-0 mt-1 md:mt-0">
                      <div className="flex flex-col items-end text-right">
                        {video.status === 'done' ? (
                          <>
                            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Ready Offline
                            </span>
                            <span className="text-[10px] text-zinc-500 font-semibold mt-0.5">
                              {fmtSize(video.size || 0)}
                            </span>
                          </>
                        ) : video.status === 'downloading' ? (
                          <>
                            <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1.5 animate-pulse">
                              <div className="w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
                              Downloading {Math.round((video.progress || 0) * 100)}%
                            </span>
                            <span className="text-[10px] text-zinc-500 font-semibold mt-0.5">
                              {fmtSize(video.size || 0)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> Error
                            </span>
                            <span className="text-[9px] text-red-400 font-medium mt-0.5">
                              Tap delete &amp; retry
                            </span>
                          </>
                        )}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeDownload(video.id); }} 
                        className="p-2.5 rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" 
                        aria-label="Remove download"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass rounded-2xl p-6 text-sm text-zinc-400 leading-relaxed text-center sm:text-left">
              <Film className="w-10 h-10 text-amber-500/50 mb-3 mx-auto sm:mx-0" />
              <h4 className="text-white font-bold text-base mb-1">No Movie or TV Downloads yet</h4>
              <p className="text-xs text-zinc-400 max-w-md">
                Browse movies and series, select any title, and tap the <span className="text-amber-500 font-bold">Download</span> button to save media for high-speed offline viewing directly in the app.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Music & Podcasts Tab ── */}
      {activeTab === 'audio' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {tracks.length > 0 ? (
            <>
              <button onClick={() => playQueue(tracks, 0, 'Downloads')} className="btn-sauti mb-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold">
                <Play className="w-4 h-4 fill-current" /> Play all
              </button>
              <div className="space-y-1.5">
                {tracks.map((track) => {
                  const active = current?.id === track.id;
                  return (
                    <div key={track.id} tabIndex={0} data-tv-focusable role="button"
                      onClick={() => (active ? toggle() : playQueue(tracks, tracks.findIndex((t) => t.id === track.id), 'Downloads'))}
                      className="card-lift group flex items-center gap-3 p-2 rounded-xl border border-white/5 bg-zinc-900/40 cursor-pointer focus:outline-none">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                        <CoverArt imageUrl={track.artwork} dominantColor={track.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
                        {!track.artwork && <Music2 className="w-5 h-5 text-zinc-600 absolute inset-0 m-auto" />}
                        <div className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          {active && isPlaying ? <Pause className="w-5 h-5 text-white fill-current" /> : <Play className="w-5 h-5 text-white fill-current ml-0.5" />}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold truncate ${active ? 'text-sauti' : 'text-white'}`}>{track.title}</p>
                        <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
                      </div>
                      <span className="text-[10px] font-bold text-sauti flex items-center gap-1 shrink-0"><Download className="w-3 h-3" /> Offline</span>
                      <button onClick={(e) => { e.stopPropagation(); downloads.remove(track.id); }} className="p-2 rounded-full text-zinc-500 hover:text-red-400" aria-label="Remove download"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="glass rounded-2xl p-5 text-sm text-zinc-400 leading-relaxed">
              In Sauti or Podcasts, tap <span className="text-sauti font-semibold">Download</span> on a song or episode, saving it inside the app to play with no internet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
