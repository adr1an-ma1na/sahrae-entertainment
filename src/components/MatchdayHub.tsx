import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, BarChart3, Play, Radio, Trophy, Flag, RefreshCw } from 'lucide-react';
import type { Feed, FeedEvent } from '../services/sportsFeed';
import { COMPETITIONS, dayLabel, findStream, loadMatchday, percentages, type Fixture } from '../services/matchday';
import { clearReminder, LEAD_MS, setReminder, useReminders } from '../services/reminders';
import { isDataSaver } from '../services/dataSaver';
import { haptics } from '../services/haptics';

/**
 * Matchday: the competitions viewers follow on one screen. Each fixture shows
 * the kick-off in the viewer's own time (or the live score), what the
 * bookmakers make of it with their margin taken out, a reminder, the live
 * stream from the sports feed when there is one, and the full model in Sahrae
 * Predictor.
 */

const PREDICTOR_URL = 'https://adr1an-ma1na.github.io/sahrae-predictor-pwa/';
const DAYS_AHEAD = 3;

type Filter = 'all' | string;

/** ESPN serves 500 px logos; ask its resizer for what a card shows. */
function logo(url?: string): string | undefined {
  if (!url) return undefined;
  const m = url.match(/^https:\/\/a\.espncdn\.com(\/i\/teamlogos\/[^?]+)/);
  if (!m) return url;
  const px = isDataSaver() ? 40 : 80;
  return `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${px}&h=${px}`;
}

