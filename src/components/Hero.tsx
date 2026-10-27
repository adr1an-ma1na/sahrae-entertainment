import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Play, Info, Star, Film, Plus, Check } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';
import { haptics } from '../services/haptics';

interface HeroProps {
  /** Today's trending titles in rank order; the first few become the showcase. */
  items: MediaItem[];
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean) => void;
  /** Genre names for a title's genre ids (movie and series lists merged). */
  genreName?: (id: number) => string | undefined;
  inList?: (id: number) => boolean;
  onToggleList?: (item: MediaItem) => void;
}

const SLIDES = 5;
const SLIDE_MS = 9000;

/**
 * The showcase at the top of Home: today's top five, one at a time, with the
 * artwork cross-fading and a strip of the others to jump between. It holds
 * still while it is pointed at, focused, off screen, in a background tab, or
 * when the viewer has asked for less motion.
 */
export default function Hero({ items, onPlay, genreName, inList, onToggleList }: HeroProps) {
  const slides = items.filter((m) => m.backdrop_path).slice(0, SLIDES);
  const [i, setI] = useState(() => Math.floor(Math.random() * Math.max(1, Math.min(3, slides.length))));
  const [held, setHeld] = useState(false);
  const [away, setAway] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const count = slides.length;
  const idx = count ? i % count : 0;

  // Off screen or in a background tab: stop, so nothing loads unseen.
  useEffect(() => {
    const el = rootRef.current;
    let visible = true;
    const sync = () => setAway(!visible || document.hidden);
    const io = el && 'IntersectionObserver' in window
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.35 })
      : null;
    if (el && io) io.observe(el);
    document.addEventListener('visibilitychange', sync);
    return () => { io?.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);

  const running = count > 1 && !held && !away && !reduce;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setI((x) => (x + 1) % count), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [running, idx, count]);

  if (!count) return <div className="h-[85vh] bg-zinc-950 skeleton"></div>;

  const item = slides[idx];
  const title = item.title || item.name;
  const type = item.media_type || 'movie';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const genres = (item.genre_ids || []).map((g) => genreName?.(g)).filter(Boolean).slice(0, 2) as string[];
  const saved = inList?.(item.id) ?? false;
  const rank = items.indexOf(item) + 1;

  return (
    <div
      ref={rootRef}
      className="lux-stage relative h-[85vh] min-h-[520px] w-full overflow-hidden bg-zinc-950"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld(false); }}
    >
      {/* Artwork: the current slide on top, the neighbours loaded underneath so
          the cross-fade never waits on the network. */}
      <div className="absolute inset-0">
        {slides.map((s, n) => {
          const near = n === idx || n === (idx + 1) % count || n === (idx - 1 + count) % count;
          return (
            <img
              key={s.id}
              src={near ? getImageUrl(s.backdrop_path, 'original') : undefined}
              alt={n === idx ? (s.title || s.name) : ''}
              aria-hidden={n !== idx}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1400ms] ease-out ${n === idx ? 'opacity-100 kenburns' : 'opacity-0'}`}
            />
          );
        })}

        {/* Light from the theme, rising from the lower left behind the type. */}
        <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: 'radial-gradient(70% 60% at 12% 100%, rgb(var(--acc-rgb) / .22), transparent 70%)' }} />
        {/* Cinematic scrims: side, deep bottom, and a foot that melts into the
            page colour, so the art ends softly on light themes too. */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/45 to-transparent z-10 hidden md:block"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent z-10"></div>
        <div className="absolute inset-x-0 bottom-0 h-40 z-10" style={{ background: 'linear-gradient(to top, var(--page-ground), transparent)' }}></div>
      </div>

      <div className="tv-hero-body absolute bottom-0 left-0 w-full px-4 md:px-12 pb-24 md:pb-28 pt-32 z-20">
        <div className="flex flex-col 2xl:flex-row 2xl:items-end 2xl:justify-between gap-6 2xl:gap-8">
          <div key={item.id} className="max-w-2xl lux-enter">
            <p className="lux-kicker mb-3">
              {rank > 0 ? `No. ${rank} today` : 'Featured'} · {type === 'movie' ? 'Film' : 'Series'}
            </p>

            <h1 className="tv-hero-title lux-title mb-4 drop-shadow-2xl text-4xl md:text-6xl lg:text-7xl pb-1">
              {title}
            </h1>

            <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-5 text-sm font-semibold text-zinc-200">
              {item.vote_average ? (
                <span className="inline-flex items-center gap-1.5 text-amber-300 tabular">
                  <Star className="w-4 h-4 fill-current" /> {item.vote_average.toFixed(1)}
                </span>
              ) : null}
              {year && <span className="tabular">{year}</span>}
              {genres.map((g) => <span key={g} className="flex items-center gap-3"><span className="w-1 h-1 rounded-full bg-zinc-500" />{g}</span>)}
              <span className="px-2 py-0.5 rounded-md text-[11px] uppercase tracking-wider border border-white/25 text-zinc-200">
                {type === 'movie' ? 'Film' : 'Series'}
              </span>
            </div>

            <p className="tv-hero-desc text-zinc-300 text-base md:text-lg mb-8 line-clamp-3 max-w-xl drop-shadow-lg leading-relaxed">
              {item.overview}
            </p>

            {/* On a phone, Trailer opens the details too, so the info button steps aside. */}
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <button onClick={() => { haptics.press(); onPlay(item.id, type, false); }} className="lux-btn px-6 md:px-9 py-3 text-base md:text-lg">
                <Play className="w-6 h-6 fill-current" />
                {t('Play')}
              </button>
              <button
                onClick={() => onPlay(item.id, type, true, true)}
                className="btn-glass flex items-center justify-center gap-2 px-5 md:px-8 py-3 rounded-full font-bold text-base md:text-lg"
              >
                <Film className="w-5 h-5" />
                {t('Trailer')}
              </button>
              {onToggleList && (
                <button
                  onClick={() => { haptics.tap(); onToggleList(item); }}
                  aria-pressed={saved}
                  className={`btn-glass w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${saved ? 'text-amber-300' : ''}`}
                  title={saved ? 'In My List' : 'Add to My List'} aria-label={saved ? 'Remove from My List' : 'Add to My List'}
                >
                  {saved ? <Check className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                </button>
              )}
              <button
                onClick={() => onPlay(item.id, type, true)}
                className="btn-glass w-12 h-12 rounded-full hidden sm:flex items-center justify-center shrink-0"
                title="More Info" aria-label="More info"
              >
                <Info className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* The rest of today's five. Thumbnails on a wide screen, slim
              bars elsewhere; the current one fills with the time left. */}
          {count > 1 && (
            <div className="flex gap-2 2xl:gap-3 w-full max-w-[240px] 2xl:max-w-none 2xl:w-auto" role="tablist" aria-label="Featured titles">
              {slides.map((s, n) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={n === idx}
                  aria-label={`Show ${s.title || s.name}`}
                  data-tv-focusable
                  onClick={() => { haptics.tap(); setI(n); }}
                  className={`lux-slide group relative flex-1 2xl:flex-none 2xl:w-[124px] py-2 2xl:py-0 focus:outline-none ${n === idx ? 'is-on' : ''}`}
                >
                  <span className="hidden 2xl:block relative aspect-video rounded-lg overflow-hidden ring-1 ring-white/15 transition-all duration-300 group-hover:ring-white/40 group-[.is-on]:ring-2 group-[.is-on]:ring-amber-400 group-focus-visible:ring-2 group-focus-visible:ring-amber-400">
                    <img src={getImageUrl(s.backdrop_path, 'w300')} alt="" loading="lazy" className={`w-full h-full object-cover transition-opacity ${n === idx ? 'opacity-100' : 'opacity-60 group-hover:opacity-90'}`} />
                  </span>
                  <span className="block mt-2 h-[3px] rounded-full bg-white/20 overflow-hidden">
                    <span
                      key={n === idx ? `on-${idx}-${running}` : 'off'}
                      className={`block h-full origin-left rounded-full ${n === idx ? (running ? 'lux-slide-fill' : 'bg-amber-400') : 'scale-x-0'}`}
                      style={n === idx && running ? { animationDuration: `${SLIDE_MS}ms` } : undefined}
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
