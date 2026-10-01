// Shared by every target (PWA in Chrome, APK through WebView DevTools), so the
// two runs are the same user doing the same things and their results diff cleanly.
import fs from 'node:fs';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BODY_TYPES = new Set(['xhr', 'fetch', 'stylesheet', 'script', 'document']);

export function attachRecorder(page) {
  const rec = { step: 'boot', requests: [], consoleErrors: [], pageErrors: [] };
  const byReq = new Map();
  page.on('request', (req) => {
    let frame = '';
    try { frame = req.frame()?.url() || ''; } catch {}
    const e = { step: rec.step, url: req.url(), method: req.method(), type: req.resourceType(), frame, nav: req.isNavigationRequest() };
    byReq.set(req, e);
    rec.requests.push(e);
  });
  page.on('response', async (res) => {
    const e = byReq.get(res.request());
    if (!e) return;
    e.status = res.status();
    const h = res.headers();
    e.ctype = (h['content-type'] || '').slice(0, 60);
    // An APK-blocked request is answered with an EMPTY 200, which no error event
    // reports, so the body length is the only way to see it.
    if (BODY_TYPES.has(e.type) && /^https?:/.test(e.url) && e.status < 300) {
      try { e.bytes = (await res.buffer()).length; } catch {}
    }
  });
  page.on('requestfailed', (req) => {
    const e = byReq.get(req);
    if (e) e.failure = req.failure()?.errorText || 'failed';
  });
  page.on('console', (m) => {
    if (m.type() === 'error') rec.consoleErrors.push({ step: rec.step, text: m.text().slice(0, 300) });
  });
  page.on('pageerror', (err) => rec.pageErrors.push({ step: rec.step, text: String(err?.message || err).slice(0, 300) }));
  return rec;
}

export async function settle(page, minMs = 3000, maxMs = 12000) {
  const t0 = Date.now();
  try { await page.waitForNetworkIdle({ idleTime: 1200, timeout: maxMs }); } catch {}
  const left = minMs - (Date.now() - t0);
  if (left > 0) await sleep(left);
}

/** Click the first visible control whose text or aria-label equals one of `labels`. */
export async function clickByText(page, labels, { timeout = 8000, contains = false } = {}) {
  labels = [].concat(labels);
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const hit = await page.evaluate((labels, contains) => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const els = [...document.querySelectorAll('button, a, [role="button"], [data-tv-focusable], [tabindex]')].filter(vis);
      const textOf = (e) => (e.innerText || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const ariaOf = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || '').trim().toLowerCase();
      for (const L of labels) {
        const want = L.toLowerCase();
        const match = (s) => (contains ? s.includes(want) : s === want);
        const el = els.find((e) => match(textOf(e))) || els.find((e) => match(ariaOf(e)));
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return L; }
      }
      return null;
    }, labels, contains);
    if (hit) return hit;
    await sleep(400);
  }
  return null;
}

/** Reach a section the way a person would: sidebar label, else the phone's More sheet. */
export async function goTo(page, label, alt = []) {
  const names = [label, ...alt];
  let hit = await clickByText(page, names, { timeout: 2500 });
  if (!hit) {
    if (await clickByText(page, ['More'], { timeout: 1500 })) {
      await sleep(700);
      hit = await clickByText(page, names, { timeout: 3000 });
    }
  }
  return hit;
}

export async function closeTop(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);
  await clickByText(page, ['Close', 'Back'], { timeout: 1200 });
  await sleep(500);
}

/** Click the first control inside the section headed by one of `headings`. */
export async function clickInSection(page, headings, selector = '[data-tv-focusable], button, [role="button"]') {
  return page.evaluate((headings, selector) => {
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,p,span,div')].filter((e) => e.children.length === 0 || e.tagName[0] === 'H');
    for (const want of headings) {
      const h = hs.find((e) => (e.innerText || '').trim().toLowerCase() === want.toLowerCase());
      if (!h) continue;
      let box = h;
      for (let i = 0; i < 5 && box; i++, box = box.parentElement) {
        const c = [...box.querySelectorAll(selector)].find((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 20 && r.height > 20 && !e.contains(h);
        });
        if (c) { c.scrollIntoView({ block: 'center' }); c.click(); return want + ' > ' + (c.getAttribute('aria-label') || c.innerText || '').trim().slice(0, 40); }
      }
    }
    return null;
  }, headings, selector);
}

