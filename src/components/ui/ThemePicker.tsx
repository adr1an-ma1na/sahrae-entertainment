import { Check } from 'lucide-react';
import { THEMES, type Theme } from '../../hooks/useTheme';

/**
 * The six themes as swatches: each tile is painted in that theme's own page
 * colour, metal and room light, so the choice is made by eye rather than by
 * name. Used in the top-bar popover and in Profile settings.
 */
export default function ThemePicker({ theme, onPick, compact = false }: { theme: Theme; onPick: (t: Theme) => void; compact?: boolean }) {
  return (
    <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'} gap-2.5`} role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => {
        const on = t.id === theme;
        return (
          <button key={t.id} role="radio" aria-checked={on} onClick={() => onPick(t.id)} tabIndex={0} data-tv-focusable
            className={`group relative rounded-2xl overflow-hidden text-left transition-transform duration-300 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${on ? 'ring-2 ring-amber-400' : 'ring-1 ring-white/10'}`}>
            <div className="relative h-16" style={{ background: `radial-gradient(90% 120% at 0% 0%, ${t.metal}55, transparent 60%), radial-gradient(80% 120% at 100% 100%, ${t.glow}66, transparent 60%), ${t.page}` }}>
              <span className="absolute left-3 bottom-2.5 w-7 h-7 rounded-full shadow-lg" style={{ background: `linear-gradient(145deg, ${t.metal}, ${t.glow})`, boxShadow: `0 0 18px ${t.metal}80` }} />
              <span className="absolute left-12 bottom-4 h-1.5 w-10 rounded-full opacity-70" style={{ background: t.metal }} />
              {on && <span className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: t.metal, color: t.page }}><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>}
            </div>
            <div className="px-3 py-2 bg-zinc-900">
              <p className="text-sm font-display font-bold text-white leading-tight">{t.name}</p>
              {!compact && <p className="text-[11px] text-zinc-500 leading-tight mt-0.5 truncate">{t.note}</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
