import { useEffect, useRef } from 'react';
import { useMusic } from '../hooks/useMusic';
import { savePodcastProgress } from '../services/podcasts';

/**
 * Invisible, always-mounted. While a PODCAST plays (queueSource === 'Podcasts'),
 * persist its position — throttled to once per 10s of playback, plus a guaranteed
 * flush on pause, tab-hide and before-unload. Reads context only (no playback
 * logic). useMusic positions are seconds → stored as ms.
 */
export default function PodcastProgressTracker() {
  const { current, position, duration, queueSource, isPlaying } = useMusic();
  const last = useRef(0);
  const live = useRef({ current, position, duration, queueSource });
  live.current = { current, position, duration, queueSource };

  const flush = () => {
    const c = live.current;
    if (c.current && c.queueSource === 'Podcasts' && c.position > 2) {
      savePodcastProgress(c.current, Math.round(c.position * 1000), Math.round(c.duration * 1000));
    }
  };

  // Throttled tick (every ~10s of playback).
  useEffect(() => {
    if (!current || queueSource !== 'Podcasts' || position <= 2) return;
    const now = Date.now();
    if (now - last.current >= 10_000) { last.current = now; flush(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, current, duration, queueSource]);

  // Flush on pause.
  useEffect(() => { if (!isPlaying) flush(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isPlaying]);

  // Flush on tab-hide / unload / unmount.
  useEffect(() => {
    const onVis = () => { if (document.hidden) flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', flush);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('beforeunload', flush); flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
