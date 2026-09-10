/**
 * Suppress popups opened by our OWN document, without ever throwing.
 *
 * THE CRASH THIS EXISTS TO PREVENT
 * Two layers of this app both defend against popups, and they fought each other.
 * The Android shell injects ANTI_POPUP_SHIM into the top frame on every page
 * load, which locks the property down hard:
 *
 *     Object.defineProperty(window, 'open',
 *       { value: noop, writable: false, configurable: false });
 *
 * The player then did `window.open = fn`. Bundled ES modules are always strict
 * mode, and assigning to a non-writable property in strict mode THROWS rather
 * than failing quietly:
 *
 *     TypeError: Cannot assign to read only property 'open' of object '#<Window>'
 *
 * That threw inside an effect, hit the error boundary, and replaced the entire
 * app with "Something went wrong" the moment anyone pressed Play. Only in the
 * APK — on the web nothing locks the property, so the same code was fine, which
 * is exactly why the PWA looked healthy while the APK was unusable.
 *
 * WHY NOT JUST REMOVE THE NATIVE LOCK
 * Because the lock is the stronger defence and it is doing its job. It runs
 * before any page script and cannot be undone by an ad script that caches the
 * original. The right fix is for the weaker, in-document guard to notice it has
 * already been handled and stand down.
 *
 * SCOPE, honestly stated: this only affects code running in THIS document. An ad
 * inside an embed calls the IFRAME's window.open, which is cross-origin and
 * invisible from here. What actually stops those is the iframe `sandbox`
 * attribute (services/adShield.ts) and the native shim injected into the frame.
 */

type Blocked = (args: unknown[]) => void;

/** No-op restore, for when there is nothing to undo. */
const NOTHING = () => { /* nothing was changed */ };

/**
 * Replace window.open for as long as the returned function is not called.
 *
 * Returns a restore function in every case, so callers can use it as an effect
 * cleanup without checking anything. Never throws: a popup guard that crashes
 * the app is infinitely worse than a popup.
 */
export function suppressPopups(onBlocked: Blocked): () => void {
  if (typeof window === 'undefined') return NOTHING;

  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(window, 'open');
  } catch {
    return NOTHING;
  }

  // Already locked by the native shim. It replaced window.open with a no-op, so
  // popups from this document are ALREADY blocked — there is nothing to add and
  // any attempt to write would throw. Stand down.
  if (descriptor && descriptor.configurable === false && descriptor.writable === false) {
    return NOTHING;
  }

  const original = window.open;
  const replacement = function (this: unknown, ...args: unknown[]) {
    try { onBlocked(args); } catch { /* a reporting failure must not break this */ }
    return null;
  } as unknown as typeof window.open;

  // Prefer defineProperty: it works even when the property is non-writable but
  // still configurable, which a plain assignment cannot do.
  try {
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(window, 'open', {
        value: replacement,
        writable: true,
        configurable: true,
        enumerable: descriptor ? descriptor.enumerable : true,
      });
    } else if (descriptor.writable) {
      window.open = replacement;
    } else {
      return NOTHING;
    }
  } catch {
    return NOTHING; // locked down harder than advertised — leave it alone
  }

  return () => {
    try {
      if (descriptor && descriptor.configurable) {
        Object.defineProperty(window, 'open', descriptor);
      } else {
        window.open = original;
      }
    } catch { /* if we cannot restore it, leaving the no-op in place is harmless */ }
  };
}
