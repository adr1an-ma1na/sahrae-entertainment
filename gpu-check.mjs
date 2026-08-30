/**
 * GPU capability detection tests.
 *
 * Two ways to be wrong, and they are not symmetric. Miss a software renderer and
 * the app freezes on its first screen — the worst possible failure, because it
 * happens before anyone reaches a single feature and looks exactly like a broken
 * build. Flag a real GPU by mistake and someone loses a decorative glow behind a
 * mask at 50% opacity, and never notices.
 *
 * So the bias is deliberate: when the renderer name is unknown or withheld,
 * assume the GPU is real. Refusing to render on every privacy-hardened browser
 * would punish the cautious rather than the slow.
 *
 * Run: node --experimental-strip-types gpu-check.mjs
 */

globalThis.document = undefined;

/**
 * `navigator` is a getter-only global in modern Node, so a plain assignment
 * throws. defineProperty is the way to stand in for it.
 */
const setCores = (n) =>
  Object.defineProperty(globalThis, 'navigator', {
    value: { hardwareConcurrency: n }, configurable: true, writable: true,
  });

const { isSoftwareRenderer, rendererName } = await import('./src/services/gpu.ts');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

console.log('\nsoftware rasterisers must be caught — these are the ones that freeze');
// Real strings, as reported by the environments that actually hit this.
const SOFTWARE = [
  ['BlueStacks / Android emulator', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'],
  ['bare SwiftShader',              'Google SwiftShader'],
  ['Linux software mesa',           'Mesa/X.org, llvmpipe (LLVM 15.0.7, 256 bits)'],
  ['mesa softpipe',                 'Gallium 0.4 on softpipe'],
  ['headless mesa',                 'Mesa OffScreen'],
  ['Windows fallback',              'Microsoft Basic Render Driver'],
  ['generic',                       'Generic Renderer'],
];
for (const [label, name] of SOFTWARE) ok(label, isSoftwareRenderer(name), name.slice(0, 40));

console.log('\nreal GPUs must NOT be flagged — stripping the effect from these is a regression');
const HARDWARE = [
  ['Adreno phone',      'Adreno (TM) 660'],
  ['Mali TV box',       'Mali-G52 MC2'],
  ['PowerVR',           'PowerVR Rogue GE8320'],
  ['desktop NVIDIA',    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['desktop AMD',       'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Intel integrated',  'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['Apple silicon',     'Apple M2'],
];
for (const [label, name] of HARDWARE) ok(label, !isSoftwareRenderer(name), name.slice(0, 40));

console.log('\nthe unknown case — bias toward rendering, not toward refusing');
ok('an empty name is not treated as software', !isSoftwareRenderer(''));
ok('a withheld name is not treated as software', !isSoftwareRenderer('WebKit WebGL'));
ok('null-ish input does not throw', !isSoftwareRenderer(undefined) && !isSoftwareRenderer(null));

console.log('\nmatching must not be fooled by substrings in real hardware names');
ok('"Software" inside a vendor name still matches (it is a rasteriser)',
  isSoftwareRenderer('Some Software Rasterizer'));
ok('a GPU merely containing "GE" is unaffected', !isSoftwareRenderer('PowerVR Rogue GE8320'));

console.log('\nrendererName must never throw, whatever the context gives back');
ok('a context with no debug extension returns empty',
  rendererName({ getExtension: () => null }) === '');
ok('a context that throws on getExtension is survived',
  rendererName({ getExtension: () => { throw new Error('blocked'); } }) === '');
ok('a context that throws on getParameter is survived',
  rendererName({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => { throw new Error('x'); } }) === '');
ok('a normal context returns the name',
  rendererName({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => 'Adreno (TM) 660' }) === 'Adreno (TM) 660');
ok('a null parameter becomes an empty string, not "null"',
  rendererName({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => null }) === '');

console.log('\nheadless / non-browser must degrade rather than crash');
const { gpuReport, resetGpuReport } = await import('./src/services/gpu.ts');
resetGpuReport();
const r = gpuReport();
ok('no document means no shaders, and no exception', r.available === false && r.canRunShaders === false);
ok('a missing document is NOT cached — the DOM may simply not exist yet, and '
  + 'caching that would disable shaders for the session on capable hardware',
  gpuReport() !== r);

console.log('\ncaching the REAL probe — browsers cap live WebGL contexts, so probing per mount would exhaust them');
/** Minimal canvas/context stand-in, counting how often a context is requested. */
let contextsCreated = 0;
const fakeGl = (rendererStr) => ({
  getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 37446 } : { loseContext() {} }),
  getParameter: () => rendererStr,
});
globalThis.document = {
  createElement: () => ({ getContext: () => { contextsCreated++; return fakeGl('Adreno (TM) 660'); } }),
};
setCores(8);
resetGpuReport();
const good = gpuReport();
ok('a real GPU is allowed to run shaders', good.canRunShaders === true, good.renderer);
ok('the renderer name is reported', good.renderer === 'Adreno (TM) 660');
gpuReport(); gpuReport();
ok('three calls create exactly one context', contextsCreated === 1, `created ${contextsCreated}`);
ok('repeat calls return the identical cached object', gpuReport() === good);

console.log('\na software renderer on an otherwise capable machine is still refused');
globalThis.document = { createElement: () => ({ getContext: () => fakeGl('Google SwiftShader') }) };
resetGpuReport();
const soft = gpuReport();
ok('SwiftShader is detected through the full probe', soft.software === true);
ok('and shaders are refused', soft.canRunShaders === false);

console.log('\na dual-core device is spared even with a named GPU');
globalThis.document = { createElement: () => ({ getContext: () => fakeGl('Mali-G52 MC2') }) };
setCores(2);
resetGpuReport();
const weak = gpuReport();
ok('two cores is treated as too weak for a continuous full-screen shader', weak.canRunShaders === false);
ok('  but it is not mislabelled as software', weak.software === false);

console.log('\na context that cannot be created at all');
globalThis.document = { createElement: () => ({ getContext: () => null }) };
resetGpuReport();
ok('no WebGL means no shaders, reported as unavailable',
  gpuReport().available === false && gpuReport().canRunShaders === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
