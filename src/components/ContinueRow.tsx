import { Play, X } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';
import { haptics } from '../services/haptics';

export interface ContinueEntry {
  mediaId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  item: MediaItem;
}

/**
 * "Jump back in" — the row that turns a browse page into somewhere you return
 * to. Home never had one, so a half-watched series was three taps away.
 *
 * NOTE ON PROGRESS BARS: there deliberately isn't one. The app records WHEN a
 * title was last opened, not how far through it you are — no playback position
 * is stored anywhere. A bar drawn from that would be decoration pretending to be
 * data. What IS known is which episode you were on, so that is what it shows.
 */
export default function ContinueRow({
  entries,
  onPlay,
  onRemove,
}: {
  entries: ContinueEntry[];
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean, season?: number, episode?: number) => void;
  onRemove?: (mediaId: number) => void;
}) {
  if (!entries.length) return null;

  return (
    <div className="px-4 md:px-12 py-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-1 h-5 md:h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
        <h2 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight">Jump back in</h2>
      </div>

      <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
        {entries.map((e) => {
          const art = e.item.backdrop_path || e.item.poster_path;
          const title = e.item.title || e.item.name || '';
          const where = e.mediaType === 'tv' && e.season && e.episode
            ? `S${e.season} · E${e.episode}`
            : 'Film';
          return (
            <div
              key={`${e.mediaType}-${e.mediaId}`}
              role="button"
              tabIndex={0}
              data-tv-focusable
              aria-label={`Resume ${title}`}
              onClick={() => { haptics.press(); onPlay(e.mediaId, e.mediaType, false, false, e.season, e.episode); }}
              className="card-lift group relative flex-none w-[220px] md:w-[280px] snap-start rounded-xl overflow-hidden border border-white/10 bg-zinc-900/60 cursor-pointer focus:outline-none"
            >
              <div className="relative aspect-video bg-zinc-800">
                {art ? (
                  <img src={getImageUrl(art, 'w300')} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                  <span className="w-11 h-11 rounded-full bg-white/95 text-black flex items-center justify-center shadow-lg">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </span>
                </div>
                {onRemove && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); haptics.tap(); onRemove(e.mediaId); }}
                    aria-label={`Remove ${title} from Jump back in`}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-zinc-300 hover:text-white hover:bg-black/85 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity backdrop-blur"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-sm font-bold text-white truncate">{title}</p>
                  <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">{where}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
