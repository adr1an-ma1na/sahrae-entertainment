/**
 * Popup guard tests.
 *
 * The case that matters is the one that shipped broken: the Android shell locks
 * window.open with
 *
 *     Object.defineProperty(window, 'open',
 *       { value: noop, writable: false, configurable: false })
 *
 * and the app then assigned to it. Bundled ES modules are strict mode, where
 * assigning to a non-writable property THROWS instead of failing quietly. The
 * throw happened inside an effect, hit the error boundary, and replaced the
 * whole app with "Something went wrong" the instant anyone pressed Play — in the
 * APK only, because nothing locks the property on the web.
 *
 * So the first test below is the regression test for a bug that made the Android
 * app completely unusable while the PWA looked perfectly healthy.
 *
 * Run: node --experimental-strip-types popupguard-check.mjs
 */

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

/** A fresh window stand-in with a normal, writable open. */
function freshWindow() {
  const w = { open: function original() { return 'real-window'; } };
  globalThis.window = w;
  return w;
}

/** Lock open exactly the way the native shim does. */
function lockOpen(w) {
  const noop = () => null;
  Object.defineProperty(w, 'open', { value: noop, writable: false, configurable: false });
  return noop;
}

const load = async () => {
  // Fresh module each time so the import has no cached state.
  const m = await import('./src/services/popupGuard.ts?t=' + Math.random());
  return m.suppressPopups;
};

console.log('\nthe regression: a locked window.open must never throw');
{
  const w = freshWindow();
  const noop = lockOpen(w);
  const suppressPopups = await load();
  let threw = null, restore = null;
  try { restore = suppressPopups(() => {}); } catch (e) { threw = e; }
  ok('suppressPopups does not throw when open is non-writable',
    threw === null, threw && threw.message);
  ok('  the native no-op is left in place', w.open === noop);
  let threw2 = null;
  try { restore && restore(); } catch (e) { threw2 = e; }
  ok('  and restoring does not throw either', threw2 === null, threw2 && threw2.message);
  ok('  open is still the native no-op after restore', w.open === noop);
}

console.log('\nproof the old code WOULD have thrown (so the test is testing something)');
{
  'use strict';
  const w = freshWindow();
  lockOpen(w);
  let threw = null;
  try {
    // Exactly what PlayerModal used to do, in strict mode.
    (function () { 'use strict'; w.open = function () { return null; }; })();
  } catch (e) { threw = e; }
  ok('a direct assignment throws TypeError on a locked property',
    threw !== null && /read only|read-only|Cannot assign/i.test(threw.message),
    threw ? threw.message : 'did not throw');
}

console.log('\nnormal case: the guard actually guards');
{
  const w = freshWindow();
  const original = w.open;
  const suppressPopups = await load();
  const blocked = [];
  const restore = suppressPopups((args) => blocked.push(args));

  ok('window.open is replaced', w.open !== original);
  const result = w.open('https://ads.example/popunder', '_blank');
  ok('a popup attempt returns null instead of a window', result === null);
  ok('the caller is told, with the arguments', blocked.length === 1 && blocked[0][0].includes('popunder'));

  restore();
  ok('restore puts the original back', w.open === original);
  ok('  and it works again', w.open() === 'real-window');
}

console.log('\nnon-writable but still configurable — defineProperty must be used');
{
  const w = freshWindow();
  const original = w.open;
  Object.defineProperty(w, 'open', { value: original, writable: false, configurable: true });
  const suppressPopups = await load();
  let threw = null, restore = null;
  try { restore = suppressPopups(() => {}); } catch (e) { threw = e; }
  ok('no throw', threw === null, threw && threw.message);
  ok('the guard was installed anyway, via defineProperty', w.open !== original);
  restore();
  ok('and restored', w.open === original);
}

console.log('\na failing callback must not break the page');
{
  const w = freshWindow();
  const suppressPopups = await load();
  const restore = suppressPopups(() => { throw new Error('reporting blew up'); });
  let threw = null;
  try { w.open('https://x.test'); } catch (e) { threw = e; }
  ok('a throwing onBlocked is swallowed', threw === null, threw && threw.message);
  ok('  and the popup is still blocked', w.open('https://x.test') === null);
  restore();
}

console.log('\nheadless / no window');
{
  delete globalThis.window;
  const suppressPopups = await load();
  let threw = null, restore = null;
  try { restore = suppressPopups(() => {}); } catch (e) { threw = e; }
  ok('no window means no work and no exception', threw === null && typeof restore === 'function');
  ok('  calling restore is safe', (() => { try { restore(); return true; } catch { return false; } })());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
