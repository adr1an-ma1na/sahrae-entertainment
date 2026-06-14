import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

interface RadioContextType {
  playingUrl: string | null;
  playingName: string | null;
  togglePlay: (url: string, name: string) => void;
  stop: () => void;
}

const RadioContext = createContext<RadioContextType | undefined>(undefined);

export function RadioProvider({ children }: { children: ReactNode }) {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingName, setPlayingName] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Cross-pause: if music (or any non-radio source) claims the speaker, stop radio.
  useEffect(() => {
    const onClaim = (e: Event) => {
      if ((e as CustomEvent).detail !== 'radio') {
        audioRef.current?.pause();
        setPlayingUrl(null);
        setPlayingName(null);
      }
    };
    window.addEventListener('sahrae:audioclaim', onClaim);
    return () => window.removeEventListener('sahrae:audioclaim', onClaim);
  }, []);

  const togglePlay = (url: string, name: string) => {
    if (playingUrl === url) {
      audioRef.current?.pause();
      setPlayingUrl(null);
      setPlayingName(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audio.play().catch(e => {
        console.error('Error playing audio:', e);
        alert('Could not play this station.');
        setPlayingUrl(null);
        setPlayingName(null);
      });
      audioRef.current = audio;
      window.dispatchEvent(new CustomEvent('sahrae:audioclaim', { detail: 'radio' }));
      setPlayingUrl(url);
      setPlayingName(name);
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingUrl(null);
    setPlayingName(null);
  };

  return (
    <RadioContext.Provider value={{ playingUrl, playingName, togglePlay, stop }}>
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
