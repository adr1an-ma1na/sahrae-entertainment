import { useEffect, useState } from 'react';
import { Download, Play, Pause, Trash2, Music2, Film, X, Loader2 } from 'lucide-react';
import { useDownloads, downloads } from '../services/downloads';
import { listVideoDownloads, videoSrc, removeVideoDownload, VideoDownload } from '../services/videoDownloads';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';

export default function DownloadsView() {
  const tracks = useDownloads();
  const { current, isPlaying, toggle, playQueue } = useMusic();

  const [videos, setVideos] = useState<VideoDownload[]>([]);
  const [playing, setPlaying] = useState<VideoDownload | null>(null);

  useEffect(() => {
    let on = true;
    const tick = async () => { const v = await listVideoDownloads(); if (on) setVideos(v); };
    tick();
    const iv = setInterval(tick, 3000); // reconcile in-progress downloads
    return () => { on = false; clearInterval(iv); };
  }, []);

  return (
    <div className="sauti pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-5xl mx-auto min-h-screen pb-40">
      <div className="overline text-sauti mb-1.5">Sahrae · Offline</div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Download className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Downloads</h2>
          <p className="text-sm text-zinc-400">{tracks.length} {tracks.length === 1 ? 'song' : 'songs'} · {videos.length} {videos.length === 1 ? 'title' : 'titles'} · plays offline, in-app</p>
        </div>
      </div>

      {/* ── Movies & Series ── */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <Film className="w-4 h-4 text-sauti" />
          <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Movies &amp; Series</h3>
        </div>
        {videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {videos.map((v) => (
              <div key={v.id} tabIndex={v.done ? 0 : undefined} data-tv-focusable={v.done || undefined} role={v.done ? 'button' : undefined}
                onClick={() => v.done && setPlaying(v)}
                className={`card-lift flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-zinc-900/40 focus:outline-none ${v.done ? 'cursor-pointer' : 'opacity-80'}`}>
                <span className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  {v.done ? <Play className="w-5 h-5 text-sauti fill-current" /> : <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{v.title}</p>
                  <p className="text-xs text-zinc-400">{v.done ? 'Offline · tap to play' : 'Downloading…'}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeVideoDownload(v.id); setVideos((x) => x.filter((d) => d.id !== v.id)); }} className="p-2 rounded-full text-zinc-500 hover:text-red-400 shrink-0" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass rounded-2xl p-5 text-sm text-zinc-400 leading-relaxed">
            Open a movie or show, tap <span className="text-sauti font-semibold">Download</span>, then use the download button on the page — it saves inside the app (not your file manager) and appears here to watch offline.
          </div>
        )}
      </div>

      {/* ── Music ── */}
      <div className="flex items-center gap-2 mb-3">
        <Music2 className="w-4 h-4 text-sauti" />
        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Music</h3>
      </div>
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
          In Sauti, open a song's <span className="text-white">+</span> menu and tap <span className="text-sauti font-semibold">Download</span> — saved inside the app, plays with no internet.
        </div>
      )}

      {/* ── In-app offline video player ── */}
      {playing && (
        <div role="dialog" data-tv-layer className="dark fixed inset-0 z-[140] bg-black flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2.5 glass">
            <p className="text-white font-bold text-sm truncate flex-1">{playing.title}</p>
            <button onClick={() => setPlaying(null)} data-tv-close tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full glass-liquid flex items-center justify-center text-white shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
          <video src={videoSrc(playing)} className="flex-1 w-full bg-black" controls autoPlay playsInline />
        </div>
      )}
    </div>
  );
}