/** Is any audio/video actually advancing? Samples twice, `gap` ms apart. */
export async function mediaAdvancing(page, gap = 4000) {
  // Players live inside cross-origin iframes (YouTube, the movie embeds), so every
  // frame is sampled, not just the app's own document.
  const sample = async () => {
    const out = {};
    for (const f of page.frames()) {
      let host = '';
      try { host = new URL(f.url()).host || 'app'; } catch { host = 'app'; }
      try {
        const ts = await f.evaluate(() => [...new Set([...document.querySelectorAll('video, audio'), ...(window.__sahraeMedia || [])])].map((m) => m.currentTime));
        ts.forEach((t, i) => { out[`${host}#${i}`] = t; });
      } catch {}
    }
    return out;
  };
  const a = await sample();
  await sleep(gap);
  const b = await sample();
  const moving = Object.keys(b).filter((k) => a[k] !== undefined && b[k] > a[k] + 0.5);
  return { media: Object.keys(b).length, advancing: moving.length > 0, moving };
}

export async function probe(page) {
  return page.evaluate(() => {
    const big = [...document.images].filter((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 30 && r.height > 30 && r.bottom > 0 && r.top < innerHeight * 2;
    });
    const faces = [...document.fonts].filter((f) => /Figtree|Outfit/.test(f.family));
    const text = document.body ? document.body.innerText : '';
    return {
      url: location.href,
      imgs: big.length,
      imgsLoaded: big.filter((i) => i.complete && i.naturalWidth > 0).length,
      appFontFaces: faces.length,
      appFontsLoaded: faces.filter((f) => f.status === 'loaded').length,
      iframes: [...document.querySelectorAll('iframe')].map((f) => f.src).filter(Boolean).map((s) => s.slice(0, 120)),
      videos: [...document.querySelectorAll('video')].map((v) => ({ rs: v.readyState, t: +v.currentTime.toFixed(1), paused: v.paused, err: v.error ? v.error.code : 0 })),
      textLen: text.length,
      problemText: (text.match(/(something went wrong|couldn.?t (load|play|reach)|failed to load|no results|try again|not available|unavailable|offline)[^\n]{0,50}/gi) || []).slice(0, 6),
      htmlClass: document.documentElement.className,
    };
  });
}

