import { useEffect, useRef, useState } from 'react';
import type HlsT from 'hls.js';
import { Loader2, Maximize, Minimize } from 'lucide-react';
import { useHls } from '../services/hlsLoader';
import { pictureRule, heightLabel, type PictureSetting } from '../services/cleanStream';
import { isTvBuild } from '../tv/tvViewport';
import { qualityList, audioList, subsList, type PlayerChoices } from '../services/playerChoices';

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
  /** The Picture setting: Best adapts down a rung at a time to its floor (cleanStream.ladderFloor), HD keeps 720p or better, Data Saver caps at 480p. */
  picture: PictureSetting;
  startAt?: number;
  onPlaying: () => void;
  onProgress: (t: number, d: number) => void;
  onEnded: () => void;
  /** Why it gave up, in a few words. */
  onFail: (why: string) => void;
  /** The quality, sound and subtitles this stream offers (shown in the player's Audio & Subtitles panel). */
  onChoices?: (c: PlayerChoices | null) => void;
  /** The clock, about twice a second (Skip Intro). */
  onClock?: (t: number, d: number) => void;
  /** Set to a function that moves the picture to a second. */
  seekRef?: { current: ((t: number) => void) | null };
  /**
   * Sahrae's full screen (the whole player, Skip Intro included). The browser's
   * own button put just the <video> on the screen, and nothing of Sahrae's can
   * draw over that: Skip Intro vanished in full screen (owner, 2026-11-13).
   */
  onFullscreen?: () => void;
  isFull?: boolean;
  /** Volume boost, 1 (normal) to 3 (owner, 2026-11-20: "volume boost like CinemaOS"). */
  boost?: number;
  /** Whether the boost could be applied (the sound engine may refuse until a tap). */
  onBoost?: (ok: boolean) => void;
}

