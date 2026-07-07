import { useState } from 'react';
import { X, Lightbulb } from 'lucide-react';

/**
 * A one-time contextual hint (just-in-time teaching). Shows once per `id`
 * (remembered in localStorage), then never again — so the app explains a gesture
 * or feature the first time it's relevant, instead of an upfront tour.
 */
export default function Coachmark({ id, text, className = '' }: { id: string; text: string; className?: string }) {
  const key = `sahrae.coach.${id}`;
  const [show, setShow] = useState(() => { try { return localStorage.getItem(key) !== '1'; } catch { return false; } });
  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } setShow(false); };
  return (
    <div className={`relative flex items-center gap-2.5 glass rounded-2xl pl-3.5 pr-2 py-2.5 mb-5 max-w-xl animate-in fade-in slide-in-from-top-2 duration-300 ${className}`}>
      <span className="w-7 h-7 rounded-full bg-sauti/15 flex items-center justify-center shrink-0"><Lightbulb className="w-4 h-4 text-sauti" /></span>
      <span className="text-sm text-zinc-200 flex-1 leading-snug">{text}</span>
      <button onClick={dismiss} aria-label="Got it" className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
