import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

export type RadioStatus = 'idle' | 'tuning' | 'live' | 'error';

interface RadioContextType {
  playingUrl: string | null;
  playingName: string | null;
  status: RadioStatus;
  /** The station that could not be reached, until another is chosen. */
  failedUrl: string | null;
  /** The last station heard, kept across visits. */
  lastUrl: string | null;
  /** Stations heard lately, newest first. */
  recentUrls: string[];
  togglePlay: (url: string, name: string) => void;
  stop: () => void;
}

const RadioContext = createContext<RadioContextType | undefined>(undefined);

const RECENT_KEY = 'sahrae.radio.recent.v1';
const RECENT_MAX = 10;
/** Try a dropped or silent station this many more times, spaced out. */
const RETRY_MS = [700, 2000, 5000];
/** With no sound for this long, the connection is treated as lost. */
const SILENCE_MS = 12000;

function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : []; } catch { return []; }
}

export function RadioProvider({ children }: { children: ReactNode }) {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingName, setPlayingName] = useState<string | null>(null);
  const [status, setStatus] = useState<RadioStatus>('idle');
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [recentUrls, setRecentUrls] = useState<string[]>(readRecent);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryTimer = useRef(0);
  const silenceTimer = useRef(0);
  const attempts = useRef(0);

  /** Let go of the station entirely: pausing alone left the download running. */
  const release = () => {
    window.clearTimeout(retryTimer.current);
    window.clearTimeout(silenceTimer.current);
    const a = audioRef.current;
    audioRef.current = null;
    if (!a) return;
    a.onplaying = a.onwaiting = a.onerror = a.onended = null;
    a.pause();
    a.removeAttribute('src');
    a.load();
  };

  const remember = (url: string) => setRecentUrls((cur) => {
    const next = [url, ...cur.filter((u) => u !== url)].slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage full */ }
    return next;
  });

  const connect = (url: string) => {
    release();
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const lost = () => {
      if (audioRef.current !== audio) return;
      const wait = RETRY_MS[attempts.current];
      if (wait === undefined) {
        release();
        setPlayingUrl(null); setPlayingName(null); setStatus('error'); setFailedUrl(url);
        return;
      }
      attempts.current++;
      setStatus('tuning');
      window.clearTimeout(silenceTimer.current);
      retryTimer.current = window.setTimeout(() => { if (audioRef.current === audio) connect(url); }, wait);
    };
    const waitForSound = () => {
      window.clearTimeout(silenceTimer.current);
      silenceTimer.current = window.setTimeout(lost, SILENCE_MS);
    };
    audio.onplaying = () => {
      window.clearTimeout(silenceTimer.current);
      attempts.current = 0;
      setStatus('live');
    };
    audio.onwaiting = () => { setStatus('tuning'); waitForSound(); };
    audio.onerror = lost;
    audio.onended = lost; // A live station does not end: the connection did.
    audio.src = url;
    waitForSound();
    audio.play().catch((e) => {
      // A newer press replaced this one; nothing went wrong.
      if (audioRef.current === audio && (e as Error)?.name !== 'AbortError') lost();
    });
  };

  const tune = (url: string, name: string) => {
    attempts.current = 0;
    window.dispatchEvent(new CustomEvent('sahrae:audioclaim', { detail: 'radio' }));
    setFailedUrl(null);
    setPlayingUrl(url);
    setPlayingName(name);
    setStatus('tuning');
    remember(url);
    connect(url);
  };

  const stop = () => {
    release();
    setPlayingUrl(null);
    setPlayingName(null);
    setStatus('idle');
  };

  const togglePlay = (url: string, name: string) => {
    if (playingUrl === url) stop(); else tune(url, name);
  };

  // Cross-pause: if music (or any non-radio source) claims the speaker, stop radio.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    const onClaim = (e: Event) => {
      if ((e as CustomEvent).detail !== 'radio') stopRef.current();
    };
    window.addEventListener('sahrae:audioclaim', onClaim);
    return () => { window.removeEventListener('sahrae:audioclaim', onClaim); stopRef.current(); };
  }, []);

  return (
    <RadioContext.Provider value={{ playingUrl, playingName, status, failedUrl, lastUrl: recentUrls[0] ?? null, recentUrls, togglePlay, stop }}>
      {children}
    </RadioContext.Provider>
  );
}

export function useRadio() {
  const context = useContext(RadioContext);
  if (context === undefined) {
    throw new Error('useRadio must be used within a RadioProvider');
  }
  return context;
}
