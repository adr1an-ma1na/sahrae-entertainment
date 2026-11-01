import { useEffect, useRef, useState } from 'react';
import { X, Scale, ShieldCheck, Cookie, Copyright } from 'lucide-react';
import { LEGAL_DOCS, LEGAL_UPDATED, LEGAL_EMAIL, legalDoc, type LegalId } from '../legal/legalText';
import { OPEN_LEGAL } from '../services/consent';

const ICONS: Record<LegalId, typeof Scale> = { terms: Scale, privacy: ShieldCheck, cookies: Cookie, copyright: Copyright };

/**
 * The Legal centre: Terms of Use, Privacy Policy, Cookies & storage, and
 * Copyright & takedown, readable from anywhere in Sahrae, the sign-in screen
 * included. Opened with openLegal(page) (services/consent.ts); also from
 * #legal-<page> links, so a page can be linked to directly.
 */
export default function LegalCenter() {
  const [page, setPage] = useState<LegalId | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => setPage(((e as CustomEvent).detail as LegalId) || 'terms');
    window.addEventListener(OPEN_LEGAL, onOpen);
    const fromHash = () => {
      const m = /^#legal-(terms|privacy|cookies|copyright)$/.exec(window.location.hash);
      if (m) setPage(m[1] as LegalId);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => { window.removeEventListener(OPEN_LEGAL, onOpen); window.removeEventListener('hashchange', fromHash); };
  }, []);

  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [page]);

  useEffect(() => {
    if (!page) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = () => {
    setPage(null);
    if (/^#legal-/.test(window.location.hash)) history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  if (!page) return null;
  const doc = legalDoc(page);

  return (
    <div role="dialog" aria-modal="true" aria-label={doc.title} data-tv-layer className="dark fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="relative w-full h-full sm:h-[min(88vh,900px)] sm:max-w-3xl bg-zinc-950 sm:rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] sm:pt-5 pb-3 border-b border-white/10">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Legal</p>
            <h2 className="text-xl md:text-2xl font-display font-bold text-white truncate">{doc.title}</h2>
          </div>
          <button onClick={close} data-tv-close data-tv-focusable aria-label="Close" className="w-10 h-10 shrink-0 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"><X className="w-5 h-5" /></button>
        </div>
        <div role="tablist" aria-label="Legal pages" className="flex gap-2 px-5 py-3 overflow-x-auto scrollbar-hide border-b border-white/5">
          {LEGAL_DOCS.map((d) => {
            const Icon = ICONS[d.id];
            return (
              <button key={d.id} role="tab" aria-selected={page === d.id} aria-pressed={page === d.id} onClick={() => setPage(d.id)} data-tv-focusable data-tv-autofocus={page === d.id || undefined} className="lux-chip shrink-0">
                <Icon className="w-4 h-4" /> {d.title}
              </button>
            );
          })}
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto custom-scrollbar px-5 md:px-8 py-6 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
          <p className="text-xs text-zinc-500 mb-4">Last updated {LEGAL_UPDATED}</p>
          <p className="text-zinc-200 leading-relaxed mb-6">{doc.intro}</p>
          {doc.sections.map((s) => (
            <section key={s.h} className="mb-6">
              <h3 className="text-base md:text-lg font-bold text-white mb-2">{s.h}</h3>
              {s.p.map((para, i) => <p key={i} className="text-sm md:text-[15px] text-zinc-300 leading-relaxed mb-2">{para}</p>)}
            </section>
          ))}
          <p className="text-sm text-zinc-400 border-t border-white/10 pt-4">
            Questions or requests: <a href={`mailto:${LEGAL_EMAIL}`} className="text-amber-400 font-semibold underline">{LEGAL_EMAIL}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
