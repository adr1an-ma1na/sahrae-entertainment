/**
 * Geometry tests for the TV D-pad picker.
 *
 * Mirrors pickInDirection() from src/tv/spatialNavigation.ts against a layout
 * shaped like the real app: a sidebar, stacked horizontal poster rails, and a
 * bottom row. These are the moves a remote makes constantly, and the failure
 * they catch — diagonal drift between rails — is what makes D-pad navigation
 * feel unusable.
 */
function pickInDirection(current, dir, candidates) {
  const c = current.rect;
  const horizontal = dir === 'left' || dir === 'right';
  let bestAligned = null, bestAlignedDist = Infinity, bestAlignedOverlap = -1;
  let bestLoose = null, bestLooseScore = Infinity;

  for (const el of candidates) {
    if (el === current) continue;
    const r = el.rect;
    let primary;
    switch (dir) {
      case 'right': if (r.left < c.right - 2) continue; primary = r.left - c.right; break;
      case 'left':  if (r.right > c.left + 2) continue; primary = c.left - r.right; break;
      case 'down':  if (r.top < c.bottom - 2) continue; primary = r.top - c.bottom; break;
      default:      if (r.bottom > c.top + 2) continue; primary = c.top - r.bottom; break;
    }
    if (primary < 0) primary = 0;
    const overlap = horizontal
      ? Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top)
      : Math.min(c.right, r.right) - Math.max(c.left, r.left);
    if (overlap > 0) {
      const nearer = primary < bestAlignedDist - 1;
      const tied = primary <= bestAlignedDist + 1 && overlap > bestAlignedOverlap;
      if (nearer || tied) { bestAlignedDist = primary; bestAlignedOverlap = overlap; bestAligned = el; }
    } else if (!bestAligned) {
      const cross = horizontal
        ? Math.abs((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2)
        : Math.abs((r.left + r.right) / 2 - (c.left + c.right) / 2);
      const score = primary + cross * 2;
      if (score < bestLooseScore) { bestLooseScore = score; bestLoose = el; }
    }
  }
  return bestAligned || bestLoose;
}

const box = (id, left, top, w, h) => ({ id, rect: { left, top, right: left + w, bottom: top + h } });

// A 1920x1080 TV layout: 256px sidebar, two poster rails, a bottom action row.
// Posters are 200x300 with 20px gutters; rail 2 is deliberately offset so a
// centre-distance algorithm would drift diagonally into it.
const els = [
  box('nav-home',   0,  200, 256, 56),
  box('nav-movies', 0,  270, 256, 56),
  box('nav-series', 0,  340, 256, 56),

  box('r1c1', 300, 200, 200, 300),
  box('r1c2', 520, 200, 200, 300),
  box('r1c3', 740, 200, 200, 300),

  box('r2c1', 360, 560, 200, 300),   // offset right by 60px vs rail 1
  box('r2c2', 580, 560, 200, 300),
  box('r2c3', 800, 560, 200, 300),

  box('btn-a', 300, 940, 150, 50),
  box('btn-b', 470, 940, 150, 50),
];
const byId = (id) => els.find((e) => e.id === id);

let pass = 0, fail = 0;
const check = (from, dir, want) => {
  const got = pickInDirection(byId(from), dir, els);
  const gotId = got ? got.id : null;
  if (gotId === want) { pass++; console.log(`  ok   ${from} + ${dir.padEnd(5)} -> ${gotId}`); }
  else { fail++; console.log(`  FAIL ${from} + ${dir.padEnd(5)} -> ${gotId}, want ${want}`); }
};

console.log('\n[along a rail]');
check('r1c1', 'right', 'r1c2');
check('r1c2', 'right', 'r1c3');
check('r1c3', 'left',  'r1c2');
check('r1c1', 'left',  'nav-home');   // off the rail → into the sidebar

console.log('\n[between rails — the diagonal-drift case]');
// r1c1 spans x 300-500. r2c1 spans 360-560 (overlaps), r2c2 spans 580-780 (no overlap).
// Centre-distance alone would have been tempted by r2c2; overlap must win.
check('r1c1', 'down', 'r2c1');
check('r1c2', 'down', 'r2c2');
check('r1c3', 'down', 'r2c3');
check('r2c2', 'up',   'r1c2');

console.log('\n[rails to controls and back]');
check('r2c1', 'down', 'btn-a');
check('btn-a', 'up',  'r2c1');
check('btn-a', 'right', 'btn-b');

console.log('\n[sidebar]');
check('nav-home', 'down', 'nav-movies');
check('nav-movies', 'up', 'nav-home');
check('nav-home', 'right', 'r1c1');

console.log('\n[edges never crash]');
check('nav-home', 'up', null);
check('r1c3', 'right', null);
check('btn-b', 'down', null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
