import { t } from '../i18n';
import type { ReactNode } from 'react';
import { MediaItem } from '../services/tmdb';
import { Fragment } from 'react';
import PosterCard from './PosterCard';
import { RailHeader } from './ui/Lux';
import { useRail } from '../hooks/useRail';

interface MediaRowProps {
  title: string;
  items: MediaItem[];
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
  defaultType?: 'movie' | 'tv';
  isLoading?: boolean;
  /** Small tracked label over the title ("Because you watched"). */
  kicker?: ReactNode;
  /** No side padding: the row sits inside a panel that already has it. */
  bare?: boolean;
}

export default function MediaRow({ title, items, onPlay, defaultType = 'movie', isLoading = false, kicker, bare = false }: MediaRowProps) {
  const rail = useRail([items]);
  const pad = bare ? '' : 'px-4 md:px-12';

  if (isLoading) {
    return (
      <div className={`${pad} py-6 relative`}>
        <RailHeader title={t(title)} kicker={kicker} />
        <div className="flex overflow-x-hidden gap-2.5 md:gap-3 lg:gap-3.5 xl:gap-4 pb-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="skeleton flex-none w-[120px] md:w-[140px] lg:w-[160px] xl:w-[180px] aspect-[2/3] rounded-lg border border-white/5"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <div className={`${pad} py-6 relative`}>
      <RailHeader
        title={t(title)} kicker={kicker} count={items.length}
        canPrev={rail.canPrev} canNext={rail.canNext} onPrev={rail.prev} onNext={rail.next}
      />
      <div
        ref={rail.ref}
        className="flex overflow-x-auto gap-2.5 md:gap-3 lg:gap-3.5 xl:gap-4 pt-1 pb-6 scrollbar-hide snap-x scroll-smooth"
      >
        {items.map((item) => {
          const type = item.media_type || defaultType;
          return (
            <Fragment key={`${type}-${item.id}`}>
              <PosterCard item={item} type={type} onPlay={() => onPlay(item.id, type, true)} />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
