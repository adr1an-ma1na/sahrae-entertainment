import { AnimatePresence, motion } from 'motion/react';

/**
 * DynamicBackground: a smooth gradient from `color` down to true black. When the
 * colour prop changes it cross-fades over 600ms (a new gradient layer fades in
 * while the previous fades out). Used on album/artist pages and Now Playing.
 */
export function DynamicBackground({ color, className = '' }: { color?: string; className?: string }) {
  const c = color || '#181818';
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden>
      <AnimatePresence>
        <motion.div
          key={c}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ background: `linear-gradient(180deg, ${c} 0%, rgba(0,0,0,0.55) 55%, #000 100%)` }}
        />
      </AnimatePresence>
    </div>
  );
}
