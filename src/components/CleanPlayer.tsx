import { useEffect, useRef, useState } from 'react';
import type HlsT from 'hls.js';
import { Loader2, Subtitles, Languages } from 'lucide-react';
import { useHls } from '../services/hlsLoader';
import { pickLevel, heightLabel } from '../services/cleanStream';

/**
 * Sahrae's own film and episode player, used in the Android app (phone,
 * laptop APK and TV). The server's page has run out of sight and handed over
 * its stream (see /__filmstream in MainActivity); this plays it through the
 * app's stream relay, so none of the provider's adverts are on screen, and it
 * opens on the sharpest rendition the stream has rather than the provider's
 * 480p start.
 *
 * It reports what a provider's player would have: that it is playing (proof
 * the server works), its clock, and the end of an episode.
 */
export interface CleanPlayerProps {
  src: string;
  /** Data Saver: 480p at most. */
  saver: boolean;
  startAt?: number;
  onPlaying: () => void;
  onProgress: (t: number, d: number) => void;
  onEnded: () => void;
  /** Why it gave up, in a few words. */
  onFail: (why: string) => void;
}

export default function CleanPlayer({ src, saver, startAt = 0, onPlaying, onProgress, onEnded, onFail }: CleanPlayerProps) {
  const Hls = useHls();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsT | null>(null);
  const [height, setHeight] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [subs, setSubs] = useState<{ id: number; name: string }[]>([]);
  const [sub, setSub] = useState(-1);
  const [audio, setAudio] = useState<{ id: number; name: string }[]>([]);
  const [aud, setAud] = useState(0);
  const cb = useRef({ onPlaying, onProgress, onEnded, onFail });
  cb.current = { onPlaying, onProgress, onEnded, onFail };

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !Hls) return;
    let failed = false;
    const fail = (why: string) => { if (!failed) { failed = true; cb.current.onFail(why); } };
    if (!Hls.isSupported()) { fail('this device cannot play HLS'); return; }
    const hls = new Hls({
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      backBufferLength: 30,
      // Open on the sharpest rendition and stay there while the line allows,
      // instead of climbing up from the bottom.
      startLevel: -1,
      capLevelToPlayerSize: false,
      abrEwmaDefaultEstimate: 8_000_000,
      abrBandWidthUpFactor: 0.9,
      fragLoadingMaxRetry: 6,
      manifestLoadingMaxRetry: 3,
    });
    hlsRef.current = hls;
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const lvl = pickLevel(hls.levels.map((l) => ({ height: l.height, bitrate: l.bitrate })), saver);
      if (lvl >= 0) {
        hls.startLevel = lvl;
        // Data Saver holds the ceiling; otherwise the player may still step
        // down on a slow line rather than stall.
        if (saver) hls.autoLevelCapping = lvl;
      }
      setSubs(hls.subtitleTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Subtitles ${i + 1}` })));
      setAudio(hls.audioTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Audio ${i + 1}` })));
      hls.subtitleTrack = -1;
      if (startAt > 5) v.currentTime = startAt;
      v.play().catch(() => { /* waits for a tap */ });
    });
    let networkRetries = 0;
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      // No playlist at all: nothing to retry, back to the provider's player now.
      if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT || data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) { fail(`the stream list would not load (${data.details}${data.response?.code ? ' ' + data.response.code : ''})`); return; }
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 2) { networkRetries++; hls.startLoad(); return; }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
      fail(`the stream stopped (${data.details})`);
    });
    hls.loadSource(src);
    hls.attachMedia(v);
    // Nothing to show after 25 s: hand back to the provider's player.
    const noStart = setTimeout(() => { if (!v.currentTime) fail('no picture after 25 s'); }, 25000);
    return () => { clearTimeout(noStart); hls.destroy(); hlsRef.current = null; };
  }, [Hls, src, saver, startAt]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let told = false;
    let last = 0;
    const onTime = () => {
      if (!told && v.currentTime > 0.5) { told = true; cb.current.onPlaying(); }
      const now = Date.now();
      if (now - last > 4000) { last = now; cb.current.onProgress(v.currentTime, v.duration || 0); }
    };
    const onRes = () => setHeight(v.videoHeight);
    const onWait = () => setWaiting(true);
    const onPlay = () => setWaiting(false);
    const onEnd = () => cb.current.onEnded();
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('resize', onRes);
    v.addEventListener('loadedmetadata', onRes);
    v.addEventListener('waiting', onWait);
    v.addEventListener('playing', onPlay);
    v.addEventListener('ended', onEnd);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('resize', onRes);
      v.removeEventListener('loadedmetadata', onRes);
      v.removeEventListener('waiting', onWait);
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('ended', onEnd);
    };
  }, []);

  // A TV remote: OK plays or pauses, left and right skip 10 s. Up and down
  // still move between the buttons (data-tv-seek tells the TV navigation).
  const onKey = (e: React.KeyboardEvent) => {
    const v = videoRef.current;
    if (!v) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'MediaPlayPause') { e.preventDefault(); v.paused ? v.play().catch(() => {}) : v.pause(); }
    else if (e.key === 'ArrowRight' || e.key === 'MediaFastForward') { e.preventDefault(); v.currentTime = Math.min((v.duration || 1e9) - 1, v.currentTime + 10); }
    else if (e.key === 'ArrowLeft' || e.key === 'MediaRewind') { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); }
  };

  const cycleSub = () => {
    const h = hlsRef.current; if (!h) return;
    const next = sub + 1 >= subs.length ? -1 : sub + 1;
    h.subtitleTrack = next; h.subtitleDisplay = next >= 0; setSub(next);
  };
  const cycleAudio = () => {
    const h = hlsRef.current; if (!h || audio.length < 2) return;
    const next = (aud + 1) % audio.length; h.audioTrack = next; setAud(next);
  };

  return (
    <div className="absolute inset-0 bg-black" tabIndex={0} data-tv-focusable data-tv-seek onKeyDown={onKey}>
      <video ref={videoRef} className="w-full h-full bg-black" controls playsInline autoPlay crossOrigin="anonymous" />
      {waiting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
        </div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {height > 0 && (
          // What is actually on screen, read from the picture itself.
          <span className="pointer-events-none text-[11px] font-bold px-2 py-0.5 rounded bg-black/60 text-white border border-white/15">{heightLabel(height)}</span>
        )}
        {audio.length > 1 && (
          <button onClick={cycleAudio} aria-label="Change audio language" className="h-7 px-2 rounded bg-black/60 text-white text-[11px] font-bold flex items-center gap-1 border border-white/15">
            <Languages className="w-3.5 h-3.5" />{audio[aud]?.name}
          </button>
        )}
        {subs.length > 0 && (
          <button onClick={cycleSub} aria-label="Subtitles" className={`h-7 px-2 rounded text-[11px] font-bold flex items-center gap-1 border border-white/15 ${sub >= 0 ? 'bg-amber-500 text-amber-950' : 'bg-black/60 text-white'}`}>
            <Subtitles className="w-3.5 h-3.5" />{sub >= 0 ? subs[sub]?.name : 'Off'}
          </button>
        )}
      </div>
    </div>
  );
}
