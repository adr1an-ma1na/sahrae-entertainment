import { useEffect, useRef } from 'react';
import { useMusic } from '../hooks/useMusic';
import { savePodcastProgress } from '../services/podcasts';

/**
 * Invisible, always-mounted: while a PODCAST is playing through the music engine
 * (queueSource === 'Podcasts'), persist its position every few seconds so the
 * podcast home can offer "Continue listening". Reads context only — no playback
 * logic, so it can't affect the player.
 */
export default function PodcastProgressTracker() {
  const { current, position, duration, queueSource } = useMusic();
  const lastSave = useRef(0);
  useEffect(() => {
    if (!current || queueSource !== 'Podcasts' || position <= 5) return;
    const now = Date.now();
    if (now - lastSave.current < 4000) return;
    lastSave.current = now;
    savePodcastProgress(current, position, duration);
  }, [position, current, duration, queueSource]);
  return null;
}
