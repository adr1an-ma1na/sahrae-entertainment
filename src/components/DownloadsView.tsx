import { Download, Play, Pause, Trash2, Music2 } from 'lucide-react';
import { useDownloads, downloads } from '../services/downloads';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';

export default function DownloadsView() {
  const tracks = useDownloads();
  const { current, isPlaying, toggle, playQueue } = useMusic();

  const usedBytes = downloads.bytesUsed();
  const fmtSize = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);

  return (
    <div className="sauti pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-5xl mx-auto min-h-screen pb-40">
      <div className="overline text-sauti mb-1.5">Sahrae · Offline</div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Download className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Downloads</h2>
          <p className="text-sm text-zinc-400">{tracks.length} {tracks.length === 1 ? 'item' : 'items'}{usedBytes > 0 ? ` · ${fmtSize(usedBytes)} used` : ''} · plays offline, in-app</p>
        </div>
      </div>

      {/* ── Music & Podcasts (movies/series download to the device, not in-app) ── */}
      <div className="flex items-center gap-2 mb-3">
        <Music2 className="w-4 h-4 text-sauti" />
        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Music &amp; Podcasts</h3>
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
          In Sauti or Podcasts, tap <span className="text-sauti font-semibold">Download</span> on a song or episode — saved inside the app, plays with no internet.
        </div>
      )}
    </div>
  );
}
