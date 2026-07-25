import { useState } from 'react';
import { Play, Headphones, Download, Trophy, Check, ChevronRight, Sparkles } from 'lucide-react';

export interface TasteGenre { id: number; name: string }

// TMDB movie-genre ids so the picks feed real discovery on Home.
const GENRES: TasteGenre[] = [
  { id: 28, name: 'Action' }, { id: 35, name: 'Comedy' }, { id: 18, name: 'Drama' },
  { id: 878, name: 'Sci-Fi' }, { id: 53, name: 'Thriller' }, { id: 27, name: 'Horror' },
  { id: 10749, name: 'Romance' }, { id: 12, name: 'Adventure' }, { id: 16, name: 'Animation' },
  { id: 80, name: 'Crime' }, { id: 14, name: 'Fantasy' }, { id: 99, name: 'Documentary' },
  { id: 9648, name: 'Mystery' }, { id: 10751, name: 'Family' }, { id: 36, name: 'History' }, { id: 10752, name: 'War' },
];

const PILLARS = [
  { icon: Play, title: 'Watch', desc: 'Movies, series, live TV & live sports', grad: 'from-amber-400 to-orange-600' },
  { icon: Headphones, title: 'Listen', desc: 'Music, podcasts & radio, all in one hub', grad: 'from-fuchsia-500 to-rose-600' },
  { icon: Trophy, title: 'Live Sports', desc: 'The day’s fixtures, HD, in one tap', grad: 'from-emerald-500 to-teal-700' },
  { icon: Download, title: 'Downloads', desc: 'Save to your device, watch anywhere', grad: 'from-sky-500 to-indigo-700' },
];

/**
 * First-launch app onboarding. A short, premium flow (welcome → what's inside →
 * pick your taste) themed to the desert-dawn identity. Skippable; on finish it
 * reports the chosen genres so Home can personalise from the very first open.
 */
export default function Onboarding({ onDone }: { onDone: (genres: TasteGenre[]) => void }) {
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setSel((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const enough = sel.size >= 3;
  const finish = () => onDone(GENRES.filter((g) => sel.has(g.id)));
  const next = () => (step < 2 ? setStep((s) => s + 1) : finish());

  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Sahrae" className="fixed inset-0 z-[150] bg-[#0a0806] flex flex-col overflow-hidden">
      {/* Desert-dawn wash — ties to the app icon */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[46%]"
        style={{ background: 'radial-gradient(90% 80% at 50% 8%, rgba(245,158,11,0.30), transparent 62%), radial-gradient(60% 50% at 78% 0%, rgba(236,72,153,0.16), transparent 68%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#241608] to-transparent" />

      {/* Skip */}
      <div className="relative flex justify-end pt-[calc(env(safe-area-inset-top)+1rem)] px-5">
        <button onClick={finish} className="text-sm font-semibold text-zinc-400 hover:text-white px-3 py-2">Skip</button>
      </div>

      <div className="relative flex-1 overflow-y-auto px-6 flex flex-col">
        {step === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overline mb-4">Welcome to</div>
            <h1 className="text-6xl md:text-7xl font-display font-black tracking-tighter mb-4"><span className="text-gold">SAHRAE</span></h1>
            <p className="text-zinc-300 text-lg leading-relaxed">Everything you love to watch and listen to, including movies, series, live TV, sports, music and podcasts, all in one place.</p>
          </div>
        )}

        {step === 1 && (
          <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overline mb-1.5">What’s inside</div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-6">One app, all of it</h2>
            <div className="space-y-3">
              {PILLARS.map((p) => {
                const Icon = p.icon;
                return (
                  <div key={p.title} className="flex items-center gap-4 tier-card rounded-2xl p-4">
                    <span className={`w-12 h-12 rounded-xl bg-gradient-to-br ${p.grad} flex items-center justify-center shrink-0 shadow-lg`}><Icon className="w-6 h-6 text-white" /></span>
                    <div className="min-w-0">
                      <p className="font-bold text-white">{p.title}</p>
                      <p className="text-sm text-zinc-400">{p.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 flex flex-col max-w-lg mx-auto w-full pt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overline mb-1.5">Personalise</div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-1.5">What do you love to watch?</h2>
            <p className="text-zinc-400 text-sm mb-5">Pick <span className="text-sauti font-semibold">3 or more</span> to have your Home start around them.</p>
            <div className="flex flex-wrap gap-2.5 pb-4">
              {GENRES.map((g) => {
                const on = sel.has(g.id);
                return (
                  <button key={g.id} onClick={() => toggle(g.id)} aria-pressed={on}
                    className={`px-4 py-2.5 rounded-full text-sm font-semibold border transition-all flex items-center gap-1.5 ${on ? 'bg-sauti text-amber-950 border-amber-400 scale-[1.03]' : 'chip text-zinc-200 border-white/10 hover:text-white'}`}>
                    {on && <Check className="w-4 h-4" strokeWidth={3} />}{g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer — progress + primary CTA */}
      <div className="relative px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 flex items-center justify-between gap-4 max-w-lg mx-auto w-full">
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-sauti' : 'w-1.5 bg-white/25'}`} />
          ))}
        </div>
        <button onClick={next} disabled={step === 2 && !enough}
          className="btn-gold px-7 py-3 rounded-full font-bold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          {step === 0 ? <>Get started <ChevronRight className="w-4 h-4" /></>
            : step === 1 ? <>Continue <ChevronRight className="w-4 h-4" /></>
            : <><Sparkles className="w-4 h-4" /> Start watching</>}
        </button>
      </div>
    </div>
  );
}
