import { Mic2 } from 'lucide-react';
import { LuxHeader, LuxGlow } from './ui/Lux';
import PodcastsHome from './PodcastsHome';
import ListenTabs from './ListenTabs';

/**
 * The Podcasts destination inside the Listen hub — page chrome + the shared
 * audio-type switcher, wrapping the rich PodcastsHome content.
 */
export default function PodcastsView({ onNav }: { onNav?: (tab: string) => void }) {
  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-40 relative">
      <LuxGlow />
      <LuxHeader kicker={<><Mic2 className="w-3.5 h-3.5" /> Sahrae · Listen</>} title="Podcasts"
        meta={<span>Shows, episodes and charts. Listen or watch.</span>} />
      <ListenTabs active="podcasts" onNav={onNav ?? (() => {})} />
      <PodcastsHome />
    </div>
  );
}