export const FLOWS = [
  { name: '01-launch', run: async (p) => { await settle(p, 6000, 20000); } },
  { name: '02-past-onboarding', run: async (p) => ({ clicked: await clickByText(p, ['Skip', 'Get started'], { timeout: 6000 }) }) },
  { name: '03-home', run: async (p) => {
      await goTo(p, 'Home'); await settle(p, 4000);
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)); await settle(p, 3000);
      await p.evaluate(() => window.scrollTo(0, 0));
  } },
  { name: '04-search', run: async (p) => {
      await goTo(p, 'Home'); await sleep(800);
      const opened = await p.evaluate(() => { const b = document.querySelector('form button[aria-label="Search"]'); if (b) { b.click(); return true; } return false; });
      await sleep(900);
      const input = await p.$('input[placeholder="Titles, people, genres"]');
      if (!input) return { opened, typed: false };
      await input.focus();
      await p.keyboard.type('batman', { delay: 40 });
      await p.keyboard.press('Enter');
      await settle(p, 6000);
      const results = await p.evaluate(() => document.querySelectorAll('.poster-card').length);
      return { opened, typed: true, results };
  } },
  { name: '05-movies', run: async (p) => ({ nav: await goTo(p, 'Movies') }) },
  { name: '06-title-details', run: async (p) => {
      const opened = await p.evaluate(() => { const c = document.querySelector('.poster-card'); if (c) { c.scrollIntoView({ block: 'center' }); c.click(); return true; } return false; });
      await settle(p, 4000);
      return { opened };
  } },
  { name: '07-trailer', run: async (p) => {
      const c = await clickByText(p, ['Trailer'], { timeout: 4000 });
      await settle(p, 8000, 15000);
      return { clicked: c, ...(await mediaAdvancing(p)) };
  } },
  { name: '08-play-movie', run: async (p) => {
      await closeTop(p);
      await p.evaluate(() => { const c = document.querySelector('.poster-card'); if (c) c.click(); });
      await sleep(2500);
      const c = await clickByText(p, ['Play'], { timeout: 4000 });
      await settle(p, 12000, 20000);
      return { clicked: c, ...(await mediaAdvancing(p)) };
  } },
  { name: '09-series', run: async (p) => { await closeTop(p); await closeTop(p); return { nav: await goTo(p, 'Series') }; } },
  { name: '10-live-tv', run: async (p) => ({ nav: await goTo(p, 'Live TV') }) },
  { name: '11-live-tv-play', run: async (p) => {
      const clicked = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('[data-tv-focusable], button, [role="button"]')]
          .filter((e) => /LIVE/.test(e.innerText || '') && /(Al Jazeera|Sky News|DW News|France 24|Euronews|NHK|CNA)/i.test(e.innerText || ''));
        const c = cards.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
        if (c) { c.scrollIntoView({ block: 'center' }); c.click(); return (c.innerText || '').replace(/s+/g, ' ').slice(0, 40); }
        return null;
      });
      await settle(p, 12000, 20000);
      return { clicked, ...(await mediaAdvancing(p)) };
  } },
  { name: '12-sports', run: async (p) => { await closeTop(p); return { nav: await goTo(p, 'Live Sports', ['Sports']) }; } },
  { name: '13-flow-channels', run: async (p) => {
      const nav = await goTo(p, 'Flow Channels', ['Channels']);
      await settle(p, 8000, 15000);
      return { nav, ...(await mediaAdvancing(p)) };
  } },
  { name: '14-music', run: async (p) => {
      const nav = await goTo(p, 'Music', ['Listen', 'Sauti']);
      await sleep(1500);
      const later = await clickByText(p, ['Maybe later'], { timeout: 3000 });
      await settle(p, 6000);
      return { nav, later };
  } },
  { name: '15-music-play', run: async (p) => {
      const clicked = await clickInSection(p, ['Quick picks', 'Trending now', 'Trending', 'Listen again', 'Top hits']);
      await settle(p, 10000, 15000);
      return { clicked, ...(await mediaAdvancing(p)) };
  } },
  { name: '16-podcasts', run: async (p) => ({ nav: await goTo(p, 'Podcasts') }) },
  { name: '17-podcast-play', run: async (p) => {
      const clicked = await clickInSection(p, ['Fresh episodes', 'Continue listening', 'Top shows'], 'button');
      await settle(p, 8000, 15000);
      return { clicked, ...(await mediaAdvancing(p)) };
  } },
  { name: '18-radio', run: async (p) => ({ nav: await goTo(p, 'Radio') }) },
  { name: '19-my-list', run: async (p) => ({ nav: await goTo(p, 'My List') }) },
  { name: '20-downloads', run: async (p) => ({ nav: await goTo(p, 'Downloads') }) },
  { name: '21-sign-in-form', run: async (p) => {
      const opened = await clickByText(p, ['Sign In', 'Sign in', 'Log in'], { timeout: 4000 });
      await sleep(1500);
      const form = await p.evaluate(() => ({
        email: !!document.querySelector('input[type="email"], input[placeholder*="mail" i]'),
        password: !!document.querySelector('input[type="password"]'),
      }));
      return { opened, ...form };
  } },
];

/** Run every flow, never letting one failure stop the rest. */
export async function runFlows(page, rec, outDir, { only } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const steps = [];
  for (const f of FLOWS) {
    if (only && !only.includes(f.name)) continue;
    rec.step = f.name;
    const t0 = Date.now();
    const step = { name: f.name };
    try {
      step.extra = (await f.run(page)) || {};
      await settle(page, 2500);
      step.ok = true;
    } catch (e) {
      step.ok = false;
      step.error = String(e?.message || e).slice(0, 300);
    }
    try { step.probe = await probe(page); } catch (e) { step.probe = { error: String(e?.message || e).slice(0, 200) }; }
    try { await page.screenshot({ path: path.join(outDir, `${f.name}.png`) }); } catch {}
    step.ms = Date.now() - t0;
    steps.push(step);
    const pr = step.probe || {};
    console.log(`${step.ok ? 'ok  ' : 'FAIL'} ${f.name.padEnd(20)} imgs ${pr.imgsLoaded}/${pr.imgs}  fonts ${pr.appFontsLoaded}/${pr.appFontFaces}  iframes ${(pr.iframes || []).length}  ${JSON.stringify(step.extra || {}).slice(0, 90)}${step.error ? '  ERR ' + step.error : ''}`);
  }
  const report = { at: new Date().toISOString(), steps, requests: rec.requests, consoleErrors: rec.consoleErrors, pageErrors: rec.pageErrors };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  return report;
}

/** Track every media element that plays, including detached new Audio() ones. */
export const MEDIA_HOOK = () => {
  const orig = HTMLMediaElement.prototype.play;
  window.__sahraeMedia = [];
  HTMLMediaElement.prototype.play = function (...args) {
    if (!window.__sahraeMedia.includes(this)) window.__sahraeMedia.push(this);
    return orig.apply(this, args);
  };
};
