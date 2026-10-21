import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Home, MonitorSmartphone, Search, Smartphone, Tv, X } from 'lucide-react';
import { useRemoteControl, useScreen } from '../services/remote';
import { normalizeCode, type Key } from '../services/linkCore';
import { linkAvailable } from '../services/link';
import { isTelevision } from '../tv/spatialNavigation';
import { haptics } from '../services/haptics';

/**
 * The phone remote, both ends.
 *   On a TV (or a laptop asked to show it): the pairing code, a QR code to
 *     scan, and how many phones are connected.
 *   On a phone: enter or scan the code, then a D-pad, OK and Back, a search
 *     box typed on the phone's own keyboard, and what is on the TV with its
 *     servers, so the server can be switched from the sofa.
 * Opened from the top bar, or by a ?remote=CODE link (the QR code).
 */

const PUBLIC_URL = 'https://adr1an-ma1na.github.io/sahrae-entertainment/';
export const OPEN_REMOTE = 'sahrae:open-remote';

function Qr({ text }: { text: string }) {
  const cells = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n, d };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${cells.n + 4} ${cells.n + 4}`} className="w-48 h-48 rounded-xl bg-white" role="img" aria-label="QR code to pair your phone">
      <path d={cells.d} fill="#000" />
    </svg>
  );
}

function ScreenSide({ onClose }: { onClose: () => void }) {
  const { code, phones } = useScreen(true);
  const link = code ? `${PUBLIC_URL}?remote=${code}` : '';
  return (
    <div className="flex flex-col items-center text-center gap-5">
      <MonitorSmartphone className="w-10 h-10 text-amber-400" />
      <div>
        <h2 className="text-2xl font-bold text-white">Use your phone as the remote</h2>
        <p className="text-sm text-zinc-400 mt-1 max-w-md">Scan this with your phone's camera, or open Sahrae on the phone, tap the remote button at the top and type the code.</p>
      </div>
      {code && <Qr text={link} />}
      <p className="text-4xl font-mono font-extrabold tracking-[0.35em] text-white" aria-label={`Code ${code?.split('').join(' ')}`}>{code}</p>
      <p className={`text-sm font-semibold ${phones ? 'text-emerald-400' : 'text-zinc-400'}`}>
        {phones ? `${phones} phone${phones > 1 ? 's' : ''} connected` : 'Waiting for a phone…'}
      </p>
      <button onClick={onClose} data-tv-focusable data-tv-autofocus className="px-6 py-2.5 rounded-full bg-white text-black font-bold">Done</button>
    </div>
  );
}

function PadButton({ k, send, children, label, className = '' }: { k: Key; send: (k: Key) => void; children: React.ReactNode; label: string; className?: string }) {
  return (
    <button onClick={() => send(k)} aria-label={label}
      className={`grid place-items-center rounded-2xl bg-zinc-800 border border-white/10 text-white active:scale-95 active:bg-zinc-700 transition-transform ${className}`}>
      {children}
    </button>
  );
}

function PhoneSide({ initialCode, onShowCode }: { initialCode: string; onShowCode: () => void }) {
  const [typed, setTyped] = useState(initialCode);
  const [code, setCode] = useState<string | null>(normalizeCode(initialCode));
  const [query, setQuery] = useState('');
  const { status, screen, send } = useRemoteControl(code);
  const press = (k: Key) => { haptics.tap(); send({ t: 'key', k }); };

  if (!code || status === 'idle') {
    const valid = normalizeCode(typed);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3"><Smartphone className="w-7 h-7 text-amber-400" /><h2 className="text-xl font-bold text-white">Control a TV</h2></div>
        <p className="text-sm text-zinc-400">On the TV, open Sahrae and choose <b>Pair phone</b> at the top. Type the code it shows.</p>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Code, e.g. K7Q2MX" maxLength={8} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          className="w-full text-center text-3xl font-mono font-bold tracking-[0.3em] uppercase bg-zinc-900 border border-zinc-700 rounded-xl py-3 text-white outline-none focus:border-amber-400" />
        <button disabled={!valid} onClick={() => setCode(valid)} className="py-3 rounded-full bg-amber-400 text-amber-950 font-bold disabled:opacity-40">Connect</button>
        <button onClick={onShowCode} className="text-xs text-zinc-400 underline self-center">Show a code on this screen instead</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Tv className="w-5 h-5 text-amber-400" /><span className="font-bold text-white">TV {code}</span></div>
        <span className={`text-xs font-semibold ${status === 'connected' ? 'text-emerald-400' : status === 'down' ? 'text-red-400' : 'text-zinc-400'}`}>
          {status === 'connected' ? 'Connected' : status === 'waiting' ? 'Looking for the TV…' : status === 'down' ? 'Not connected' : 'Connecting…'}
        </span>
      </div>

      {screen?.title && (
        <div className="rounded-xl bg-zinc-900 border border-white/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">On the TV</p>
          <p className="text-white font-semibold truncate">{screen.title}{screen.type === 'tv' && screen.s ? ` · S${screen.s} E${screen.e}` : ''}</p>
          {screen.servers && screen.servers.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto mt-2 pb-1">
              {screen.servers.map((name, i) => (
                <button key={i} onClick={() => { haptics.tap(); send({ t: 'server', idx: i }); }}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${screen.server === i ? 'bg-amber-400 text-amber-950 border-amber-300' : 'bg-zinc-800 text-zinc-200 border-zinc-700'}`}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (query.trim()) { send({ t: 'search', q: query.trim() }); haptics.tap(); setQuery(''); } }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search on the TV" enterKeyHint="search"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2.5 text-white outline-none focus:border-amber-400" />
        <button type="submit" aria-label="Search" className="w-11 h-11 grid place-items-center rounded-full bg-amber-400 text-amber-950"><Search className="w-5 h-5" /></button>
      </form>

      <div className="grid grid-cols-3 gap-3 w-64 self-center mt-2">
        <div />
        <PadButton k="up" send={press} label="Up" className="h-16"><ChevronUp className="w-8 h-8" /></PadButton>
        <div />
        <PadButton k="left" send={press} label="Left" className="h-16"><ChevronLeft className="w-8 h-8" /></PadButton>
        <PadButton k="ok" send={press} label="OK" className="h-16 !bg-amber-400 !text-amber-950 font-extrabold text-lg">OK</PadButton>
        <PadButton k="right" send={press} label="Right" className="h-16"><ChevronRight className="w-8 h-8" /></PadButton>
        <div />
        <PadButton k="down" send={press} label="Down" className="h-16"><ChevronDown className="w-8 h-8" /></PadButton>
        <div />
      </div>
      <div className="flex gap-3 justify-center">
        <PadButton k="back" send={press} label="Back" className="h-12 w-28 flex gap-1"><span className="flex items-center gap-1.5 text-sm font-semibold"><ArrowLeft className="w-4 h-4" />Back</span></PadButton>
        <PadButton k="home" send={press} label="Home" className="h-12 w-28"><span className="flex items-center gap-1.5 text-sm font-semibold"><Home className="w-4 h-4" />Home</span></PadButton>
      </div>
      <button onClick={() => setCode(null)} className="text-xs text-zinc-400 underline self-center">Connect to a different TV</button>
    </div>
  );
}

