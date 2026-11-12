import { useEffect, useRef, useState } from 'react';
import { canFrameKick } from '../services/nativeTap';
import { readFrameOptions, type ChoiceLists, type PlayerChoices } from '../services/playerChoices';

/**
 * The quality, sound and subtitles a server's own player offers. Android apps only: the
 * website has no way into another site's frame, and there the server's own
 * buttons are in reach of a mouse or a finger anyway.
 *
 * `key` changes when the stream does.
 */
export function useFrameChoices(getFrame: () => HTMLIFrameElement | null | undefined, key: string | null): PlayerChoices | null {
  const [lists, setLists] = useState<ChoiceLists | null>(null);
  const frameRef = useRef(getFrame);
  frameRef.current = getFrame;

  useEffect(() => {
    setLists(null);
    if (!key || !canFrameKick()) return;
    const onMessage = (e: MessageEvent) => {
      const frame = frameRef.current();
      const d = e.data as { sahrae?: unknown; o?: unknown } | null;
      if (!frame || e.source !== frame.contentWindow || !d || typeof d !== 'object' || d.sahrae !== 'frame-options') return;
      const next = readFrameOptions(d.o);
      if (next) setLists(next);
    };
    window.addEventListener('message', onMessage);
    // The player may have reported before this stream's listener was here.
    const ask = window.setTimeout(() => frameRef.current()?.contentWindow?.postMessage({ sahrae: 'options?' }, '*'), 1500);
    return () => { window.removeEventListener('message', onMessage); window.clearTimeout(ask); };
  }, [key]);

  if (!lists) return null;
  const send = (sahrae: string, id: number) => {
    try { frameRef.current()?.contentWindow?.postMessage({ sahrae, id }, '*'); } catch { /* the frame has gone */ }
  };
  return {
    ...lists,
    pickQuality: (id) => { setLists((l) => (l ? { ...l, qualityOn: id } : l)); send('set-quality', id); },
    pickAudio: (id) => { setLists((l) => (l ? { ...l, audioOn: id } : l)); send('set-audio', id); },
    pickSubs: (id) => { setLists((l) => (l ? { ...l, subsOn: id } : l)); send('set-subs', id); },
  };
}