function openExternal(url: string) {
  const caps = (window as unknown as { __sahraeCaps?: object }).__sahraeCaps;
  if (caps) {
    fetch(`https://localhost/__openext?url=${encodeURIComponent(url)}`, { cache: 'no-store' }).catch(() => {});
    return;
  }
  window.open(url, '_blank', 'noopener');
}

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function MatchdayHub({ feed, onWatch }: { feed: Feed | null; onWatch: (e: FeedEvent) => void }) {
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const reminders = useReminders();

  const load = async (fresh = false) => {
    try {
      const f = await loadMatchday(DAYS_AHEAD, fresh);
      setFixtures(f);
      setFailed(f.length === 0);
    } catch { setFailed(true); setFixtures((x) => x ?? []); }
  };

  useEffect(() => { void load(); }, []);

  // Live scores: refresh today's fixtures every minute while any match is on.
  const anyLive = !!fixtures?.some((f) => f.state === 'in');
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => { if (!document.hidden) void load(true); }, 60000);
    return () => clearInterval(t);
  }, [anyLive]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const events = useMemo(() => feed?.events ?? [], [feed]);
  const motogp = useMemo(() => events
    .filter((e) => e.category === 'motor-sports' && /moto\s?gp/i.test(e.title) && e.date > Date.now() - 4 * 3600000 && e.date < Date.now() + (DAYS_AHEAD + 1) * 86400000)
    .sort((a, b) => a.date - b.date), [events]);

  const shown = (fixtures ?? []).filter((f) => filter === 'all' || f.competition === filter);
  const live = shown.filter((f) => f.state === 'in');
  const later = shown.filter((f) => f.state !== 'in');
  const groups: [string, Fixture[]][] = [];
  for (const f of later) {
    const label = dayLabel(f.date);
    const g = groups.find((x) => x[0] === label);
    if (g) g[1].push(f); else groups.push([label, [f]]);
  }

  const toggleReminder = async (f: Fixture) => {
    haptics.tap();
    const title = f.home && f.away ? `${f.home.short} v ${f.away.short}` : f.title;
    if (reminders.has(f.id)) { await clearReminder(f.id); setNotice(`Reminder for ${title} removed`); return; }
    const r = await setReminder(f.id, title, f.date, f.venue);
    setNotice(r === 'notification' ? `We'll notify you 15 minutes before ${title}`
      : r === 'calendar' ? `Added ${title} to your calendar, with an alert 15 minutes before`
      : `${title} starts too soon for a reminder`);
  };

  const chips: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, ...COMPETITIONS.map((c) => ({ id: c.code, label: c.short }))];

  const card = (f: Fixture) => {
    const stream = findStream(f, events);
    const isLive = f.state === 'in';
    const canRemind = f.state === 'pre' && f.date - LEAD_MS > Date.now();
    const pct = f.odds ? percentages([f.odds.pHome, f.odds.pDraw, f.odds.pAway]) : null;
    return (
      <div key={f.id} className="tier-card rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          <span className="flex items-center gap-1.5">{f.sport === 'racing' ? <Flag className="w-3.5 h-3.5" /> : <Trophy className="w-3.5 h-3.5" />}{f.competitionName}</span>
          {isLive
            ? <span className="flex items-center gap-1.5 text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Live · {f.status}</span>
            : f.state === 'post' ? <span>Full time</span> : <span>{timeOf(f.date)}</span>}
        </div>

        {f.home && f.away ? (
          <div className="flex flex-col gap-2">
            {[f.home, f.away].map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                {logo(t.logo) ? <img src={logo(t.logo)} alt="" loading="lazy" className="w-7 h-7 object-contain" /> : <div className="w-7 h-7 rounded-full bg-zinc-800" />}
                <span className="flex-1 min-w-0 truncate text-white font-semibold">{t.name}</span>
                {t.form && !isLive && f.state === 'pre' && (
                  <span className="hidden sm:flex gap-0.5" aria-label={`Last five: ${t.form}`}>
                    {t.form.slice(-5).split('').map((r, k) => (
                      <span key={k} className={`w-4 h-4 rounded text-[9px] font-bold grid place-items-center ${r === 'W' ? 'bg-emerald-500/20 text-emerald-400' : r === 'L' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-700/60 text-zinc-300'}`}>{r}</span>
                    ))}
                  </span>
                )}
                {(isLive || f.state === 'post') && <span className="text-xl font-extrabold text-white tabular-nums w-6 text-right">{t.score ?? '-'}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-white font-semibold">{f.title}{f.venue ? <span className="block text-xs text-zinc-400 font-normal mt-0.5">{f.venue}</span> : null}</div>
        )}

        {pct && f.odds && f.state === 'pre' && (
          <div title={`${f.odds.provider} prices with their ${Math.round(f.odds.margin * 100)}% margin removed. A market view, not a certainty.`}>
            <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
              <div className="bg-amber-400" style={{ width: `${pct[0]}%` }} />
              <div className="bg-zinc-500" style={{ width: `${pct[1]}%` }} />
              <div className="bg-sky-400" style={{ width: `${pct[2]}%` }} />
            </div>
            <div className="flex justify-between text-[11px] mt-1 text-zinc-300 tabular-nums">
              <span><b className="text-amber-300">{pct[0]}%</b> {f.home?.short}</span>
              <span>Draw {pct[1]}%</span>
              <span>{f.away?.short} <b className="text-sky-300">{pct[2]}%</b></span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-0.5">From {f.odds.provider} odds, bookmaker margin removed</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {stream && f.state !== 'post' && (
            <button onClick={() => { haptics.tap(); onWatch(stream as FeedEvent); }} data-tv-focusable
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 active:scale-95 ${isLive ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
              <Play className="w-3.5 h-3.5 fill-current" />{isLive ? 'Watch live' : 'Stream'}
            </button>
          )}
          {!stream && f.state !== 'post' && (
            <span className="px-3 py-1.5 rounded-full text-[11px] text-zinc-400 border border-white/10" title="The stream appears here when the sports feed lists it, usually close to kick-off">
              Stream not listed yet
            </span>
          )}
          {canRemind && (
            <button onClick={() => void toggleReminder(f)} data-tv-focusable aria-pressed={reminders.has(f.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border active:scale-95 ${reminders.has(f.id) ? 'border-amber-400/60 text-amber-300 bg-amber-400/10' : 'border-white/15 text-white bg-zinc-800'}`}>
              {reminders.has(f.id) ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}{reminders.has(f.id) ? 'Reminder set' : 'Remind me'}
            </button>
          )}
          {f.sport === 'soccer' && f.state === 'pre' && (
            <button onClick={() => openExternal(PREDICTOR_URL)} data-tv-focusable
              className="px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border border-white/15 text-white bg-zinc-800 active:scale-95">
              <BarChart3 className="w-3.5 h-3.5" />Full prediction
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {chips.map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)} data-tv-focusable aria-pressed={filter === c.id}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${filter === c.id ? 'bg-amber-500 text-amber-950 border-amber-400' : 'bg-zinc-900/80 text-zinc-300 border-zinc-700 hover:text-white'}`}>
            {c.label}
          </button>
        ))}
        <button onClick={() => void load(true)} data-tv-focusable title="Refresh scores" className="shrink-0 ml-auto w-9 h-9 grid place-items-center rounded-full bg-zinc-900/80 border border-zinc-700 text-zinc-300 hover:text-white">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {notice && <div role="status" className="text-sm text-amber-200 bg-amber-400/10 border border-amber-400/30 rounded-xl px-4 py-2">{notice}</div>}

      {fixtures === null && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 rounded-2xl bg-zinc-900/60 animate-pulse" />)}
        </div>
      )}

      {fixtures !== null && failed && shown.length === 0 && (
        <p className="text-zinc-400 text-sm">No fixtures in the next {DAYS_AHEAD + 1} days for {filter === 'all' ? 'these competitions' : chips.find((c) => c.id === filter)?.label}, or the fixture service could not be reached. Live events are still in the Live Events tab.</p>
      )}

      {live.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><Radio className="w-4 h-4 text-red-400" />Live now</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{live.map(card)}</div>
        </section>
      )}

      {groups.map(([label, list]) => (
        <section key={label}>
          <h3 className="text-lg font-bold text-white mb-3">{label}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{list.map(card)}</div>
        </section>
      ))}

      {(filter === 'all') && motogp.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><Flag className="w-4 h-4" />MotoGP</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {motogp.map((e) => (
              <div key={e.id} className="tier-card rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  <span>MotoGP</span><span>{dayLabel(e.date)} · {timeOf(e.date)}</span>
                </div>
                <div className="text-white font-semibold">{e.title}</div>
                <div><button onClick={() => { haptics.tap(); onWatch(e); }} data-tv-focusable className="px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-white text-black active:scale-95"><Play className="w-3.5 h-3.5 fill-current" />Stream</button></div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
