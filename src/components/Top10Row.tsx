import { t } from '../i18n';
import { Play, Star } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';
import { RailHeader } from './ui/Lux';
import { useRail } from '../hooks/useRail';

interface Top10RowProps {
  items: MediaItem[];
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
  title?: string;
  kicker?: string;
}

export default function Top10Row({ items, onPlay, title = "Top 10 Trending Today", kicker = "Trending this week" }: Top10RowProps) {
  const top10Items = items.slice(0, 10);
  const rail = useRail([items]);

  if (!top10Items || top10Items.length === 0) return null;

  return (
    <div className="px-4 md:px-12 py-6 relative">
      <RailHeader
        title={t(title)} kicker={kicker}
        canPrev={rail.canPrev} canNext={rail.canNext} onPrev={rail.prev} onNext={rail.next}
      />
      <div
        ref={rail.ref}
        className="flex overflow-x-auto gap-4 pb-4 scrollbar-hide snap-x scroll-smooth pl-10 md:pl-12 pr-12 md:pr-20"
      >
        {top10Items.map((item, index) => {
          const type = item.media_type || 'movie';
          return (
            <div
              key={`top10-${type}-${item.id}`}
              tabIndex={0}
              data-tv-focusable
              role="button"
              aria-label={`${index + 1}. ${item.title || item.name}`}
              className="relative flex-none w-[130px] md:w-[160px] lg:w-[200px] aspect-[2/3] rounded-xl group cursor-pointer snap-start flex items-center focus:outline-none"
              onClick={() => onPlay(item.id, type, true)}
            >
              {/* The rank, engraved: an accent outline over a dark fill, so it
                  reads as metal in every theme. */}
              <div className="absolute -left-8 md:-left-10 bottom-0 z-10 select-none pointer-events-none">
                <span className="lux-rank text-[100px] md:text-[130px]">{index + 1}</span>
              </div>

              <div className="w-full h-full rounded-xl overflow-hidden relative bg-zinc-900 z-20 ml-6 md:ml-8 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/10 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-amber-400/70 group-hover:shadow-[0_22px_44px_-16px_rgb(var(--acc-rgb)/0.55)] group-focus-visible:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-amber-400">
                <img
                  src={getImageUrl(item.poster_path)}
                  alt={item.title || item.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />

                {item.vote_average ? (
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-400 border border-white/10 shadow-lg z-20 flex items-center gap-1">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    <span>{item.vote_average.toFixed(1)}</span>
                  </div>
                ) : null}

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 md:p-4">
                  <h3 className="text-[#fff] font-display font-semibold text-xs md:text-sm line-clamp-2 mb-2 drop-shadow-md">
                    {item.title || item.name}
                  </h3>
                  <span className="btn-gold w-8 h-8 rounded-full flex items-center justify-center shadow-lg">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {/* Trailing spacer guarantees rank 9 & 10 scroll fully into view even
            where WebView ignores padding-right on a flex scroll container. */}
        <div aria-hidden className="flex-none w-4 md:w-8" />
      </div>
    </div>
  );
}
