/**
 * Theme tokens: contrast and completeness.
 *
 * The three themes are defined only as CSS variables, which means a wrong value
 * shows up as unreadable text on someone's phone rather than as a build error.
 * This reads the real stylesheet — not a copy of the numbers — and checks the
 * pairs the app actually puts on screen against WCAG AA (4.5:1).
 *
 * Run: node theme-check.mjs
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./src/index.css', import.meta.url), 'utf8');

/** Variables declared inside one selector block, e.g. `.dark { ... }`. */
function block(selector) {
  // Anchored to the start of a line, so `.midnight {` does not match the tail
  // of a grouped rule such as `:root, .dark, .midnight {`.
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = new RegExp(`^[ \\t]*${esc} \\{`, 'm').exec(css);
  if (!hit) throw new Error(`no block for ${selector}`);
  const start = hit.index;
  let depth = 0, i = css.indexOf('{', start), end = i;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) { end = i; break; }
  }
  const out = {};
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const themes = {
  Sand: block(':root'),
  Obsidian: block('.dark'),
  Cosmic: block('.midnight'),
};
// `amber-700` and the text on it live in @theme, shared by all three.
const theme = block('@theme');

const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [hi, lo] = L(a) > L(b) ? [L(a), L(b)] : [L(b), L(a)]; return (hi + 0.05) / (lo + 0.05); };

let pass = 0, fail = 0;
const atLeast = (name, fg, bg, min = 4.5) => {
  if (!/^#[0-9a-f]{6}$/i.test(fg || '') || !/^#[0-9a-f]{6}$/i.test(bg || '')) {
    fail++; console.log(`  FAIL ${name} — not a plain hex (${fg} on ${bg})`); return;
  }
  const r = ratio(fg, bg);
  if (r >= min) { pass++; console.log(`  ok   ${name.padEnd(34)} ${r.toFixed(2)}:1`); }
  else { fail++; console.log(`  FAIL ${name.padEnd(34)} ${r.toFixed(2)}:1, needs ${min}:1`); }
};

for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`);
  // Every theme must define its own copy of these, or it inherits another
  // theme's accent and silently looks wrong.
  for (const key of ['--zinc-950', '--zinc-800', '--zinc-500', '--zinc-100', '--white', '--black',
    '--gold-400', '--gold-500', '--on-gold', '--glare-1', '--glare-2', '--glass-alpha']) {
    if (!t[key]) { fail++; console.log(`  FAIL missing ${key}`); }
  }
  atLeast('muted body text on the page', t['--zinc-500'], t['--zinc-950']);
  atLeast('primary text on the page', t['--zinc-100'], t['--zinc-950']);
  atLeast('primary text on a container', t['--zinc-100'], t['--zinc-800']);
  atLeast('accent text on the page', t['--gold-400'], t['--zinc-950']);
  atLeast('accent text on a container', t['--gold-400'], t['--zinc-800']);
  atLeast('label on a gold fill', t['--on-gold'], t['--gold-500']);
  // `text-white` is written literally all over the app; in a light theme it is
  // remapped to dark ink, and this is the check that it really was.
  atLeast('text-white on the page', t['--white'], t['--zinc-950']);
  atLeast('cream on the bronze container', theme['--color-amber-100'], theme['--color-amber-700']);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
