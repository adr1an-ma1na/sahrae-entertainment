/**
 * The pure half of device links (phone remote, watch together): pairing
 * codes and the messages devices may send each other. No network, so it is
 * testable alone (link-check.mjs).
 *
 * Anything that arrives over a link came from another device and is checked
 * here before it can do anything: an unknown message, a bad id or an
 * oversized text is dropped, never acted on.
 */

/** No 0/O, 1/I/L: a code read off a TV across a room should not be misread. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function makeCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return s;
}

/** What a viewer typed, as a code: upper case, spaces and dashes dropped. Null if it cannot be one. */
export function normalizeCode(input: string): string | null {
  const s = String(input || '').toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export type Key = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'home';
const KEYS: Key[] = ['up', 'down', 'left', 'right', 'ok', 'back', 'home'];

/** Phone to TV. */
export type RemoteCommand =
  | { t: 'key'; k: Key }
  | { t: 'search'; q: string }
  | { t: 'open'; type: 'movie' | 'tv'; id: number; s?: number; e?: number }
  | { t: 'server'; idx: number };

/** TV to phone: what is on screen. */
export type ScreenState = {
  t: 'state';
  title?: string;
  type?: 'movie' | 'tv';
  id?: number;
  s?: number;
  e?: number;
  servers?: string[];
  server?: number;
  view?: string;
};

const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

export function validCommand(x: unknown): RemoteCommand | null {
  if (!x || typeof x !== 'object') return null;
  const m = x as Record<string, unknown>;
  switch (m.t) {
    case 'key': return KEYS.includes(m.k as Key) ? { t: 'key', k: m.k as Key } : null;
    case 'search': return typeof m.q === 'string' && m.q.trim().length > 0 && m.q.length <= 100 ? { t: 'search', q: m.q.trim() } : null;
    case 'open':
      if ((m.type !== 'movie' && m.type !== 'tv') || !isInt(m.id, 1, 99_999_999)) return null;
      if (m.type === 'tv' && (m.s != null && !isInt(m.s, 0, 999) || m.e != null && !isInt(m.e, 1, 9999))) return null;
      return { t: 'open', type: m.type, id: m.id, ...(m.type === 'tv' ? { s: (m.s as number) ?? 1, e: (m.e as number) ?? 1 } : {}) };
    case 'server': return isInt(m.idx, 0, 20) ? { t: 'server', idx: m.idx } : null;
    default: return null;
  }
}

export function validState(x: unknown): ScreenState | null {
  if (!x || typeof x !== 'object' || (x as { t?: unknown }).t !== 'state') return null;
  const m = x as Record<string, unknown>;
  const out: ScreenState = { t: 'state' };
  if (typeof m.title === 'string') out.title = m.title.slice(0, 120);
  if (m.type === 'movie' || m.type === 'tv') out.type = m.type;
  if (isInt(m.id, 1, 99_999_999)) out.id = m.id;
  if (isInt(m.s, 0, 999)) out.s = m.s;
  if (isInt(m.e, 1, 9999)) out.e = m.e;
  if (Array.isArray(m.servers)) out.servers = m.servers.filter((s) => typeof s === 'string').slice(0, 12).map((s) => (s as string).slice(0, 60));
  if (isInt(m.server, 0, 20)) out.server = m.server;
  if (typeof m.view === 'string') out.view = m.view.slice(0, 30);
  return out;
}

// ── Watch together ────────────────────────────────────────────────────────────

/** What a room is watching, set by its host. */
export type RoomNow = { t: 'now'; type: 'movie' | 'tv'; id: number; s?: number; e?: number; server: string; title: string };
export type RoomChat = { t: 'chat'; name: string; text: string; at: number };
export type RoomReact = { t: 'react'; name: string; emoji: string };
/**
 * "Press play together": everyone counts down from when the message arrives.
 * Relative on purpose: phones' clocks often differ by seconds, while the
 * message itself arrives within a fraction of one.
 */
export type RoomCountdown = { t: 'countdown'; inMs: number; name: string };

export const REACTIONS = ['😂', '😮', '🔥', '😢', '❤️', '👏'];

export function validRoomMessage(x: unknown): RoomNow | RoomChat | RoomReact | RoomCountdown | null {
  if (!x || typeof x !== 'object') return null;
  const m = x as Record<string, unknown>;
  const name = typeof m.name === 'string' ? m.name.trim().slice(0, 24) : '';
  switch (m.t) {
    case 'now':
      if ((m.type !== 'movie' && m.type !== 'tv') || !isInt(m.id, 1, 99_999_999) || typeof m.server !== 'string' || !/^[a-z0-9]{2,20}$/.test(m.server)) return null;
      return { t: 'now', type: m.type, id: m.id, server: m.server, title: typeof m.title === 'string' ? m.title.slice(0, 120) : '',
        ...(m.type === 'tv' ? { s: isInt(m.s, 0, 999) ? m.s : 1, e: isInt(m.e, 1, 9999) ? m.e : 1 } : {}) };
    case 'chat':
      if (!name || typeof m.text !== 'string' || !m.text.trim() || m.text.length > 300) return null;
      return { t: 'chat', name, text: m.text.trim(), at: typeof m.at === 'number' ? m.at : Date.now() };
    case 'react':
      return name && REACTIONS.includes(m.emoji as string) ? { t: 'react', name, emoji: m.emoji as string } : null;
    case 'countdown':
      // Between 3 and 10 seconds: enough to reach the play button, short enough to stay together.
      return isInt(m.inMs, 3000, 10_000) ? { t: 'countdown', inMs: m.inMs as number, name: name || 'Someone' } : null;
    default:
      return null;
  }
}