export default function CleanPlayer({ src, picture, startAt = 0, onPlaying, onProgress, onEnded, onFail, onChoices, onClock, seekRef, onFullscreen, isFull, boost = 1, onBoost }: CleanPlayerProps) {
  const Hls = useHls();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsT | null>(null);
  const [height, setHeight] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [subs, setSubs] = useState<{ id: number; name: string }[]>([]);
  const [sub, setSub] = useState(-1);
  const [audio, setAudio] = useState<{ id: number; name: string }[]>([]);
  const [aud, setAud] = useState(0);
  const [levels, setLevels] = useState<{ id: number; label: string; height: number }[]>([]);
  const [pinned, setPinned] = useState(-1);
  const capRef = useRef(-1);
  // A word when the picture steps down for a weak line, and when it is back up,
  // so a softer picture reads as the player keeping the film going, not a fault.
  const [note, setNote] = useState<string | null>(null);
  const shownRef = useRef(0);
  const noteTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);
  // Volume boost: the film through a gain and a limiter (so loud scenes do not crack), set up
  // the first time it is asked for. The stream plays from memory (hls.js), so Web Audio may
  // shape it; nothing is routed until the sound engine runs, or the film would go silent.
  const boostRef = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);
  const onBoostRef = useRef(onBoost);
  onBoostRef.current = onBoost;
  useEffect(() => {
    const v = videoRef.current;
    const g = Math.max(1, Math.min(3, boost || 1));
    const b = boostRef.current;
    if (b) { try { b.gain.gain.setTargetAtTime(g, b.ctx.currentTime, 0.05); } catch { /* closed */ } onBoostRef.current?.(true); return; }
    if (!v || g <= 1) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) { onBoostRef.current?.(false); return; }
    let ctx: AudioContext;
    try { ctx = new AC(); } catch { onBoostRef.current?.(false); return; }
    const route = () => {
      if (ctx.state !== 'running' || boostRef.current) { if (!boostRef.current) onBoostRef.current?.(false); return; }
      try {
        const source = ctx.createMediaElementSource(v), gain = ctx.createGain(), lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -3; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.15;
        gain.gain.value = g;
        source.connect(gain); gain.connect(lim); lim.connect(ctx.destination);
        boostRef.current = { ctx, gain };
        onBoostRef.current?.(true);
      } catch { onBoostRef.current?.(false); }
    };
    if (ctx.state === 'running') route(); else ctx.resume().then(route, () => onBoostRef.current?.(false));
  }, [boost]);
  useEffect(() => () => { try { void boostRef.current?.ctx.close(); } catch { /* gone */ } }, []);
  const cb = useRef({ onPlaying, onProgress, onEnded, onFail, onClock });
  cb.current = { onPlaying, onProgress, onEnded, onFail, onClock };
  useEffect(() => {
    if (!seekRef) return;
    seekRef.current = (t: number) => {
      const v = videoRef.current;
      if (v && t >= 0) v.currentTime = Math.min(t, (v.duration || 1e9) - 0.5);
    };
    return () => { seekRef.current = null; };
  }, [seekRef]);

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
      // Open sharp (the rule's start), never locked: on a weak line hls.js steps
      // down a rung at the next segment, abandoning a segment that would arrive
      // too late, so the film keeps playing instead of stalling, and the floor
      // (minAutoBitrate) stops it going below 720p, or 1080p on a 4K film.
      startLevel: -1,
      capLevelToPlayerSize: false,
      abrEwmaDefaultEstimate: 8_000_000,
      // Down early, up carefully: a rendition must fit in 80% of the line to be
      // kept and in 70% to climb to, so the player does not bounce between sizes.
      abrBandWidthFactor: 0.8,
      abrBandWidthUpFactor: 0.7,
      abrEwmaFastVoD: 2,
      abrEwmaSlowVoD: 6,
      fragLoadingMaxRetry: 6,
      manifestLoadingMaxRetry: 3,
    });
    hlsRef.current = hls;
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      // hls.js holds its floor against each rendition's maxBitrate (BANDWIDTH).
      const rule = pictureRule(hls.levels.map((l) => ({ height: l.height, bitrate: l.maxBitrate || l.bitrate })), picture, isTvBuild());
      capRef.current = rule.cap;
      setLevels([{ id: -1, label: 'Auto', height: 0 }, ...hls.levels.map((l, i) => ({ id: i, label: l.name || '', height: l.height }))]);
      setPinned(-1);
      if (rule.start >= 0) {
        hls.startLevel = rule.start;
        if (rule.cap >= 0) hls.autoLevelCapping = rule.cap;
        if (rule.minBitrate > 0) hls.config.minAutoBitrate = rule.minBitrate;
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
  }, [Hls, src, picture, startAt]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let told = false;
    let last = 0;
    let ticked = 0;
    const onTime = () => {
      if (!told && v.currentTime > 0.5) { told = true; cb.current.onPlaying(); }
      const now = Date.now();
      if (now - ticked > 450) { ticked = now; cb.current.onClock?.(v.currentTime, v.duration || 0); }
      if (now - last > 4000) { last = now; cb.current.onProgress(v.currentTime, v.duration || 0); }
    };
    const onRes = () => {
      const h = v.videoHeight;
      setHeight(h);
      // Only once the film is under way: the first picture is not a change.
      const was = shownRef.current;
      shownRef.current = h;
      if (!was || !h || v.currentTime < 3 || Math.abs(was - h) < 100) return;
      setNote(h < was ? `Slower connection · ${heightLabel(h)} for now` : `Sharper again · ${heightLabel(h)}`);
      window.clearTimeout(noteTimer.current);
      noteTimer.current = window.setTimeout(() => setNote(null), 3500);
    };
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

  // Set at the next segment, so the picture carries on while it changes.
  const pickQuality = (id: number) => {
    const h = hlsRef.current; if (!h) return;
    h.autoLevelCapping = id === -1 ? capRef.current : -1;
    h.nextLevel = id;
    setPinned(id);
  };
  const pickAudio = (id: number) => {
    const h = hlsRef.current; if (!h) return;
    h.audioTrack = id;
    setAud(id);
  };
  const pickSubs = (id: number) => {
    const h = hlsRef.current; if (!h) return;
    h.subtitleTrack = id;
    h.subtitleDisplay = id >= 0;
    setSub(id);
  };
  const choicesRef = useRef(onChoices);
  choicesRef.current = onChoices;
  useEffect(() => {
    choicesRef.current?.({
      quality: qualityList(levels), qualityOn: pinned,
      audio: audioList(audio.map((t) => ({ id: t.id, label: t.name }))), audioOn: aud,
      subs: subsList(subs.map((t) => ({ id: t.id, label: t.name }))), subsOn: sub,
      pickQuality, pickAudio, pickSubs,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, pinned, audio, aud, subs, sub]);
  useEffect(() => () => choicesRef.current?.(null), []);


  return (
    <div className="absolute inset-0 bg-black" tabIndex={0} data-tv-focusable data-tv-noring data-tv-seek onKeyDown={onKey}>
      <video ref={(el) => { videoRef.current = el; if (el && onFullscreen) el.setAttribute('controlslist', 'nofullscreen'); }}
        className="w-full h-full bg-black" controls playsInline autoPlay crossOrigin="anonymous"
        onDoubleClick={onFullscreen ? (e) => { e.preventDefault(); onFullscreen(); } : undefined} />
      {waiting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
        </div>
      )}
      {note && (
        <div role="status" className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full bg-black/65 text-white border border-white/15 shadow-lg">{note}</div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {height > 0 && (
          // What is actually on screen, read from the picture itself.
          <span className="pointer-events-none text-[11px] font-bold px-2 py-0.5 rounded bg-black/60 text-white border border-white/15">{heightLabel(height)}</span>
        )}
        {/* Sound and subtitles are in the player bar's Audio & Subtitles panel. */}
        {onFullscreen && (
          <button type="button" onClick={onFullscreen} aria-label={isFull ? 'Exit full screen' : 'Full screen'} title={isFull ? 'Exit full screen' : 'Full screen'}
            className="w-9 h-9 grid place-items-center rounded-full bg-black/55 text-white border border-white/15 hover:bg-black/80">
            {isFull ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
