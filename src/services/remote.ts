import { useEffect, useRef, useState } from 'react';
import { openLink, type Link, type Peer } from './link';
import { makeCode, validCommand, validState, type Key, type RemoteCommand, type ScreenState } from './linkCore';

/**
 * Phone as the TV remote.
 *
 * The screen (the TV app, or any Sahrae showing its code) opens a link named
 * after a code it displays; the phone joins the same link by typing the code
 * or scanning the QR. The phone then sends key presses, searches typed on its
 * own keyboard, titles to open and server choices; the screen sends back what
 * it is showing. Keys are replayed into the TV's own D-pad navigation, so the
 * phone moves the same selection a remote would.
 */

const CHANNEL = (code: string) => `sahrae-remote:${code}`;
const CODE_KEY = 'sahrae.remoteCode.v1';

export type ScreenHandlers = {
  play: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean, season?: number, episode?: number) => void;
  search: (q: string) => void;
  navigate: (tab: string) => void;
};

let handlers: ScreenHandlers | null = null;
export function setScreenHandlers(h: ScreenHandlers) { handlers = h; }

// ── The screen ────────────────────────────────────────────────────────────────

let host: { code: string; link: Link } | null = null;
let lastState: ScreenState = { t: 'state' };
let phones: Peer[] = [];
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export function screenCode(): string {
  try {
    const saved = sessionStorage.getItem(CODE_KEY);
    if (saved) return saved;
    const c = makeCode();
    sessionStorage.setItem(CODE_KEY, c);
    return c;
  } catch { return makeCode(); }
}

const ARROWS: Record<string, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

function pressKey(k: Key) {
  if (ARROWS[k]) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ARROWS[k], bubbles: true, cancelable: true }));
    return;
  }
  if (k === 'ok') {
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body) a.click();
    else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    return;
  }
  if (k === 'back') {
    const back = (window as unknown as { __sahraeBack?: () => boolean }).__sahraeBack;
    if (!back?.()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return;
  }
  if (k === 'home') handlers?.navigate('home');
}

function act(cmd: RemoteCommand) {
  switch (cmd.t) {
    case 'key': pressKey(cmd.k); break;
    case 'search': handlers?.search(cmd.q); break;
    case 'open': handlers?.play(cmd.id, cmd.type, false, false, cmd.s, cmd.e); break;
    case 'server': window.dispatchEvent(new CustomEvent('sahrae:remote-server', { detail: cmd.idx })); break;
  }
}

/** Start answering phones. Idempotent. */
export function startScreen(): string {
  const code = screenCode();
  if (host?.code === code) return code;
  host?.link.close();
  const link = openLink(CHANNEL(code), { role: 'screen', name: 'Sahrae screen' }, {
    message: (ev, payload) => { if (ev === 'cmd') { const c = validCommand(payload); if (c) act(c); } },
    peers: (p) => {
      const before = phones.length;
      phones = p.filter((x) => x.role === 'phone');
      // A phone that has just arrived is told what is on screen.
      if (phones.length > before) link.send('state', lastState);
      changed();
    },
  }, ['cmd']);
  host = { code, link };
  return code;
}

/** What is on screen now; sent to any connected phone. */
export function reportScreen(s: Omit<ScreenState, 't'>) {
  lastState = { t: 'state', ...s };
  host?.link.send('state', lastState);
}

export function useScreen(active: boolean): { code: string | null; phones: number } {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  if (!active) return { code: host?.code ?? null, phones: phones.length };
  return { code: startScreen(), phones: phones.length };
}

// ── The phone ─────────────────────────────────────────────────────────────────

export type ControlStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'down';

export function useRemoteControl(code: string | null) {
  const [status, setStatus] = useState<ControlStatus>('idle');
  const [screen, setScreen] = useState<ScreenState | null>(null);
  const linkRef = useRef<Link | null>(null);
  useEffect(() => {
    setScreen(null);
    if (!code) { setStatus('idle'); return; }
    let seen = false;
    const link = openLink(CHANNEL(code), { role: 'phone', name: 'Phone' }, {
      message: (ev, payload) => { if (ev === 'state') { const s = validState(payload); if (s) setScreen(s); } },
      peers: (p) => { seen = p.some((x) => x.role === 'screen'); setStatus(seen ? 'connected' : 'waiting'); },
      status: (s) => setStatus(s === 'live' ? (seen ? 'connected' : 'waiting') : s === 'connecting' ? 'connecting' : 'down'),
    }, ['state']);
    linkRef.current = link;
    return () => { link.close(); linkRef.current = null; };
  }, [code]);
  const send = (cmd: RemoteCommand) => linkRef.current?.send('cmd', cmd);
  return { status, screen, send };
}
