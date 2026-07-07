import { Mic2 } from 'lucide-react';
import PodcastsHome from './PodcastsHome';
import ListenTabs from './ListenTabs';

/**
 * The Podcasts destination inside the Listen hub — page chrome + the shared
 * audio-type switcher, wrapping the rich PodcastsHome content.
 */
export default function PodcastsView({ onNav }: { onNav?: (tab: string) => void }) {
  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-40 relative">
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-64 -z-10 opacity-70"
        style={{ background: 'radial-gradient(60% 70% at 12% 0%, rgba(245,158,11,0.22), transparent 70%), radial-gradient(50% 60% at 80% 10%, rgba(251,191,36,0.12), transparent 72%)', filter: 'blur(8px)' }} />
      <div className="overline mb-1.5">Sahrae · Listen</div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-300 via-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
          <Mic2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Podcasts</h2>
          <p className="text-sm text-zinc-400">Shows · episodes · charts</p>
        </div>
      </div>
      <ListenTabs active="podcasts" onNav={onNav ?? (() => {})} />
      <PodcastsHome />
    </div>
  );
}
