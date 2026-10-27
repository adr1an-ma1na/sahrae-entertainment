import { useEffect, useRef, useState, type ReactNode } from 'react';
import MediaRow from './MediaRow';
import { discoverWith, type MediaItem } from '../services/tmdb';

// One session's answers, so switching between Movies and Series does not refetch.
const cache = new Map<string, MediaItem[]>();

/**
 * A shelf that asks TMDB for its titles only when it comes near the screen.
 * The Movies and Series pages carry a dozen shelves; loading them all up front
 * would cost a phone a dozen requests and their posters for rows never seen.
 */
export default function LazyShelf({ type, title, kicker, params, onPlay }: {
  type: 'movie' | 'tv';
  title: string;
  kicker?: ReactNode;
  params: Record<string, string>;
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
}) {
  const key = `${type}:${JSON.stringify(params)}`;
  const [items, setItems] = useState<MediaItem[] | null>(() => cache.get(key) ?? null);
  const [near, setNear] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items || near) return;
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '700px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [items, near]);

  useEffect(() => {
    if (!near || items) return;
    let live = true;
    discoverWith(type, params)
      .then((r) => { const got = r.filter((x) => x.poster_path); cache.set(key, got); if (live) setItems(got); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
    // key captures type and params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, key]);

  // A shelf with nothing in it steps aside rather than leaving a gap.
  if (items && items.length === 0) return null;
  return (
    <div ref={ref} className={items ? '' : 'min-h-[300px]'}>
      <MediaRow kicker={kicker} title={title} items={items || []} onPlay={onPlay} defaultType={type} isLoading={!items} />
    </div>
  );
}
