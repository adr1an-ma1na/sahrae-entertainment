import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';

/**
 * A live link between devices over Supabase Realtime broadcast: no table, no
 * sign-in, messages go device to device through the channel and are not
 * stored. Presence says who is on the other end. The phone remote and watch
 * together both run on this.
 *
 * A channel name is a random code, so only someone shown it can join; every
 * message is checked by the receiver (linkCore.ts) before it does anything.
 */

export type Peer = { id: string; role: string; name: string };

export type Link = {
  send: (event: string, payload: unknown) => void;
  close: () => void;
};

const me = (() => {
  try {
    const k = 'sahrae.linkId.v1';
    const v = sessionStorage.getItem(k) || Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem(k, v);
    return v;
  } catch { return Math.random().toString(36).slice(2, 12); }
})();

export const linkAvailable = () => !!supabase;

export function openLink(
  name: string,
  self: { role: string; name: string },
  on: {
    message: (event: string, payload: unknown) => void;
    peers?: (peers: Peer[]) => void;
    status?: (s: 'connecting' | 'live' | 'down') => void;
  },
  events: string[],
): Link {
  if (!supabase) {
    on.status?.('down');
    return { send: () => {}, close: () => {} };
  }
  on.status?.('connecting');
  const ch: RealtimeChannel = supabase.channel(name, { config: { broadcast: { self: false }, presence: { key: me } } });
  for (const ev of events) ch.on('broadcast', { event: ev }, (p) => on.message(ev, p.payload));
  const peers = () => {
    const st = ch.presenceState() as Record<string, { role?: string; name?: string }[]>;
    on.peers?.(Object.entries(st).filter(([id]) => id !== me).map(([id, metas]) => ({ id, role: String(metas[0]?.role || ''), name: String(metas[0]?.name || '') })));
  };
  ch.on('presence', { event: 'sync' }, peers);
  let closed = false;
  ch.subscribe(async (s) => {
    if (closed) return;
    if (s === 'SUBSCRIBED') {
      on.status?.('live');
      try { await ch.track(self); } catch { /* presence is a nicety */ }
    } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
      on.status?.('down');
    }
  });
  return {
    send: (event, payload) => { if (!closed) void ch.send({ type: 'broadcast', event, payload }); },
    close: () => { closed = true; void supabase!.removeChannel(ch); },
  };
}
