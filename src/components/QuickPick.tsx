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

  return (
    <section className="mt-6 mx-4 md:mx-12 lux-spot p-5 md:p-8">
      <div>
        <p className="lux-kicker mb-2"><Sparkles className="w-3.5 h-3.5" />Concierge</p>
        <h2 className="lux-title text-2xl md:text-4xl pb-1">{t('What fits right now?')}</h2>
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <span className="shrink-0 text-xs text-zinc-400 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />{t('Time you have')}</span>
            {TIMES.map((x) => <button key={x.id} onClick={() => setTime(x.id)} data-tv-focusable aria-pressed={time === x.id} className="lux-chip">{t(x.label)}</button>)}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <span className="shrink-0 text-xs text-zinc-400">{t('In the mood for')}</span>
            {MOODS.map((m) => <button key={m.id} onClick={() => setMood(m.id)} data-tv-focusable aria-pressed={mood === m.id} className="lux-chip">{t(m.label)}</button>)}
          </div>
        </div>
      </div>
      {items === null
        ? <div className="mt-6 flex gap-3 overflow-hidden">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton flex-none w-[120px] md:w-[140px] aspect-[2/3] rounded-lg" />)}</div>
        : items.length === 0
          ? <p className="mt-4 text-sm text-zinc-400">Nothing well-rated fits that exactly. Try a little more time or another mood.</p>
          : <div className="-mb-6"><MediaRow bare title={fitsLabel(time)} items={items} onPlay={onPlay} defaultType={q.type} /></div>}
    </section>
  );
}
