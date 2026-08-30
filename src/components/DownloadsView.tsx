import { useMemo, useState } from 'react';
import {
  Download, Play, Pause, Trash2, Music2, Film, CheckCircle2, RotateCw, Wifi, HardDrive, ChevronDown,
} from 'lucide-react';
import { useDownloads, downloads } from '../services/downloads';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import { useVideoDownloads } from '../hooks/useVideoDownloads';
import { getImageUrl } from '../services/tmdb';
import {
  VideoDownloadItem, progressOf, statusLabel, formatBytes,
} from '../services/videoDownloads';

interface DownloadsViewProps {
  onPlay?: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean, season?: number, episode?: number) => void;
}

/**
 * Progress as a ring around the artwork, the way a downloads shelf reads best:
 * the thing you are waiting for, with its own progress attached to it, rather
 * than a bar somewhere else on the row that you have to associate by position.
 */
function ProgressRing({ value, size = 34 }: { value: number; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="2.5" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f59e0b" strokeWidth="2.5"
        strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

function VideoRow({
  item, src, onPlayFile, onRemove, onRetry,
}: {
  item: VideoDownloadItem;
  src: string | null;
  onPlayFile: (s: string, t: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const pct = progressOf(item);
  const active = item.state === 'running' || item.state === 'queued' || item.state === 'paused';
  const label = item.type === 'tv' && item.season && item.episode
    ? `S${item.season} · E${item.episode}${item.title ? ` · ${item.title}` : ''}`
    : item.title;

  return (
    <div
      tabIndex={0} data-tv-focusable role="button"
      onClick={() => { if (src) onPlayFile(src, item.title); }}
      className={`card-lift group flex items-center gap-3 p-2.5 rounded-xl border border-white/5 bg-zinc-900/40 focus:outline-none ${src ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="relative w-24 sm:w-28 aspect-video rounded-lg overflow-hidden bg-zinc-800 shrink-0 shadow-inner">
        {item.poster ? (
          <img src={getImageUrl(item.poster, 'w300')} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900"><Film className="w-5 h-5 text-zinc-600" /></div>
        )}
        {src && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="w-7 h-7 text-white fill-current" />
          </div>
        )}
        {active && (
          <div className="absolute inset-0 bg-black/65 flex items-center justify-center">
            <ProgressRing value={pct} />
            {pct > 0 && (
              <span className="absolute text-[9px] font-bold text-white tabular-nums">{Math.round(pct * 100)}</span>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate">{label}</p>
        <p className={`text-[11px] mt-0.5 truncate ${
          item.state === 'failed' ? 'text-red-400'
            : item.state === 'paused' ? 'text-amber-400'
            : item.state === 'done' ? 'text-zinc-500' : 'text-amber-500'
        }`}>
          {statusLabel(item)}
        </p>
        {item.state === 'running' && item.total > 0 && (
          <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%` }} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {item.state === 'done' && (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-label="Ready offline" />
        )}
        {item.state === 'failed' && (
          <button
            onClick={(e) => { e.stopPropagation(); onRetry(item.id); }}
            className="p-2 rounded-full text-amber-400 hover:bg-amber-500/10 transition-colors"
            aria-label={`Retry ${item.title}`}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
          className="p-2 rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label={`Remove ${item.title}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function DownloadsView({ onPlay }: DownloadsViewProps) {
  const tracks = useDownloads();
  const { current, isPlaying, toggle, playQueue } = useMusic();
  const {
    downloadedVideos, stats, removeDownload, retryDownload, setWifiOnly, localSrc, supported,
  } = useVideoDownloads();
  const [activeTab, setActiveTab] = useState<'videos' | 'audio'>('videos');
  const [playingFile, setPlayingFile] = useState<{ src: string; title: string } | null>(null);
  const [openShows, setOpenShows] = useState<Record<string, boolean>>({});

  const audioBytes = downloads.bytesUsed();

  /**
   * Episodes collapse under their series; films stay as single rows.
   *
   * A season of television is twelve rows of nearly identical text, and it
   * pushes everything else off the screen. Grouping keeps the shelf readable
   * once someone actually uses it, which is the only point at which the problem
   * shows up.
   */
  const groups = useMemo(() => {
    const shows = new Map<string, { key: string; name: string; poster?: string; items: VideoDownloadItem[] }>();
    const singles: VideoDownloadItem[] = [];
    for (const v of downloadedVideos) {
      if (v.type === 'tv' && (v.show || v.tmdbId)) {
        const key = `tv:${v.tmdbId || v.show}`;
        const g = shows.get(key) || { key, name: v.show || v.title, poster: v.poster, items: [] };
        g.items.push(v);
        if (!g.poster && v.poster) g.poster = v.poster;
        shows.set(key, g);
      } else {
        singles.push(v);
      }
    }
    for (const g of shows.values()) {
      g.items.sort((a, b) => (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0));
    }
    return { shows: [...shows.values()], singles };
  }, [downloadedVideos]);

  const totalItems = downloadedVideos.length + tracks.length;

  return (
    <div className="sauti pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-5xl mx-auto min-h-screen pb-40">
      <div className="overline text-sauti mb-1.5">Sahrae · Offline</div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Download className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Downloads</h2>
          <p className="text-sm text-zinc-400">
            {totalItems} {totalItems === 1 ? 'item' : 'items'}
            {stats.active > 0 ? ` · ${stats.active} in progress` : ''} · plays offline, in-app
          </p>
        </div>
      </div>

      {/* Storage. Only shown when there is something to measure — an empty bar
          reading "0 MB used" is noise on a fresh install. */}
      {supported && (stats.used > 0 || stats.free > 0) && (
        <div className="glass rounded-2xl p-3.5 mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="flex items-center gap-2 text-xs font-bold text-white">
              <HardDrive className="w-4 h-4 text-amber-500" />
              {formatBytes(stats.used + audioBytes)} used
            </span>
            <span className="text-[11px] text-zinc-400 tabular-nums">{formatBytes(stats.free)} free</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-[width] duration-700"
              style={{ width: `${Math.min(100, ((stats.used + audioBytes) / Math.max(1, stats.used + audioBytes + stats.free)) * 100)}%` }}
            />
          </div>
          <button
            onClick={() => setWifiOnly(!stats.wifiOnly)}
            tabIndex={0} data-tv-focusable
            className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-zinc-300 hover:text-white transition-colors"
            role="switch" aria-checked={stats.wifiOnly}
          >
            <span className={`w-8 h-[18px] rounded-full p-0.5 transition-colors shrink-0 ${stats.wifiOnly ? 'bg-amber-500' : 'bg-white/15'}`}>
              <span className={`block w-[14px] h-[14px] rounded-full bg-white transition-transform ${stats.wifiOnly ? 'translate-x-[14px]' : ''}`} />
            </span>
            <Wifi className="w-3.5 h-3.5" />
            Download over Wi-Fi only
          </button>
        </div>
      )}

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

      {/* ── Movies & Series ── */}
      {activeTab === 'videos' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {playingFile && (
            <div className="rounded-xl overflow-hidden border border-white/10 bg-black mb-2">
              <video src={playingFile.src} controls autoPlay className="w-full aspect-video bg-black" />
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <p className="text-sm text-white font-semibold truncate">{playingFile.title}</p>
                <button onClick={() => setPlayingFile(null)} className="text-xs font-bold text-zinc-400 hover:text-white shrink-0">Close</button>
              </div>
            </div>
          )}

          {downloadedVideos.length > 0 ? (
            <>
              {groups.shows.map((g) => {
                const open = openShows[g.key] ?? true;
                const ready = g.items.filter((i) => i.state === 'done').length;
                return (
                  <div key={g.key} className="rounded-xl border border-white/5 bg-zinc-900/25 overflow-hidden">
                    <button
                      onClick={() => setOpenShows((s) => ({ ...s, [g.key]: !open }))}
                      tabIndex={0} data-tv-focusable aria-expanded={open}
                      className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                        {g.poster
                          ? <img src={getImageUrl(g.poster, 'w300')} alt="" className="w-full h-full object-cover" loading="lazy" />
                          : <Film className="w-5 h-5 text-zinc-600 m-auto mt-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{g.name}</p>
                        <p className="text-[11px] text-zinc-500">{ready} of {g.items.length} ready offline</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
                    </button>
                    {open && (
                      <div className="px-2 pb-2 space-y-1.5">
                        {g.items.map((v) => (
                          <VideoRow
                            key={v.id} item={v} src={localSrc(v)}
                            onPlayFile={(s, t) => setPlayingFile({ src: s, title: t })}
                            onRemove={removeDownload} onRetry={retryDownload}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {groups.singles.map((v) => (
                <VideoRow
                  key={v.id} item={v} src={localSrc(v)}
                  onPlayFile={(s, t) => setPlayingFile({ src: s, title: t })}
                  onRemove={removeDownload} onRetry={retryDownload}
                />
              ))}
            </>
          ) : (
            <div className="glass rounded-2xl p-6 text-sm text-zinc-400 leading-relaxed text-center sm:text-left">
              <Film className="w-10 h-10 text-amber-500/50 mb-3 mx-auto sm:mx-0" />
              {supported ? (
                <>
                  <h4 className="text-white font-bold text-base mb-1">No movie or TV downloads yet</h4>
                  <p className="text-xs text-zinc-400 max-w-md">
                    Open any title and tap <span className="text-amber-500 font-bold">Download</span>, then tap the download button on the provider page. Sahrae saves the file inside the app and it appears here, with progress, as it comes down.
                  </p>
                </>
              ) : (
                <>
                  <h4 className="text-white font-bold text-base mb-1">Downloads need the Android app</h4>
                  <p className="text-xs text-zinc-400 max-w-md">
                    A browser can't save a video into the app's own storage, so in-app downloads only work in the Sahrae Android app. On the web, the Download button opens the provider and the file saves to this device instead.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Music & Podcasts ── */}
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
