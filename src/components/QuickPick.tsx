import { useEffect, useState } from 'react';
import { Clock3, Sparkles } from 'lucide-react';
import MediaRow from './MediaRow';
import { discoverWith, type MediaItem } from '../services/tmdb';
import { fitsLabel, MOODS, quickPickQuery, TIMES, type Mood, type TimeSlot } from '../services/discoverCore';
import { t } from '../i18n';

/**
 * "What fits right now?": pick the time you have and the mood you are in, and
 * get titles that fit. Under an hour it suggests episodes, longer it suggests
 * films of the right length. The choice is remembered for next time.
 */

const KEY = 'sahrae.quickPick.v1';

export default function QuickPick({ onPlay }: { onPlay: (id: number, type: 'movie' | 'tv') => void }) {
  const [time, setTime] = useState<TimeSlot>(() => { try { return (JSON.parse(localStorage.getItem(KEY) || '{}').time as TimeSlot) || 95; } catch { return 95; } });
  const [mood, setMood] = useState<Mood>(() => { try { return (JSON.parse(localStorage.getItem(KEY) || '{}').mood as Mood) || 'light'; } catch { return 'light'; } });
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const q = quickPickQuery(time, mood);

  useEffect(() => {
    let live = true;
    setItems(null);
    try { localStorage.setItem(KEY, JSON.stringify({ time, mood })); } catch { /* not remembered */ }
    discoverWith(q.type, q.params).then((r) => { if (live) setItems(r); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
    // q is derived from time and mood.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, mood]);

  const chip = (active: boolean) => `shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? 'bg-amber-500 text-amber-950 border-amber-400' : 'bg-zinc-900/80 text-zinc-300 border-zinc-700 hover:text-white'}`;

  return (
    <section className="mt-8">
      <div className="px-4 md:px-12">
        <h2 className="lux-h text-xl md:text-2xl"><Sparkles className="w-5 h-5 text-amber-400" />{t('What fits right now?')}</h2>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
            <span className="shrink-0 text-xs text-zinc-400 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />{t('Time you have')}</span>
            {TIMES.map((x) => <button key={x.id} onClick={() => setTime(x.id)} data-tv-focusable aria-pressed={time === x.id} className={chip(time === x.id)}>{t(x.label)}</button>)}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
            <span className="shrink-0 text-xs text-zinc-400">{t('In the mood for')}</span>
            {MOODS.map((m) => <button key={m.id} onClick={() => setMood(m.id)} data-tv-focusable aria-pressed={mood === m.id} className={chip(mood === m.id)}>{t(m.label)}</button>)}
          </div>
        </div>
      </div>
      {items === null
        ? <div className="px-4 md:px-12 mt-4 flex gap-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="w-32 md:w-40 aspect-[2/3] rounded-xl bg-zinc-900/60 animate-pulse" />)}</div>
        : items.length === 0
          ? <p className="px-4 md:px-12 mt-3 text-sm text-zinc-400">Nothing well-rated fits that exactly. Try a little more time or another mood.</p>
          : <MediaRow title={fitsLabel(time)} items={items} onPlay={onPlay} defaultType={q.type} />}
    </section>
  );
}
