// What does each movie server tell the app, and when? Embeds each provider the
// way the APK does (no sandbox, no referrer) and records every postMessage and
// whether its video advances, before and after a viewer-style tap.
//   node probe-servers.mjs [tmdbId ...]
import http from 'node:http';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { sleep } from './lib.mjs';

const brand = 'FBBF24';
const SERVERS = {
  vidfast: (id) => `https://vidfast.pro/movie/${id}?theme=${brand}&autoPlay=true`,
  videasy: (id) => `https://player.videasy.net/movie/${id}?color=${brand}`,
  vidlink: (id) => `https://vidlink.pro/movie/${id}?primaryColor=${brand}&autoplay=true&title=true`,
  multiembed: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
  vidsrccc: (id) => `https://vidsrc.cc/v3/embed/movie/${id}`,
  smashystream: (id) => `https://embed.smashystream.com/playere.php?tmdb=${id}`,
  vidsrcto: (id) => `https://vidsrc.to/embed/movie/${id}`,
  autoembed: (id) => `https://autoembed.co/movie/tmdb/${id}`,
  '2embed': (id) => `https://www.2embed.cc/embed/${id}`,
  vidsrcme: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`,
};
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['1377237', '27205'];

const html = `<!doctype html><body style="margin:0;background:#000">
<iframe id="f" style="width:1280px;height:720px;border:0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="no-referrer"></iframe>
<script>
window.__msgs = []; const t0 = Date.now();
addEventListener('message', (e) => {
  let d; try { d = typeof e.data === 'string' ? e.data : JSON.stringify(e.data); } catch { d = String(e.data); }
  __msgs.push({ t: Date.now() - t0, origin: e.origin, data: (d || '').slice(0, 220) });
});
</script></body>`;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(4599);

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,760'],
});

async function mediaState(page) {
  const out = [];
  for (const f of page.frames()) {
    try {
      const v = await f.evaluate(() => [...document.querySelectorAll('video')].map((m) => ({ t: +m.currentTime.toFixed(1), d: +(m.duration || 0).toFixed(0), paused: m.paused, rs: m.readyState })));
      v.forEach((x) => out.push({ host: (() => { try { return new URL(f.url()).host; } catch { return '?'; } })(), ...x }));
    } catch {}
  }
  return out;
}
const summarize = (msgs) => {
  const kinds = {};
  for (const m of msgs) {
    let k = m.data;
    try { const o = JSON.parse(m.data); k = [o.type, o.event, o.data && (o.data.event || o.data.type)].filter(Boolean).join('/') || Object.keys(o).slice(0, 3).join(','); } catch {}
    k = String(k).slice(0, 50);
    kinds[k] = (kinds[k] || 0) + 1;
  }
  return kinds;
};

const results = [];
for (const id of ids) {
  for (const [name, url] of Object.entries(SERVERS)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1300, height: 760 });
    // Like the APK's L2 guard: an embed may never replace the app's own page.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const top = req.isNavigationRequest() && req.frame() === page.mainFrame();
      if (top && !req.url().startsWith('http://localhost:4599')) req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });
    await page.goto('http://localhost:4599/', { waitUntil: 'domcontentloaded' });
    const t0 = Date.now();
    await page.evaluate((u) => { document.getElementById('f').src = u; }, url(id));
    await sleep(25000);
    const before = { msgs: (await page.evaluate(() => (window.__msgs || []).slice()).catch(() => [])) || [], media: await mediaState(page) };
    // A viewer's tap in the middle of the player.
    await page.mouse.click(640, 360).catch(() => {});
    await sleep(12000);
    const after = { msgs: (await page.evaluate(() => (window.__msgs || []).slice()).catch(() => [])) || [], media: await mediaState(page) };
    const firstMsg = before.msgs[0]?.t ?? null;
    const row = {
      id, name,
      firstMessageMs: firstMsg,
      before: { kinds: summarize(before.msgs), media: before.media },
      after: { kinds: summarize(after.msgs.slice(before.msgs.length)), media: after.media },
      sample: after.msgs.slice(0, 4).map((m) => `${m.t}ms ${m.origin} ${m.data.slice(0, 120)}`),
    };
    results.push(row);
    const adv = (b, a) => a.some((x) => b.find((y) => y.host === x.host) && x.t > (b.find((y) => y.host === x.host).t + 1));
    console.log(`${id} ${name.padEnd(13)} first msg ${firstMsg === null ? '  none' : String(firstMsg).padStart(5) + 'ms'} | before tap: ${JSON.stringify(row.before.kinds).slice(0, 90)} media ${JSON.stringify(before.media).slice(0, 70)} | after tap advancing=${adv(before.media, after.media)} ${JSON.stringify(after.media).slice(0, 60)}`);
    await page.close();
  }
}
fs.writeFileSync('results/probe-servers.json', JSON.stringify(results, null, 1));
await browser.close();
server.close();
