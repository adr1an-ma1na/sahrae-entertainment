import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { consentDecided, saveConsent, openLegal, CONSENT_CHANGE } from '../services/consent';
import { useAuth } from '../hooks/useAuth';

/**
 * The first-visit privacy choice (Cookies & storage). Two equal buttons, no
 * pre-ticked boxes: "Essential only" is as easy as "Allow", as the GDPR and
 * Kenya's Data Protection Act expect. Asked again only when the legal pages
 * change. Shown on the sign-in screen too, before anything optional is shared.
 */
export default function ConsentBanner() {
  const [open, setOpen] = useState(() => !consentDecided());
  const { user } = useAuth();

  useEffect(() => {
    const sync = () => setOpen(!consentDecided());
    window.addEventListener(CONSENT_CHANGE, sync);
    return () => window.removeEventListener(CONSENT_CHANGE, sync);
  }, []);

  // The sign-in page keeps clear room for it at the bottom (SignInGate).
  useEffect(() => {
    document.documentElement.classList.toggle('consent-open', open);
    return () => document.documentElement.classList.remove('consent-open');
  }, [open]);

  if (!open) return null;
  const choose = (share: boolean) => { saveConsent(share); setOpen(false); };

  return (
    <div role="dialog" aria-label="Your privacy choices" data-tv-layer data-tv-noring={user ? undefined : true}
      // A small card in a corner, not a band across the screen: on the sign-in
      // page it sat over the form (owner, 2026-11-11). Signed out it takes the
      // left corner, away from the form on the right; inside the app, the right.
      className={`dark ${user ? '' : 'quiet-focus'} fixed bottom-0 z-[290] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none inset-x-0 md:inset-x-auto ${user ? 'md:right-0' : 'md:left-0'}`}>
      <div className="pointer-events-auto md:w-[22rem] rounded-2xl bg-zinc-900/95 border border-white/10 shadow-2xl p-3 md:p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-amber-400/15 text-amber-300"><Cookie className="w-4 h-4" /></span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Your privacy choices</p>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              {/* Short on a phone, where the full text covered the Sign in button. */}
              <span className="md:hidden">No advertising cookies. Share anonymous notes of which server played, so others start on one that works?{' '}</span>
              <span className="hidden md:inline">
                Sahrae keeps only what it needs on your device and has no advertising or analytics cookies of its own.
                With your yes it shares anonymous notes of which server played, so others start on one that works.
                Players from other services may set their own cookies.{' '}
              </span>
              <button onClick={() => openLegal('cookies')} data-tv-focusable className="text-amber-400 font-semibold underline">Cookies</button>
              {' · '}
              <button onClick={() => openLegal('privacy')} data-tv-focusable className="text-amber-400 font-semibold underline">Privacy</button>
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-2.5 md:mt-3">
          <button onClick={() => choose(false)} data-tv-focusable className="flex-1 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold">Essential only</button>
          <button onClick={() => choose(true)} data-tv-focusable data-tv-autofocus className="flex-1 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold">Allow reports</button>
        </div>
      </div>
    </div>
  );
}
