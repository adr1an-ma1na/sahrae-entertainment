import { useEffect } from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  onComplete: () => void;
}

const LETTERS = 'SAHRAE'.split('');

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    // Cinematic intro runs ~2.6s, then hands off to the app (exit handled by
    // AnimatePresence in App.tsx).
    const timer = setTimeout(onComplete, 2600);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08, filter: 'blur(8px)', pointerEvents: 'none' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Ambient sunset glow that blooms then settles */}
      <motion.div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 50% 55%, rgba(245,158,11,0.22), rgba(124,45,18,0.10) 35%, rgba(0,0,0,0) 70%)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0.7], scale: [0.6, 1.15, 1] }}
        transition={{ duration: 2.2, ease: 'easeOut' }}
      />

      {/* Deep "ta-dum" pulse ring */}
      <motion.div
        className="absolute rounded-full border border-amber-400/30"
        style={{ width: 280, height: 280 }}
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0.5, 0], scale: [0.2, 2.4, 3] }}
        transition={{ duration: 1.6, delay: 0.5, ease: 'easeOut' }}
      />

      <div className="relative flex flex-col items-center px-6">
        {/* SAHRAE — letters assemble in, then a gold shimmer sweeps across */}
        <div className="relative">
          <div className="flex items-center justify-center">
            {LETTERS.map((ch, i) => (
              <motion.span
                key={i}
                className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter bg-gradient-to-b from-amber-100 via-amber-400 to-amber-600 bg-clip-text text-transparent select-none"
                style={{ textShadow: '0 0 40px rgba(245,158,11,0.25)' }}
                initial={{ opacity: 0, y: 28, scale: 1.6, filter: 'blur(12px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                transition={{
                  duration: 0.7,
                  delay: 0.15 + i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {ch}
              </motion.span>
            ))}
          </div>

          {/* Shimmer sweep clipped to the wordmark area */}
          <motion.div
            className="pointer-events-none absolute inset-y-0 w-1/3 mix-blend-overlay"
            style={{
              background:
                'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)',
            }}
            initial={{ x: '-160%', opacity: 0 }}
            animate={{ x: '360%', opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.0, delay: 0.85, ease: 'easeInOut' }}
          />
        </div>

        {/* ENTERTAINMENT — tracks open and fades in beneath */}
        <motion.div
          className="mt-3 md:mt-5 text-sm sm:text-base md:text-2xl font-light text-zinc-200 select-none"
          initial={{ opacity: 0, letterSpacing: '0.05em', y: 8 }}
          animate={{ opacity: 1, letterSpacing: '0.62em', y: 0 }}
          transition={{ duration: 0.9, delay: 0.95, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* extra right padding compensates for the trailing letter-spacing */}
          <span className="pl-[0.62em]">ENTERTAINMENT</span>
        </motion.div>

        {/* Thin gold underline that draws out from the centre */}
        <motion.div
          className="mt-5 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '80%', opacity: [0, 1, 0.8] }}
          transition={{ duration: 1.0, delay: 1.2, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  );
}
