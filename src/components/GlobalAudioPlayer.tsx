import { useRadio } from '../hooks/useRadio';
import { Play, Pause, X, Radio } from 'lucide-react';

export default function GlobalAudioPlayer() {
  const { playingUrl, playingName, togglePlay, stop } = useRadio();

  if (!playingUrl) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full bg-zinc-900 border-t border-white/10 p-4 z-[100] animate-in slide-in-from-bottom-full">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-amber-500 animate-pulse" />
          </div>
          <div>
            <p className="text-white font-bold text-sm md:text-base">{playingName || 'Live Audio'}</p>
            <p className="text-zinc-400 text-xs">Now Playing</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => togglePlay(playingUrl, playingName || '')}
            className="w-10 h-10 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center hover:scale-110 transition-transform"
          >
            <Pause className="w-5 h-5 fill-current" />
          </button>
          
          <button 
            onClick={stop}
            className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