export default function RemotePanel() {
  const [open, setOpen] = useState<null | 'screen' | 'phone'>(null);
  const [initialCode, setInitialCode] = useState('');

  useEffect(() => {
    // A scanned QR code lands here with ?remote=CODE.
    try {
      const p = new URLSearchParams(window.location.search);
      const c = p.get('remote');
      if (c) {
        setInitialCode(c);
        setOpen('phone');
        p.delete('remote');
        const q = p.toString();
        window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash);
      }
    } catch { /* no URL to read */ }
    const onOpen = () => setOpen(isTelevision() ? 'screen' : 'phone');
    window.addEventListener(OPEN_REMOTE, onOpen);
    return () => window.removeEventListener(OPEN_REMOTE, onOpen);
  }, []);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Phone remote">
      <div className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <button onClick={() => setOpen(null)} aria-label="Close" data-tv-focusable className="absolute top-4 right-4 text-zinc-400 hover:text-white"><X className="w-6 h-6" /></button>
        {!linkAvailable()
          ? <p className="text-zinc-300">The remote needs an internet connection to Sahrae's link service, which is not available here.</p>
          : open === 'screen' ? <ScreenSide onClose={() => setOpen(null)} /> : <PhoneSide initialCode={initialCode} onShowCode={() => setOpen('screen')} />}
      </div>
    </div>
  );
}
