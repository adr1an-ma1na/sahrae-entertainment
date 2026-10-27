import { t } from '../i18n';
import { Play, X } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';
import { haptics } from '../services/haptics';
import { RailHeader } from './ui/Lux';
import { useRail } from '../hooks/useRail';

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
  const rail = useRail([entries.length]);
  if (!entries.length) return null;

  return (
    <div className="px-4 md:px-12 py-6">
      <RailHeader
        title={t('Jump back in')} kicker="Your sessions"
        canPrev={rail.canPrev} canNext={rail.canNext} onPrev={rail.prev} onNext={rail.next}
      />

      <div ref={rail.ref} className="flex gap-3 md:gap-4 overflow-x-auto pt-1 pb-4 scrollbar-hide snap-x scroll-smooth">
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
              className="lux-card group flex-none w-[230px] md:w-[300px] snap-start cursor-pointer focus:outline-none"
            >
              <div className="relative aspect-video bg-zinc-800">
                {art ? (
                  <img src={getImageUrl(art, 'w300')} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                  <span className="btn-gold w-12 h-12 rounded-full flex items-center justify-center shadow-lg">
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
                  <p className="text-sm font-bold text-[#fff] truncate drop-shadow">{title}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300"><span className="w-1 h-1 rounded-full bg-amber-400" />{where}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
