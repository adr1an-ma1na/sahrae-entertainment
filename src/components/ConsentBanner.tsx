import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { consentDecided, saveConsent, openLegal, CONSENT_CHANGE } from '../services/consent';

/**
 * The first-visit privacy choice (Cookies & storage). Two equal buttons, no
 * pre-ticked boxes: "Essential only" is as easy as "Allow", as the GDPR and
 * Kenya's Data Protection Act expect. Asked again only when the legal pages
 * change. Shown on the sign-in screen too, before anything optional is shared.
 */
export default function ConsentBanner() {
  const [open, setOpen] = useState(() => !consentDecided());

  useEffect(() => {
    const sync = () => setOpen(!consentDecided());
    window.addEventListener(CONSENT_CHANGE, sync);
    return () => window.removeEventListener(CONSENT_CHANGE, sync);
  }, []);

  if (!open) return null;
  const choose = (share: boolean) => { saveConsent(share); setOpen(false); };

  return (
    <div role="dialog" aria-label="Your privacy choices" data-tv-layer
      className="dark fixed inset-x-0 bottom-0 z-[290] p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-amber-400/15 text-amber-300"><Cookie className="w-5 h-5" /></span>
          <div className="min-w-0">
            <p className="font-bold text-white">Your privacy choices</p>
            <p className="text-sm text-zinc-300 mt-1 leading-relaxed">
              Sahrae keeps what it needs on your device to sign you in and keep your library. It uses no advertising or analytics cookies of its own.
              With your permission, it also shares anonymous notes of which server played a title, so others start on one that works.
              Players from other services may set their own cookies when you press play.{' '}
              <button onClick={() => openLegal('cookies')} data-tv-focusable className="text-amber-400 font-semibold underline">Cookies &amp; storage</button>
              {' · '}
              <button onClick={() => openLegal('privacy')} data-tv-focusable className="text-amber-400 font-semibold underline">Privacy Policy</button>
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end mt-4">
          <button onClick={() => choose(false)} data-tv-focusable className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold">Essential only</button>
          <button onClick={() => choose(true)} data-tv-focusable data-tv-autofocus className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold">Allow server reports</button>
        </div>
      </div>
    </div>
  );
}
