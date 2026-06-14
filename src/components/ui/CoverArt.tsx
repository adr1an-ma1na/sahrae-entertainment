import { useState, useEffect } from 'react';

type Size = 'sm' | 'md' | 'lg' | 'hero';

/**
 * CoverArt: paints the track/album's dominant colour immediately, then fades the
 * artwork in once it decodes — so a shelf never flashes empty grey, and the
 * now-playing never lingers on the PREVIOUS track's art.
 *
 * `imageUrl` is the best-quality source; if it 404s (e.g. an HD variant that the
 * CDN doesn't have) we transparently fall back to `fallbackUrl`. The image is
 * rendered at its natural resolution with object-cover — no fixed pixel size —
 * so a high-res source is never pre-downscaled then upscaled.
 */
export function CoverArt({
  imageUrl,
  fallbackUrl,
  dominantColor,
  alt = '',
  rounded = 'rounded-lg',
  className = '',
}: {
  imageUrl?: string;
  fallbackUrl?: string;
  dominantColor?: string;
  alt?: string;
  size?: Size;
  rounded?: string;
  className?: string;
}) {
  const [src, setSrc] = useState(imageUrl);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setSrc(imageUrl); setLoaded(false); }, [imageUrl]);

  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{ backgroundColor: dominantColor || '#282828' }}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            // HD variant missing → drop to the reliable thumbnail once.
            if (fallbackUrl && src !== fallbackUrl) { setSrc(fallbackUrl); setLoaded(false); }
            else setLoaded(false);
          }}
          className="w-full h-full object-cover transition-opacity duration-200 ease-out"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      ) : null}
    </div>
  );
}
