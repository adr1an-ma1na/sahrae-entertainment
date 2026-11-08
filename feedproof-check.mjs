// node --experimental-strip-types feedproof-check.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { feedStanding, orderByProof, longestSinceFailing, feedServerId, FEED_PROOF_KEY } from './src/services/feedProof.ts';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};

console.log('\nwhat report_play will accept');
const titleRule = /^(movie:[0-9]{1,9}|tv:[0-9]{1,9}:[0-9]{1,3}:[0-9]{1,4})$/, serverRule = /^[a-z0-9]{2,20}$/;
eq('the key passes the database rule', titleRule.test(FEED_PROOF_KEY), true);
eq('a host passes', serverRule.test(feedServerId('embed.taifood-blog.asia')), true);
eq('a long host is cut to fit', serverRule.test(feedServerId('a-very-long-stream-host-name.example.com')), true);

console.log('\nordering');
const row = (id, ok, bad) => ({ server_id: id, ok_count: ok, fail_count: bad, last_ok: null, last_fail: null });
eq('too few reports moves nothing', feedStanding(row('a', 1, 3)), 0);
eq('mostly failing', feedStanding(row('a', 1, 9)), -1);
eq('mostly lasting', feedStanding(row('a', 9, 1)), 1);
eq('mixed stays put', feedStanding(row('a', 5, 4)), 0);
const hosts = ['bad.st', 'plain.st', 'good.st', 'plain2.st'];
eq('lasting first, failing last, the rest in order', orderByProof(hosts, (h) => h, [row('badst', 0, 8), row('goodst', 9, 0)]), ['good.st', 'plain.st', 'plain2.st', 'bad.st']);
eq('no reports, no change', orderByProof(hosts, (h) => h, []), hosts);
eq('longest since failing', longestSinceFailing([{ id: 'a', lastFailure: { at: 5 } }, { id: 'b', lastFailure: { at: 2 } }, { id: 'c', lastFailure: { at: 9 } }], 'c').id, 'b');
eq('alone: nowhere to go', longestSinceFailing([{ id: 'a' }], 'a'), null);

// The player helper exactly as the app ships it, from the Java source.
const java = readFileSync('android-overlay/app/src/main/java/com/sahrae/entertainment/MainActivity.java', 'utf8');
const m = java.match(/FRAME_HELPER = "((?:[^"\\]|\\.)*)";/);
const helper = JSON.parse(`"${m[1]}"`);

function page() {
  const sent = [], doc = {}, ticks = [], timers = [];
  let clock = 1_000_000;
  const parent = { postMessage: (x) => sent.push(x.sahrae) };
  const video = { tagName: 'VIDEO', paused: false, ended: false, readyState: 4, currentTime: 5, currentSrc: 'x', querySelector: () => null, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
  let videos = [video];
  const listeners = {};
  doc.readyState = 'complete';
  doc.hidden = false;
  doc.querySelectorAll = (q) => (q === 'video' ? videos : []);
  doc.querySelector = () => null;
  doc.addEventListener = (t, f) => { listeners[t] = f; };
  const win = {
    top: {}, parent, location: { hostname: 'feed.example', ancestorOrigins: ['https://localhost'] },
    document: doc, Date: { now: () => clock },
    setInterval: (f) => ticks.push(f), setTimeout: (f) => timers.push(f),
    addEventListener: (t, f) => { listeners['w' + t] = f; },
    Math, Promise,
  };
  win.window = win;
  vm.runInNewContext(helper, win);
  const flush = () => { while (timers.length) timers.shift()(); };
  flush();
  return {
    video, sent, doc,
    gone: () => { videos = []; },
    start: () => { listeners.playing({ target: video }); },
    fromParent: (d) => listeners.wmessage({ data: d, source: parent }),
    gesture: () => listeners.pointerdown({}),
    pauseEvent: () => listeners.pause({ target: video }),
    seconds: (n, moving) => { for (let i = 0; i < n / 2; i++) { clock += 2000; if (moving) video.currentTime += 2; ticks.forEach((f) => f()); } },
  };
}
const stalled = (p) => p.sent.includes('frame-stalled');

console.log('\nnoticing a feed that has died');
{ const p = page(); p.start(); p.seconds(20, true); eq('a moving picture is left alone', stalled(p), false); }
{ const p = page(); p.start(); p.seconds(4, true); p.seconds(12); eq('a frozen picture is noticed', stalled(p), true); }
{ const p = page(); p.start(); p.seconds(4, true); p.seconds(6); eq('a short buffer is forgiven', stalled(p), false); }
{ const p = page(); p.start(); p.seconds(4, true); p.video.paused = true; p.seconds(12); eq('a player that stops itself is noticed', stalled(p), true); }
{ const p = page(); p.start(); p.seconds(4, true); p.gone(); p.seconds(12); eq('a player that removes its video is noticed', stalled(p), true); }
{ const p = page(); p.start(); p.seconds(4, true); p.gesture(); p.video.paused = true; p.pauseEvent(); p.seconds(30); eq('pausing it yourself is not a failure', stalled(p), false); }
{ const p = page(); p.start(); p.seconds(4, true); p.fromParent({ sahrae: 'toggle' }); p.seconds(30); eq('pausing with the remote is not a failure', stalled(p), false); }
{ const p = page(); p.start(); p.seconds(4, true); p.doc.hidden = true; p.seconds(30); eq('leaving the app is not a failure', stalled(p), false); }
{ const p = page(); p.seconds(30); eq('a page that never played stays with the start timer', p.sent.includes('frame-stalled'), p.sent.includes('frame-playing')); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
