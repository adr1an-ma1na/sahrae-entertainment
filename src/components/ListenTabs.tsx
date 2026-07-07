import { Music2, Mic2, Radio } from 'lucide-react';

const TABS: { id: string; label: string; icon: typeof Music2 }[] = [
  { id: 'music', label: 'Music', icon: Music2 },
  { id: 'podcasts', label: 'Podcasts', icon: Mic2 },
  { id: 'audio', label: 'Radio', icon: Radio },
];

/**
 * The single control that unifies Music (Sauti), Podcasts and Radio into one
 * "Listen" hub. Rendered at the top of each audio view; tapping a segment
 * navigates to that audio type. `active` is the current view's own id.
 */
export default function ListenTabs({ active, onNav }: { active: string; onNav: (tab: string) => void }) {
  return (
    <div className="flex gap-1 glass p-1 rounded-xl w-fit mb-6">
      {TABS.map((t) => {
        const on = active === t.id;
        const Icon = t.icon;
        return (
          <button key={t.id} onClick={() => onNav(t.id)} tabIndex={0} data-tv-focusable
            className={`px-4 md:px-5 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${on ? 'bg-sauti text-amber-950' : 'text-zinc-400 hover:text-white'}`}>
            <Icon className="w-4 h-4" /> {t.label}
          </button>
        );
      })}
    </div>
  );
}
