// node --experimental-strip-types smooth-check.mjs
// Netflix-smooth player (owner, 2026-11-21): the full-screen controls go when idle, the
// TV's Up strip carries the boost and the subtitles, a server's own subtitles can be
// turned on from Sahrae, and opening or closing the player does not redraw the page.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};
const read = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const pm = read('src/components/PlayerModal.tsx');
const strip = read('src/components/ui/TvServerStrip.tsx');
const fo = read('android-overlay/app/src/main/assets/frame-options.js');
const app = read('src/App.tsx');
const css = read('src/index.css');
const sn = read('src/tv/spatialNavigation.ts');

console.log('\nthe player state, outside App');
const { openPlayer, closePlayer, usePlayerConfig } = await import('./src/services/playerStore.ts');
eq('a hook to read it', typeof usePlayerConfig, 'function');
openPlayer({ mediaId: 550, mediaType: 'movie', startInInfo: true });
closePlayer();
eq('open then close leaves nothing open (no throw without a subscriber)', true, true);
eq('App no longer holds it (opening a film does not redraw Home)', !app.includes('setPlayerConfig') && app.includes('function PlayerHost()') && app.includes('<PlayerHost />'), true);
eq('the same onPlay every render, so shelves are not redrawn for it', app.includes('const handlePlay = useCallback('), true);

console.log('\nfull screen: the controls go when idle, like Netflix');
eq('3.5 s after the last touch, movement or key', pm.includes('const BAR_IDLE_MS = 3500;') && pm.includes("window.addEventListener('keydown', wake, true);") && pm.includes("window.addEventListener('pointermove', wake, opts);"), true);
eq('a touch on a server\'s picture counts (apps)', pm.includes("d.sahrae === 'frame-touch'") && fo.includes("up({ sahrae: 'frame-touch' });") && fo.includes("|| d.sahrae === 'frame-touch'"), true);
eq('the picture\'s own clock decides paused (a lone "pause" message kept them up)', pm.includes("if (typeof d.paused === 'boolean') setPaused(d.paused);"), true);
eq('open boost and subtitle panels keep them up', pm.includes('showLangs || showBoost || showWebSubs);'), true);
eq('the mouse at the top edge brings them back on the website', pm.includes("if (e.pointerType === 'mouse') peekBar(BAR_IDLE_MS);"), true);

console.log('\nthe TV\'s Up strip: servers, subtitles and the boost together');
eq('the strip has a boost row', strip.includes("title={boost.ok === false ?") && strip.includes('[1, 1.5, 2, 3].map'), true);
eq('and says when a server lists no subtitles', strip.includes('subsNote && !(choices && choices.subs.length > 0)'), true);
eq('the player hands both over', pm.includes('boost={trackReach ? { value: boost, ok: boostOk, onPick: setBoost } : undefined}') && pm.includes('subsNote={trackReach ?'), true);

console.log('\na server\'s own subtitles, turned on from Sahrae');
const a = fo.indexOf('    function secs('), b = fo.indexOf('    function fileFor(');
const { secs, parseSubs } = new Function(fo.slice(a, b) + '; return { secs, parseSubs };')();
eq('SRT and WebVTT times', [secs('00:01:59,455'), secs('01:59.455'), secs('1:02:03.5')], [119.455, 119.455, 3723.5]);
eq('SRT', parseSubs('1\n00:01:59,455 --> 00:02:02,447\nPeople always ask me\nif I know Tyler Durden.\n\n2\n00:02:03,535 --> 00:02:04,331\nThree minutes.\n'),
  [[119.455, 122.447, 'People always ask me\nif I know Tyler Durden.'], [123.535, 124.331, 'Three minutes.']]);
eq('WebVTT, its header and notes skipped, styling braces dropped', parseSubs('WEBVTT\n\n00:00:01.000 --> 00:00:02.500 align:start\n<i>Hi</i> {\\an8}there\n\nNOTE x\n\n00:03.000 --> 00:04.000\nShort\n'),
  [[1, 2.5, '<i>Hi</i> there'], [3, 4, 'Short']]);
eq('the lists a player fetches are noted (VidFast\'s /wyzie)', fo.includes('/wyzie|subtitle|opensub|') && fo.includes('x.display || x.label'), true);
eq('an empty track Sahrae turns on is filled from its file', fo.includes('setTimeout(function () { fill(tracks[id]); }, 800);') && fo.includes("t.addCue(new C(c[0], c[1], c[2]))"), true);
eq('a player with only a list gets Sahrae\'s own track', fo.includes("own = film.addTextTrack('subtitles', subFiles[id].label); own.__sahraeOwn = true;"), true);

console.log('\nno redraw of the page behind the player');
eq('skipped, not hidden: no restyle of 4,000 elements on the way in and out', css.includes('html.tv-mode.player-open .tv-shell,') && /player-open \.tv-shell \{\s*content-visibility: hidden;/.test(css.replace(/html\.low-gfx\.player-open \.tv-shell \{/, 'player-open .tv-shell {')), true);
eq('its height is remembered, so the scroll place is kept', css.includes('.tv-shell, .tv-rail, .tv-full { contain-intrinsic-size: auto 1920px auto 1080px; }'), true);
eq('a phone too, without the blur of the live page under the player', css.includes('@media (pointer: coarse) {\n  html.player-open #player-modal-container {'), true);
eq('and the scroll place is put back if it was not measured', pm.includes('if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);'), true);
eq('the focus ring measures once a frame, not on every change to the page', sn.includes('function queueRingSync()') && sn.includes('    if (!tvMode) return;\n    queueRingSync();'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
