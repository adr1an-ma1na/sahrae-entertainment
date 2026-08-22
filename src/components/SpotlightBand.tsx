import { useEffect, useState } from 'react';
import { Play, Info } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';
import { posterColor, cachedPosterColor } from '../services/posterColor';
import { haptics } from '../services/haptics';

/**
 * A full-bleed single-title band, used to break up the run of poster rails.
 *
 * Home was nine near-identical rails stacked vertically — nothing for the eye to
 * anchor on, so it read as one long wall. Dropping a cinematic band partway down
 * gives the page a cadence: rails, a moment of scale, rails again.
 *
 * Takes its wash from the artwork (see services/posterColor), so it belongs to
 * the title rather than being generic chrome.
 */
export default function SpotlightBand({
  item,
  onPlay,
  eyebrow = 'Tonight’s pick',
}: {
  item: MediaItem;
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
  eyebrow?: string;
}) {
  const art = item.backdrop_path || item.poster_path;
  const posterUrl = getImageUrl(item.poster_path || art, 'w185');
  const [tint, setTint] = useState<string | null>(() => cachedPosterColor(posterUrl));

  useEffect(() => {
    let alive = true;
    posterColor(posterUrl).then((c) => { if (alive) setTint(c); });
    return () => { alive = false; };
  }, [posterUrl]);

  const type = (item.media_type as 'movie' | 'tv') || 'movie';
  const title = item.title || item.name || '';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);

  return (
    <section className="relative my-10 overflow-hidden">
      <div className="relative mx-4 md:mx-12 rounded-3xl overflow-hidden border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
        <div className="relative h-[240px] md:h-[340px]">
          {art && (
            <img
              src={getImageUrl(art, 'w780')}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {/* Colour wash from the artwork, then a readability scrim. Order
              matters: the wash sits under the scrim so text keeps its contrast
              no matter how light the poster is. */}
          {tint && (
            <div
              className="absolute inset-0 transition-opacity duration-700"
              style={{ background: `linear-gradient(90deg, ${tint} 0%, transparent 85%)`, opacity: 0.92 }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end gap-3 p-6 md:p-10 max-w-xl">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400">{eyebrow}</span>
            <h3 className="text-2xl md:text-4xl font-display font-extrabold text-white leading-tight tracking-tight drop-shadow-lg">
              {title}
            </h3>
            <div className="flex items-center gap-2 text-xs text-zinc-300 font-semibold">
              {typeof item.vote_average === 'number' && item.vote_average > 0 && (
                <span className="text-emerald-400">{Math.round(item.vote_average * 10)}% match</span>
              )}
              {year && <span>{year}</span>}
              <span className="px-1.5 border border-white/25 rounded text-[10px] uppercase">{type === 'tv' ? 'Series' : 'Film'}</span>
            </div>
            {item.overview && (
              <p className="hidden md:block text-sm text-zinc-200/90 line-clamp-2 max-w-lg">{item.overview}</p>
            )}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => { haptics.press(); onPlay(item.id, type, false); }}
                data-tv-focusable tabIndex={0}
                className="px-5 py-2.5 rounded-xl bg-white text-black font-bold text-sm flex items-center gap-2 hover:bg-white/85 transition-colors active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" /> Play
              </button>
              <button
                onClick={() => { haptics.tap(); onPlay(item.id, type, true); }}
                data-tv-focusable tabIndex={0}
                className="px-5 py-2.5 rounded-xl bg-white/10 text-white font-bold text-sm flex items-center gap-2 border border-white/20 hover:bg-white/20 transition-colors active:scale-95 backdrop-blur"
              >
                <Info className="w-4 h-4" /> Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
