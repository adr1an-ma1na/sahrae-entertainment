import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { getImageUrl, knownTitleLogo } from '../services/tmdb';
import { SCREEN_GENRES } from '../services/tasteProfileCore';
import { PREVIEW_CLASS, TV_FOCUSED, previewOf, type PreviewItem } from '../tv/focusPreview';

/**
 * The top of the screen on a TV: a large picture, the title and what it is
 * about, for whichever poster the remote is on (owner, 2026-11-15: "the way
 * you can see pictures, the same way Netflix is"). Rows used to be small
 * posters and a ring; what a title was could only be read by opening it.
 *
 * Cheap by design, for a TV's processor:
 *   - it waits a moment after the remote stops, so running along a row does
 *     not fetch a picture per poster;
 *   - the picture is decoded before it is shown, then two layers cross-fade
 *     (opacity only, which the TV's GPU does without redrawing anything);
 *   - no blur, no animation while nothing changes.
 */
const SETTLE_MS = 220;

export default function TvFocusPreview() {
  const [shown, setShown] = useState<PreviewItem | null>(null);
  const [visible, setVisible] = useState(false);
  // Two picture layers: the new one fades in over the old.
  const [layers, setLayers] = useState<[string, string]>(['', '']);
  const [top, setTop] = useState(0);
  const topRef = useRef(0);
  const want = useRef<PreviewItem | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    document.documentElement.classList.add(PREVIEW_CLASS);
    const show = (p: PreviewItem) => {
      const path = p.item.backdrop_path || p.item.poster_path;
      const done = (src: string) => {
        if (want.current !== p) return; // The remote has moved on.
        setShown(p);
        setVisible(true);
        if (src) {
          const next = topRef.current ? 0 : 1;
          setLayers((l) => (next === 0 ? [src, l[1]] : [l[0], src]));
          topRef.current = next;
          setTop(next);
        }
      };
      if (!path) { done(''); return; }
      const src = getImageUrl(path, 'w1280');
      const img = new Image();
      img.onload = () => { const d = img.decode ? img.decode().catch(() => {}) : Promise.resolve(); void d.then(() => done(src)); };
      img.onerror = () => done('');
      img.src = src;
    };
    const onFocus = (e: Event) => {
      const el = (e as CustomEvent).detail as Element | null;
      const p = previewOf(el);
      window.clearTimeout(timer.current);
      want.current = p || null;
      if (!p) { setVisible(false); return; }
      timer.current = window.setTimeout(() => show(p), SETTLE_MS);
    };
    window.addEventListener(TV_FOCUSED, onFocus);
    return () => {
      window.removeEventListener(TV_FOCUSED, onFocus);
      window.clearTimeout(timer.current);
      document.documentElement.classList.remove(PREVIEW_CLASS);
    };
  }, []);

  const it = shown?.item;
  const title = it ? it.title || it.name || '' : '';
  const logo = it && shown ? knownTitleLogo(it.id, shown.type) : undefined;
  const year = it ? (it.release_date || it.first_air_date || '').slice(0, 4) : '';
  const genres = it ? (it.genre_ids || []).map((g) => SCREEN_GENRES[g]).filter(Boolean).slice(0, 3) : [];

  return (
    <div aria-hidden="true" className={`tv-preview-panel ${visible ? 'is-on' : ''}`}>
      {layers.map((src, i) => (
        <div key={i} className="tv-preview-art" style={{ opacity: src && top === i ? 1 : 0, backgroundImage: src ? `url("${src}")` : undefined }} />
      ))}
      <div className="tv-preview-shade" />
      {it && (
        <div className="tv-preview-text">
          {logo
            ? <img src={logo} alt={title} className="tv-preview-logo" />
            : <h2 className="tv-preview-title font-display">{title}</h2>}
          <p className="tv-preview-meta">
            {it.vote_average ? <span className="tv-preview-score"><Star className="w-[0.9em] h-[0.9em] fill-current" />{it.vote_average.toFixed(1)}</span> : null}
            {year && <span>{year}</span>}
            <span>{shown?.type === 'tv' ? 'Series' : 'Film'}</span>
            {genres.length > 0 && <span>{genres.join(' · ')}</span>}
          </p>
          {it.overview && <p className="tv-preview-overview">{it.overview}</p>}
        </div>
      )}
    </div>
  );
}
