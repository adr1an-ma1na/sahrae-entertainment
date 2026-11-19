// node intro-check.mjs
// The opening (SplashIntro.tsx, index.css .hz-*, services/introSound.ts):
// smooth because every animation only moves, scales or fades a layer (owner,
// 2026-11-19: "very laggy … giving off cheap"), four seconds as Netflix's is,
// and its sound landing when the name does.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};

const css = readFileSync('src/index.css', 'utf8').replace(/\r\n/g, '\n');
const tsx = readFileSync('src/components/SplashIntro.tsx', 'utf8');
const snd = readFileSync('src/services/introSound.ts', 'utf8');

console.log('\nonly what the graphics chip does alone');
const frames = [...css.matchAll(/@keyframes (hz-[\w-]+) \{([^@]*?)\}\s*(?=@keyframes|\n\n|\/\*|\.)/g)];
const props = new Set();
for (const [, , body] of frames) for (const m of body.matchAll(/([a-z-]+)\s*:/g)) props.add(m[1]);
eq('keyframes found', frames.length > 20, true);
eq('they change only transform, opacity and visibility', [...props].filter((p) => !['transform', 'opacity', 'visibility'].includes(p)), []);
const block = css.slice(css.indexOf('.hz { --hz'), css.indexOf('.hz-still.hz-out'));
eq('no mask, letter-spacing or background moving', /animation:[^;]*hz-(reveal|track|sheen|iris|grain)\b/.test(block), false);
eq('no film grain, no sand redrawn each frame', [/hz-grain/.test(tsx), /<canvas/.test(tsx), /getContext\(/.test(tsx)], [false, false, false]);
eq('nothing moves before the sound starts', block.includes('.hz:not(.hz-go), .hz:not(.hz-go) * { animation-play-state: paused !important; }') && tsx.includes("classList.add('hz-go')"), true);

console.log('\nNetflix\'s pace, in time with the sound');
const num = (re, s) => Number((re.exec(s) || [])[1]);
const out = num(/const OUT_MS = (\d+)/, tsx), fade = num(/const FADE_MS = (\d+)/, tsx), settled = num(/const SETTLED_MS = (\d+)/, tsx);
eq('four seconds in all', out + fade, 4000);
eq('settled before the dive', settled < out, true);
const hit = num(/export const HIT = ([\d.]+)/, snd);
const land = num(/\.hz-word \{[^}]*animation: hz-land [\d.]+s [^)]*\) ([\d.]+)s/, block);
eq('the name lands on the beat', [hit, land], [1.25, 1.25]);
eq('the dive sounds as the camera dives', /const out = \(\) => \{ setPhase\('out'\); diveSound\(\);/.test(tsx), true);
eq('the push lasts until the dive', num(/hz-push ([\d.]+)s/, block) * 1000, out);

console.log('\nthe sound');
eq('made on the device: no recording fetched', /https?:\/\/|\.mp3|\.wav|\.ogg|fetch\(/.test(snd), false);
eq('can be turned off', snd.includes("export const introSoundOn") && readFileSync('src/components/SettingsView.tsx', 'utf8').includes('Intro sound'), true);
eq('late sound is dropped, not played out of step', snd.includes('if (late > 0.4) { stopIntro(0); return; }'), true);
eq('a skip fades it', tsx.includes('stopIntro(0.35)'), true);
eq('nothing is scheduled before the audio clock began (a RangeError silenced it)', /\.(setValueAtTime\([^)]*, |start\()(t0|hit)\)/.test(snd), false);

console.log('\nthe welcome');
eq('by name, from the profile', tsx.includes('welcomeLine(name, profileId)') && readFileSync('src/App.tsx', 'utf8').includes('name={activeProfile.name} profileId={activeProfile.id}'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
