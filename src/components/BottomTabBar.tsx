import { useState } from 'react';
import { Home, Search, Music2, Radio, Grid3x3, X, Film, Tv2, Clapperboard, Trophy, Heart, Clock, Download } from 'lucide-react';

/**
 * Mobile bottom navigation (Spotify-style). Replaces the top scrolling strip on
 * phones/tablets (<lg). Primary destinations as tabs; everything else lives in a
 * "More" sheet so the breadth of Sahrae stays reachable. Sits above the mini
 * player (which the layout pads for). Hidden on lg+ where the sidebar takes over.
 */
const PRIMARY = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'music', label: 'Sauti', icon: Music2 },
  { id: 'audio', label: 'Radio', icon: Radio },
] as const;

const MORE = [
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'series', label: 'Series', icon: Tv2 },
  { id: 'tv', label: 'Live TV', icon: Radio },
  { id: 'sports', label: 'Live Sports', icon: Trophy },
  { id: 'channels', label: 'Flow Channels', icon: Clapperboard },
  { id: 'mylist', label: 'My List', icon: Heart },
  { id: 'continue', label: 'Continue Watching', icon: Clock },
  { id: 'downloads', label: 'Downloads', icon: Download },
] as const;

export default function BottomTabBar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const go = (id: string) => { setMoreOpen(false); setActiveTab(id); };
  const moreActive = MORE.some((m) => m.id === activeTab);

  return (
    <>
      {/* More sheet */}
      {moreOpen && (
        <div role="dialog" className="md:hidden fixed inset-0 z-[95] flex flex-col justify-end" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" />
          <div onClick={(e) => e.stopPropagation()} className="relative glass rounded-t-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-white font-display font-bold text-lg">Browse all</h3>
              <button onClick={() => setMoreOpen(false)} className="w-9 h-9 rounded-full glass-liquid flex items-center justify-center text-white" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MORE.map((m) => {
                const Icon = m.icon; const on = activeTab === m.id;
                return (
                  <button key={m.id} onClick={() => go(m.id)} tabIndex={0} data-tv-focusable
                    className={`tier-card card-lift flex items-center gap-3 p-3 rounded-xl text-left ${on ? 'text-sauti' : 'text-white'}`}>
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${on ? 'bg-sauti text-amber-950' : 'bg-white/10'}`}><Icon className="w-5 h-5" /></span>
                    <span className="text-sm font-semibold truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[90] glass border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {PRIMARY.map((t) => {
            const Icon = t.icon; const on = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => go(t.id)} tabIndex={0} data-tv-focusable
                className={`flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${on ? 'text-sauti' : 'text-zinc-400 hover:text-zinc-200'}`}>
                <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${on ? 'bg-sauti/15' : ''}`}><Icon className="w-6 h-6" /></span>
                <span className="text-[10px] font-semibold">{t.label}</span>
              </button>
            );
          })}
          <button onClick={() => setMoreOpen(true)} tabIndex={0} data-tv-focusable
            className={`flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${moreActive || moreOpen ? 'text-sauti' : 'text-zinc-400 hover:text-zinc-200'}`}>
            <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${moreActive || moreOpen ? 'bg-sauti/15' : ''}`}><Grid3x3 className="w-6 h-6" /></span>
            <span className="text-[10px] font-semibold">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
