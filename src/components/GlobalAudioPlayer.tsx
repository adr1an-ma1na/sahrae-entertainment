import { useRadio } from '../hooks/useRadio';
import { Pause, X, Radio } from 'lucide-react';

export default function GlobalAudioPlayer() {
  const { playingUrl, playingName, togglePlay, stop } = useRadio();

  if (!playingUrl) return null;

  return (
    <div className="fixed left-0 right-0 lg:left-64 z-[100] px-2 pointer-events-none bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-3">
      <div className="pointer-events-auto max-w-3xl mx-auto dark glass rounded-2xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.45)] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 p-2 pr-3">
          <div className="w-11 h-11 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{playingName || 'Live Audio'}</p>
            <p className="text-xs text-zinc-400 truncate">Live radio · now playing</p>
          </div>
          <button
            onClick={() => togglePlay(playingUrl, playingName || '')}
            tabIndex={0}
            data-tv-focusable
            className="btn-sauti w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            aria-label="Pause radio"
          >
            <Pause className="w-5 h-5 fill-current" />
          </button>
          <button
            onClick={stop}
            tabIndex={0}
            data-tv-focusable
            className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-400 shrink-0"
            aria-label="Stop radio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
