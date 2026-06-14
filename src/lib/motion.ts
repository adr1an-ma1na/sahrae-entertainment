import type { Transition, Variants } from 'motion/react';

/**
 * Sauti motion system. Every animation in the music experience references these
 * named presets — never inline durations/easings.
 */
export const motionTokens = {
  tick: { duration: 0.1, ease: 'easeOut' } as Transition,                         // instant acknowledgements
  settle: { type: 'spring', stiffness: 300, damping: 30 } as Transition,          // things landing in place
  lift: { duration: 0.2, ease: 'easeOut' } as Transition,                         // hover/press y+scale
  reveal: { duration: 0.32, ease: 'easeOut' } as Transition,                      // content entrance
};

/** Entrance for a single element (opacity + slight rise). */
export const revealUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: motionTokens.reveal },
};

/** Container that staggers its children's `reveal` entrances. */
export const staggerContainer = (stagger = 0.05, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** Press/hover feedback for tappable cards. */
export const pressable = {
  whileHover: { y: -4, scale: 1.02, transition: motionTokens.lift },
  whileTap: { scale: 0.97, transition: motionTokens.tick },
};
