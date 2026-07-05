import { useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';

/**
 * First-run Sauti taste onboarding (cold-start fix). A brand-new listener has no
 * history, so the recommender has nothing to work with and Home can only show
 * generic shelves. This picker captures a few loved artists up front, which the
 * parent turns into taste-seeds — so "Made for you / Daily Mix / Discover" are
 * built around the listener from the very first open, not pre-filled.
 *
 * Presentational only: reports the chosen artist names via onComplete (async,
 * while the parent seeds), or onSkip. Uses the app's colour-identity + vinyl
 * language so it feels native to Sauti.
 */
const ARTISTS: { name: string; region: string }[] = [
  { name: 'Burna Boy', region: 'Afrobeats' },
  { name: 'Wizkid', region: 'Afrobeats' },
  { name: 'Rema', region: 'Afrobeats' },
  { name: 'Asake', region: 'Afrobeats' },
  { name: 'Ayra Starr', region: 'Afrobeats' },
  { name: 'Tems', region: 'Afrobeats' },
  { name: 'Sauti Sol', region: 'Kenya' },
  { name: 'Bien', region: 'Kenya' },
  { name: 'Diamond Platnumz', region: 'Bongo' },
  { name: 'Tyla', region: 'Amapiano' },
  { name: 'Kabza De Small', region: 'Amapiano' },
  { name: 'Uncle Waffles', region: 'Amapiano' },
  { name: 'Drake', region: 'USA' },
  { name: 'Kendrick Lamar', region: 'USA' },
  { name: 'SZA', region: 'USA · R&B' },
  { name: 'The Weeknd', region: 'USA' },
  { name: 'Beyoncé', region: 'USA' },
  { name: 'Doja Cat', region: 'USA' },
  { name: 'Taylor Swift', region: 'USA · Pop' },
  { name: 'Dave', region: 'UK' },
  { name: 'Central Cee', region: 'UK' },
  { name: 'Stormzy', region: 'UK' },
  { name: 'Adele', region: 'UK' },
  { name: 'Ed Sheeran', region: 'UK · Pop' },
  { name: 'Aya Nakamura', region: 'France' },
  { name: 'Gims', region: 'France' },
  { name: 'Bad Bunny', region: 'Latin' },
  { name: 'Karol G', region: 'Latin' },
  { name: 'Rosalía', region: 'Spain' },
  { name: 'Anitta', region: 'Brazil' },
  { name: 'Dua Lipa', region: 'Pop' },
  { name: 'Bruno Mars', region: 'Pop' },
];

const GRADS = [
  'from-rose-500 to-orange-600', 'from-emerald-500 to-teal-700', 'from-sky-500 to-indigo-700',
  'from-violet-500 to-fuchsia-700', 'from-fuchsia-500 to-rose-700', 'from-cyan-500 to-blue-700',
  'from-lime-500 to-emerald-700', 'from-indigo-500 to-purple-800', 'from-amber-400 to-orange-700',
  'from-teal-400 to-cyan-700',
];
const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const gradFor = (n: string) => GRADS[hashStr(n) % GRADS.length];
const monogram = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function SautiOnboarding({ onComplete, onSkip }: { onComplete: (names: string[]) => Promise<void> | void; onSkip: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (n: string) => setSel((prev) => { const s = new Set(prev); if (s.has(n)) s.delete(n); else s.add(n); return s; });
  const enough = sel.size >= 3;

  const start = async () => {
    if (!enough || busy) return;
    setBusy(true);
    try { await onComplete([...sel]); } catch { /* parent still completes */ }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Set up Sauti" className="fixed inset-0 z-[120] bg-[#09090b] overflow-y-auto">
      {/* Aurora wash */}
      <div aria-hidden className="pointer-events-none fixed top-0 left-0 right-0 h-72 opacity-80"
        style={{ background: 'radial-gradient(55% 70% at 15% 0%, rgba(245,158,11,0.24), transparent 70%), radial-gradient(50% 60% at 85% 6%, rgba(236,72,153,0.16), transparent 72%)', filter: 'blur(10px)' }} />

      <div className="relative max-w-3xl mx-auto px-5 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-40">
        {/* Header — vinyl mark ties it to Sauti */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative w-12 h-12 shrink-0" aria-hidden>
            <div className="absolute inset-0 rounded-full bg-[#0b0b0d] shadow-lg shadow-amber-500/25" style={{ backgroundImage: 'repeating-radial-gradient(circle at 50% 50%, rgba(245,158,11,0.20) 0 1px, transparent 1px 4px)' }} />
            <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
            <div className="absolute inset-0 m-auto w-[22px] h-[22px] rounded-full bg-gradient-to-tr from-amber-300 via-amber-500 to-amber-600 flex items-center justify-center shadow-inner"><Sparkles className="w-3 h-3 text-amber-950" /></div>
          </div>
          <div className="overline">Welcome to Sauti</div>
        </div>

        <h1 className="text-3xl md:text-5xl font-display font-black text-white tracking-tight leading-[1.05] mb-2">Who do you love?</h1>
        <p className="text-zinc-400 text-sm md:text-base mb-7 max-w-xl">Pick <span className="text-sauti font-semibold">3 or more</span> artists and Sauti builds your mixes around them — Daily Mixes, Discover, Release Radar. Nothing pre-filled; this is <span className="text-white font-semibold">your</span> sound from the first play.</p>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {ARTISTS.map((a) => {
            const on = sel.has(a.name);
            return (
              <button key={a.name} onClick={() => toggle(a.name)} tabIndex={0} data-tv-focusable role="button" aria-pressed={on}
                className={`group text-center focus:outline-none rounded-2xl transition-transform ${on ? 'scale-[1.03]' : 'hover:scale-[1.03]'}`}>
                <div className={`relative aspect-square rounded-2xl overflow-hidden flex items-center justify-center bg-gradient-to-br ${gradFor(a.name)} shadow-lg ${on ? 'ring-[3px] ring-amber-400' : 'ring-1 ring-white/10'}`}>
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/25" />
                  <span className="relative z-10 font-display font-black text-white/95 text-2xl md:text-3xl tracking-tight drop-shadow">{monogram(a.name)}</span>
                  <div className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`}>
                    <span className="w-9 h-9 rounded-full bg-sauti flex items-center justify-center shadow-lg"><Check className="w-5 h-5 text-amber-950" strokeWidth={3} /></span>
                  </div>
                </div>
                <p className={`mt-1.5 text-xs font-semibold truncate ${on ? 'text-sauti' : 'text-white'}`}>{a.name}</p>
                <p className="text-[10px] text-zinc-500 truncate">{a.region}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[121] glass border-t border-white/10 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        <div className="max-w-3xl mx-auto px-5 flex items-center justify-between gap-3">
          <button onClick={onSkip} disabled={busy} className="text-sm font-semibold text-zinc-400 hover:text-white px-3 py-2.5 disabled:opacity-40">Maybe later</button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 tabular hidden sm:block">{sel.size} selected{!enough ? ` · ${3 - sel.size} more` : ''}</span>
            <button onClick={start} disabled={!enough || busy}
              className="btn-sauti px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Tuning Sauti…</> : <><Sparkles className="w-4 h-4" /> Start listening</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
