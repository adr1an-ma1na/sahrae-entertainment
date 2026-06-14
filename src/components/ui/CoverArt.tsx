import { useState, useEffect } from 'react';

type Size = 'sm' | 'md' | 'lg' | 'hero';

/**
 * CoverArt: paints the track/album's dominant colour immediately, then fades the
 * artwork in over 200ms once it loads — so a shelf never flashes empty grey.
 *
 * (In the Next.js spec this used Next/Image with a variant-URL loader; on our
 * Vite/Capacitor stack we use a plain <img> with lazy loading. The `size` prop
 * is kept as the contract for when variant URLs are wired in.)
 */
export function CoverArt({
  imageUrl,
  dominantColor,
  alt = '',
  rounded = 'rounded-lg',
  className = '',
}: {
  imageUrl?: string;
  dominantColor?: string;
  alt?: string;
  size?: Size;
  rounded?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  // Re-fade whenever the source changes so a card/now-playing never shows the
  // PREVIOUS track's art (the "stale art" bug): reset to the dominant colour,
  // then fade the new image in once it has actually decoded.
  useEffect(() => { setLoaded(false); }, [imageUrl]);
  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{ backgroundColor: dominantColor || '#282828' }}
    >
      {imageUrl ? (
        <img
          key={imageUrl}
          src={imageUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
          className="w-full h-full object-cover transition-opacity duration-200 ease-out"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      ) : null}
    </div>
  );
}
