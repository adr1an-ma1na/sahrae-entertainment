import { useEffect, useState } from 'react';
import { openLink, type Link, type Peer } from './link';
import { makeCode, normalizeCode, validRoomMessage, type RoomChat, type RoomNow } from './linkCore';

/**
 * Watch together: a room friends join from a link, wherever they are.
 *
 * The host's player says what it is playing (title, episode, server); a guest
 * who joins opens the same, on the same server. Everyone in the room sees who
 * is there, can chat and send reactions, and anyone can start a short
 * countdown so all press play at the same moment.
 *
 * The players are other sites' pages, so the app cannot press play or pause
 * inside them for everyone; the countdown is the honest way to start
 * together. Messages go device to device (link.ts) and are not stored.
 */

const CHANNEL = (code: string) => `sahrae-room:${code}`;
const NAME_KEY = 'sahrae.partyName.v1';
export const PUBLIC_URL = 'https://adr1an-ma1na.github.io/sahrae-entertainment/';
const MAX_CHAT = 80;

export type Floating = { id: number; emoji: string; name: string };

type State = {
  code: string | null;
  host: boolean;
  status: 'idle' | 'connecting' | 'live' | 'down';
  peers: Peer[];
  now: RoomNow | null;
  chat: RoomChat[];
  floating: Floating[];
  /** When the shared countdown reaches zero, ms since epoch on this device. */
  countdownEnd: number | null;
  countdownBy: string | null;
};

let state: State = { code: null, host: false, status: 'idle', peers: [], now: null, chat: [], floating: [], countdownEnd: null, countdownBy: null };
let link: Link | null = null;
let myNow: RoomNow | null = null;
let floatId = 0;
const listeners = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((f) => f()); };

/** Handed in by the app: how a guest opens what the room is watching. */
let openForGuest: ((now: RoomNow) => void) | null = null;
export function setRoomOpener(f: (now: RoomNow) => void) { openForGuest = f; }

export function partyName(): string {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
export function setPartyName(n: string) {
  try { localStorage.setItem(NAME_KEY, n.trim().slice(0, 24)); } catch { /* the name still applies now */ }
}
const myName = () => partyName() || 'Guest';

function join(code: string, host: boolean) {
  link?.close();
  set({ code, host, status: 'connecting', peers: [], now: host ? myNow : null, chat: [], floating: [], countdownEnd: null, countdownBy: null });
  let count = 0;
  link = openLink(CHANNEL(code), { role: host ? 'host' : 'guest', name: myName() }, {
    message: (ev, payload) => {
      const m = validRoomMessage(payload);
      if (!m) return;
      if (m.t === 'now') {
        set({ now: m });
        if (!state.host) openForGuest?.(m);
      } else if (m.t === 'chat') {
        set({ chat: [...state.chat, m].slice(-MAX_CHAT) });
      } else if (m.t === 'react') {
        float(m.emoji, m.name);
      } else if (m.t === 'countdown') {
        set({ countdownEnd: Date.now() + m.inMs, countdownBy: m.name });
      }
    },
    peers: (p) => {
      set({ peers: p });
      // Someone new: tell them what we are watching.
      if (p.length > count && state.host && myNow) link?.send('room', myNow);
      count = p.length;
    },
    status: (s) => set({ status: s === 'live' ? 'live' : s }),
  }, ['room']);
}

function float(emoji: string, name: string) {
  const id = ++floatId;
  set({ floating: [...state.floating, { id, emoji, name }].slice(-12) });
  setTimeout(() => set({ floating: state.floating.filter((f) => f.id !== id) }), 3500);
}

/** Start a room for what this player is showing. Returns the share link. */
export function startRoom(): string {
  const code = makeCode();
  join(code, true);
  return roomLink(code);
}

export const roomLink = (code: string) => `${PUBLIC_URL}?room=${code}`;

export function joinRoom(input: string): boolean {
  const code = normalizeCode(input);
  if (!code) return false;
  join(code, false);
  return true;
}

export function leaveRoom() {
  link?.close();
  link = null;
  set({ code: null, host: false, status: 'idle', peers: [], now: null, chat: [], floating: [], countdownEnd: null, countdownBy: null });
}

/** The host's player: what it is playing now, shared with the room. */
export function reportRoomNow(now: Omit<RoomNow, 't'> | null) {
  myNow = now ? { t: 'now', ...now } : null;
  if (state.code && state.host && myNow) {
    set({ now: myNow });
    link?.send('room', myNow);
  } else {
    listeners.forEach((f) => f());
  }
}

/** The title this device's player is showing, if any. */
export const playingTitle = () => myNow?.title || null;

export function sendChat(text: string) {
  const m = validRoomMessage({ t: 'chat', name: myName(), text, at: Date.now() });
  if (!m || m.t !== 'chat') return;
  link?.send('room', m);
  set({ chat: [...state.chat, m].slice(-MAX_CHAT) });
}

export function sendReaction(emoji: string) {
  const m = validRoomMessage({ t: 'react', name: myName(), emoji });
  if (!m || m.t !== 'react') return;
  link?.send('room', m);
  float(m.emoji, m.name);
}

export function startCountdown(seconds = 5) {
  const m = validRoomMessage({ t: 'countdown', inMs: seconds * 1000, name: myName() });
  if (!m || m.t !== 'countdown') return;
  link?.send('room', m);
  set({ countdownEnd: Date.now() + m.inMs, countdownBy: 'You' });
}

export function useRoom(): State {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return state;
}
