import { Film, Music2, Trophy, UserRound } from 'lucide-react';
import type { Profile } from '../services/tasteProfile';
import { t } from '../i18n';

/**
 * "Your taste": one line of what this viewer is into across films, music and
 * sport, each a shortcut into that part of Sahrae. Shown only once there is
 * something to say.
 */
export default function TasteCard({ profile, onGenre, onNavigate }: {
  profile: Profile;
  onGenre: (name: string) => void;
  onNavigate: (tab: string) => void;
}) {
  const any = profile.screen.length || profile.music.length || profile.sports.length;
  if (!any) return null;
  const pill = 'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-zinc-900/80 text-zinc-200 hover:text-white flex items-center gap-1.5';
  return (
    <section className="px-4 md:px-12 mt-8">
      <div className="tier-card rounded-2xl p-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2"><UserRound className="w-4 h-4 text-amber-400" />{t('Your taste')}</h2>
        <p className="text-xs text-zinc-400 mt-0.5">From what you watch, listen to and follow, on this device only.</p>
        <div className="flex gap-2 overflow-x-auto mt-3 pb-1 custom-scrollbar">
          {profile.screen.slice(0, 3).map((g) => (
            <button key={g.id} onClick={() => onGenre(g.name)} data-tv-focusable className={pill}><Film className="w-3.5 h-3.5" />{g.name}</button>
          ))}
          {profile.music.map((m) => (
            <button key={m.id} onClick={() => onNavigate('music')} data-tv-focusable className={pill}><Music2 className="w-3.5 h-3.5" />{m.name}</button>
          ))}
          {profile.sports.map((s) => (
            <button key={s.code} onClick={() => onNavigate('sports')} data-tv-focusable className={pill}><Trophy className="w-3.5 h-3.5" />{s.name}</button>
          ))}
        </div>
      </div>
    </section>
  );
}
