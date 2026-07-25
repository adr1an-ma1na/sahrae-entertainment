import { useEffect } from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    // Splash screen lasts 1 second
    const timer = setTimeout(() => {
      onComplete();
    }, 1000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(5px)", pointerEvents: "none" }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <div className="relative flex flex-col items-center">
        <motion.div
           initial={{ scale: 0.9, opacity: 0, y: 10 }}
           animate={{ scale: 1, opacity: 1, y: 0 }}
           transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
           className="text-4xl md:text-7xl font-black text-amber-500 tracking-tighter flex flex-col md:flex-row items-center md:gap-4 select-none"
        >
          <motion.span
            initial={{ opacity: 0, x: -10, filter: "blur(5px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          >
            SAHRAE
          </motion.span>
          <motion.span
            initial={{ opacity: 0, x: 10, filter: "blur(5px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
            className="text-white font-light text-2xl md:text-5xl tracking-normal mt-1 md:mt-2"
          >
            ENTERTAINMENT
          </motion.span>
        </motion.div>
        
        {/* Cinematic shine effect passing over the text */}
        <motion.div 
          className="absolute inset-x-0 h-10 w-40 bg-gradient-to-r from-transparent via-amber-200/50 to-transparent top-1/2 -mt-5 md:-mt-2 mix-blend-overlay rotate-[25deg]"
          initial={{ x: "-300%", opacity: 0 }}
          animate={{ x: "300%", opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.6, delay: 0.4, ease: "easeInOut" }}
        />
        
        {/* Subtle subtle pulse light behind the logo */}
        <motion.div 
          className="absolute inset-0 bg-amber-500/10 blur-3xl -z-10 rounded-[100%]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.5, 0], scale: [0.8, 1.2, 1.5] }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}
