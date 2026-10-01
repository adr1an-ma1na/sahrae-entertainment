// node run.mjs pwa  [--url URL] [--out DIR] [--size 1280x800] [--mobile]
// node run.mjs android [--devtools http://127.0.0.1:9222] [--out DIR]
//
// `android` attaches to the APK's WebView through `adb forward tcp:9222
// localabstract:webview_devtools_remote_<pid>`; it needs a debuggable build.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { attachRecorder, runFlows, sleep, MEDIA_HOOK } from './lib.mjs';

const args = process.argv.slice(2);
const target = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
const out = opt('--out', `results/${target}`);
const only = opt('--only') ? opt('--only').split(',') : undefined;

function findChrome() {
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return c.find((p) => fs.existsSync(p));
}

let browser, page;
if (target === 'pwa') {
  const [w, h] = opt('--size', '1280x800').split('x').map(Number);
  browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run'],
  });
  page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: flag('--mobile'), hasTouch: flag('--mobile'), deviceScaleFactor: flag('--mobile') ? 2.625 : 1 });
  await page.evaluateOnNewDocument(MEDIA_HOOK);
  const rec = attachRecorder(page);
  await page.goto(opt('--url', 'https://adr1an-ma1na.github.io/sahrae-entertainment/'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await runFlows(page, rec, out, { only });
} else if (target === 'android') {
  browser = await puppeteer.connect({ browserURL: opt('--devtools', 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 120000 });
  for (let i = 0; i < 30 && !page; i++) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().startsWith('https://localhost'));
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error('No https://localhost page in the WebView');
  await page.evaluateOnNewDocument(MEDIA_HOOK);
  const rec = attachRecorder(page);
  // Reload so boot-time requests (fonts, config, first catalog calls) are captured too.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await runFlows(page, rec, out, { only });
} else {
  console.error('usage: node run.mjs pwa|android [--out DIR]');
  process.exit(2);
}
// Never close a connected WebView: Browser.close would take the app down with it.
if (target === 'pwa') await browser.close();
else await browser.disconnect();
