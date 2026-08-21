/**
 * Handoff from the voice assistant to a view that owns its own state.
 *
 * "Watch Sky News" has to do two things: navigate to Live TV, and tell that view
 * which channel to open. The assistant can do the first (App owns the tab) but
 * not the second, because `active` lives inside LiveTVView.
 *
 * Handles BOTH orderings, which a mount-only version got wrong:
 *
 *  • Not on Live TV yet — the request is parked, and the view claims it when it
 *    mounts a moment later.
 *  • Already on Live TV — the view is subscribed, so the request is delivered
 *    immediately. A mount-only handoff silently did nothing here, because the
 *    mount effect had already run.
 *
 * Single-slot and delivered once, so a stale request can never reopen a channel
 * the user didn't just ask for.
 */

type Handler = (channelName: string) => void;

let pending: string | null = null;
let handler: Handler | null = null;

export function requestChannel(name: string) {
  if (handler) handler(name);
  else pending = name;
}

/** Subscribe the live view; immediately drains a request made before mount. */
export function onChannelRequest(h: Handler): () => void {
  handler = h;
  if (pending !== null) {
    const p = pending;
    pending = null;
    // Defer so the subscriber isn't asked to set state during its own effect.
    setTimeout(() => h(p), 0);
  }
  return () => {
    if (handler === h) handler = null;
  };
}
