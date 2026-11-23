import { useState } from 'react';
import { X, Check, Smartphone } from 'lucide-react';
import { TIERS, type Tier } from '../services/paywallDemo';

/**
 * The plan sheet of the paywall demonstration (services/paywallDemo.ts). It shows the
 * proposed plans and the M-Pesa step as it would be, and charges nothing: choosing a plan
 * only lets this browser tab play. Shown on the website, and only with ?plans=demo.
 */
export default function PlansSheet({ title, onClose, onChosen }: { title?: string; onClose: () => void; onChosen: (t: Tier) => void }) {
  const [picked, setPicked] = useState<Tier | null>(null);
  return (
    <div role="dialog" aria-modal="true" aria-label="Choose a plan" className="dark fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/75" aria-hidden />
      <div className="relative w-full sm:max-w-2xl bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-zinc-950/95 px-5 sm:px-7 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400">Sahrae plans</p>
              <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight mt-1">{picked ? `Pay KSh ${picked.price} with M-Pesa` : title ? `Choose a plan to watch ${title}` : 'Choose a plan to watch'}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"><X className="w-4 h-4" /></button>
          </div>
          <p className="mt-3 text-xs font-semibold text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
            Demo for the Sahrae team. Sahrae takes no payments yet, and nothing here charges you or asks for your details.
          </p>
        </div>

        {!picked ? (
          <div className="px-5 sm:px-7 py-5 grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* The main plan first and full width; the other four pair up beneath it. */}
              {[...TIERS].sort((a, b) => Number(!!b.main) - Number(!!a.main)).map((t) => (
                <button key={t.id} type="button" onClick={() => setPicked(t)}
                  className={`text-left rounded-2xl border p-4 grid gap-2 transition-colors active:scale-[0.99] ${t.main ? 'border-amber-400 bg-amber-500/10 hover:bg-amber-500/15 sm:col-span-2' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'}`}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-bold text-white">{t.name}</span>
                    {t.main && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-amber-400 text-amber-950">Most popular</span>}
                  </span>
                  <span className="text-2xl font-bold text-white tabular-nums">KSh {t.price}<span className="text-sm font-medium text-zinc-400"> / {t.per}</span></span>
                  <span className="grid gap-1">
                    {t.points.map((p) => (
                      <span key={p} className="flex items-center gap-2 text-sm text-zinc-300"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> {p}</span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">Podcasts, audiobooks, radio and news stay free. Prices include VAT. Pay with M-Pesa; cancel any time.</p>
          </div>
        ) : (
          <div className="px-5 sm:px-7 py-6 grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-4">
              <span className="w-12 h-12 shrink-0 rounded-full bg-emerald-500/15 text-emerald-300 grid place-items-center"><Smartphone className="w-6 h-6" /></span>
              <div className="min-w-0">
                <p className="text-white font-semibold">{picked.name} · KSh {picked.price} / {picked.per}</p>
                <p className="text-sm text-zinc-400">In the real Sahrae, an M-Pesa prompt for KSh {picked.price} appears on your phone. You confirm it with your PIN and the film starts.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => onChosen(picked)} className="lux-btn px-6 py-3 font-bold text-sm">Continue without paying (demo)</button>
              <button type="button" onClick={() => setPicked(null)} className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold">Back to plans</button>
            </div>
            <p className="text-xs text-zinc-500">The demo unlocks playing in this browser tab only. Reload the page to see the plans again.</p>
          </div>
        )}
      </div>
    </div>
  );
}
