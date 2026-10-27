import { useState } from 'react';
import { Download, Play, Pause, Trash2, Music2, Film, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDownloads, downloads } from '../services/downloads';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import { useVideoDownloads } from '../hooks/useVideoDownloads';

import Illustration from './ui/Illustration';
import { LuxHeader, LuxGlow, LuxSeg } from './ui/Lux';

interface DownloadsViewProps {
  onPlay?: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean, season?: number, episode?: number) => void;
}

export default function DownloadsView({ onPlay }: DownloadsViewProps) {
  const tracks = useDownloads();
  const { current, isPlaying, toggle, playQueue } = useMusic();
  const { downloadedVideos, removeDownload, localSrc, supported } = useVideoDownloads();
  const [activeTab, setActiveTab] = useState<'videos' | 'audio'>('videos');
  // Saved files play right here, from the app's own storage.
  const [playingFile, setPlayingFile] = useState<{ src: string; title: string } | null>(null);

  const usedBytes = downloads.bytesUsed();
  const fmtSize = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-5xl mx-auto min-h-screen pb-40 relative">
      <LuxGlow />
      <LuxHeader kicker={<><Download className="w-3.5 h-3.5" /> Sahrae · Offline</>} title="Downloads"
        meta={<span>Saved inside the app. Plays with no internet.</span>} />

      {/* The vault: what is saved, at a glance. */}
      <div className="lux-spot p-5 md:p-6 mb-8 grid grid-cols-3 gap-3 text-center lux-enter">
        {[
          { k: 'Films & series', v: String(downloadedVideos.length), icon: Film },
          { k: 'Songs & episodes', v: String(tracks.length), icon: Music2 },
          { k: 'Music space used', v: usedBytes > 0 ? fmtSize(usedBytes) : '0 MB', icon: Download },
        ].map(({ k, v, icon: Icon }) => (
          <div key={k} className="flex flex-col items-center gap-1">
            <Icon className="w-5 h-5 text-amber-400 mb-1" />
            <span className="lux-title text-2xl md:text-4xl tabular">{v}</span>
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">{k}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <LuxSeg className="mb-7" active={activeTab} onChange={setActiveTab} items={[
        { id: 'videos', label: `Movies & Series (${downloadedVideos.length})`, icon: Film },
        { id: 'audio', label: `Music & Podcasts (${tracks.length})`, icon: Music2 },
      ]} />

      {/* ── Movies & Series Tab ── */}
      {activeTab === 'videos' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {playingFile && (
            <div className="rounded-3xl overflow-hidden ring-1 ring-white/10 bg-black mb-2 shadow-2xl">
              <video src={playingFile.src} controls autoPlay className="w-full aspect-video bg-black" />
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <p className="text-sm text-white font-semibold truncate">{playingFile.title}</p>
                <button onClick={() => setPlayingFile(null)} className="text-xs font-bold text-zinc-400 hover:text-white shrink-0">Close</button>
              </div>
            </div>
          )}

          {downloadedVideos.length > 0 ? (
            <div className="grid gap-3">
              {downloadedVideos.map((video) => {
                const src = localSrc(video);
                return (
                  <div key={video.id} tabIndex={0} data-tv-focusable role="button"
                    onClick={() => { if (src) setPlayingFile({ src, title: video.title }); }}
                    className={`lux-card group flex flex-col md:flex-row items-start md:items-center gap-4 p-3 focus:outline-none ${src ? 'cursor-pointer' : 'cursor-default'}`}>

                    <div className="relative w-full md:w-36 aspect-video rounded-xl overflow-hidden shrink-0 ring-1 ring-white/10" style={{ background: 'radial-gradient(90% 120% at 0% 0%, rgb(var(--acc-rgb) / .35), transparent 60%), radial-gradient(80% 120% at 100% 100%, rgb(var(--acc2-rgb) / .45), transparent 60%), var(--zinc-800)' }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="font-display font-black text-white/90 text-2xl drop-shadow">{video.title.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
                      </div>
                      {src && (
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-8 h-8 text-white fill-current" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-white truncate">{video.title}</p>
                      <p className="text-xs text-zinc-500 mt-1 truncate">
                        {video.done ? 'Saved in the app' : 'Downloading…'}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end shrink-0 border-t border-white/5 md:border-0 pt-3 md:pt-0 mt-1 md:mt-0">
                      <div className="flex flex-col items-end text-right">
                        {video.done ? (
                          <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Ready Offline
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1.5 animate-pulse">
                            <div className="w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
                            Downloading
                          </span>
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
            <div className="lux-card px-6 py-10 text-sm text-zinc-400 leading-relaxed text-center flex flex-col items-center">
              <Illustration name="downloads" className="w-48 md:w-56 h-auto mb-4" />
              {supported ? (
                <>
                  <h4 className="text-white font-bold text-lg mb-1">No movie or TV downloads yet</h4>
                  <p className="text-sm text-zinc-400 max-w-md">
                    Open any title and tap <span className="text-amber-500 font-bold">Download</span>. The file is saved inside the app and appears here when it finishes.
                  </p>
                </>
              ) : (
                <>
                  <h4 className="text-white font-bold text-lg mb-1">Downloads need the Android app</h4>
                  <p className="text-sm text-zinc-400 max-w-md">
                    A browser can't save a video into the app's own storage, so in-app downloads only work in the Sahrae Android app. On the web, the Download button opens the provider and the file saves to this device instead.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Music & Podcasts Tab ── */}
      {activeTab === 'audio' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {tracks.length > 0 ? (
            <>
              <button onClick={() => playQueue(tracks, 0, 'Downloads')} className="lux-btn mb-4 px-7 py-3 text-sm">
                <Play className="w-4 h-4 fill-current" /> Play all
              </button>
              <div className="space-y-1.5">
                {tracks.map((track) => {
                  const active = current?.id === track.id;
                  return (
                    <div key={track.id} tabIndex={0} data-tv-focusable role="button"
                      onClick={() => (active ? toggle() : playQueue(tracks, tracks.findIndex((t) => t.id === track.id), 'Downloads'))}
                      className="lux-card group flex items-center gap-3 p-2.5 cursor-pointer focus:outline-none">
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
            <div className="lux-card px-6 py-10 text-sm text-zinc-400 leading-relaxed text-center flex flex-col items-center">
              <Illustration name="music" className="w-48 md:w-56 h-auto mb-4" />
              <h4 className="text-white font-bold text-lg mb-1">No songs or episodes saved</h4>
              <p className="max-w-md">In Music or Podcasts, tap <span className="text-sauti font-semibold">Download</span> on a song or episode to play it here with no internet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
