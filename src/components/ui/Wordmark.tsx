import { useId } from 'react';
import { WORDMARK_H, WORDMARK_PATH, WORDMARK_W } from '../../brand/wordmark';

/**
 * The SAHRAE wordmark (brand/wordmark.ts): the same outlines as the app icon
 * and the intro, in brand gold. Size it with a height class (h-6, h-8...);
 * the width follows. Decorative: carries the name for screen readers.
 */
export default function Wordmark({ className = 'h-6' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox={`0 0 ${WORDMARK_W} ${WORDMARK_H}`} className={`wordmark w-auto ${className}`} role="img" aria-label="Sahrae">
      <defs>
        <linearGradient id={`wm-${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={WORDMARK_H}>
          <stop offset="0" stopColor="#fff7e2" /><stop offset="0.5" stopColor="#f3cd7c" /><stop offset="1" stopColor="#c58d34" />
        </linearGradient>
      </defs>
      <path d={WORDMARK_PATH} fill={`url(#wm-${id})`} />
    </svg>
  );
}
