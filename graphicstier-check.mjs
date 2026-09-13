/**
 * Graphics tier tests — who gets real liquid glass.
 *
 * Wrong in one direction and a cheap TV box renders a blurred bottom bar over a
 * scrolling grid on its CPU, and scrolling becomes a slideshow. Wrong in the
 * other and a capable phone loses the effect for no reason. The cases here pin
 * both edges, and especially the "unknown" cases, because the browsers that
 * withhold these signals (Firefox, Safari, privacy modes) are mostly fast ones.
 *
 * Run: node --experimental-strip-types graphicstier-check.mjs
 */

globalThis.document = undefined;
const { isLowGraphics } = await import('./src/services/graphicsTier.ts');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name); } };
const S = (o) => ({ software: false, cores: 0, memoryGb: 0, ...o });

console.log('\nweak devices get flat surfaces');
ok('a software rasteriser (emulator, cheap TV box)', isLowGraphics(S({ software: true, cores: 8, memoryGb: 8 })));
ok('two cores', isLowGraphics(S({ cores: 2 })));
ok('one core', isLowGraphics(S({ cores: 1 })));
ok('2 GB of memory', isLowGraphics(S({ cores: 4, memoryGb: 2 })));
ok('1 GB of memory', isLowGraphics(S({ cores: 4, memoryGb: 1 })));

console.log('\ncapable devices keep the glass');
ok('a normal phone: 8 cores, 6 GB', !isLowGraphics(S({ cores: 8, memoryGb: 6 })));
ok('four cores, 4 GB', !isLowGraphics(S({ cores: 4, memoryGb: 4 })));
ok('three cores is not two', !isLowGraphics(S({ cores: 3, memoryGb: 4 })));

console.log('\nunknown is NOT weak — the browsers that withhold these are mostly fast');
ok('Safari/Firefox: no deviceMemory reported', !isLowGraphics(S({ cores: 8, memoryGb: 0 })));
ok('no core count reported', !isLowGraphics(S({ cores: 0, memoryGb: 8 })));
ok('nothing reported at all', !isLowGraphics(S({})));

console.log('\nno document means no work and no exception');
{
  const { applyGraphicsTier } = await import('./src/services/graphicsTier.ts');
  let threw = false, r;
  try { r = applyGraphicsTier(); } catch { threw = true; }
  ok('applyGraphicsTier is safe headless', !threw && r === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
