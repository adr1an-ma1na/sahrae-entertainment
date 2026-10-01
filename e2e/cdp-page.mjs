// A Page over one raw DevTools socket, exposing just the Puppeteer calls the
// flows use. Android WebView exposes its page in /json/list but never announces
// it to a browser-level session, which is how Puppeteer discovers pages, so
// Puppeteer cannot find it. Attaching straight to the page socket (what
// chrome://inspect does) works on WebView and on desktop Chrome alike.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connectPage(devtoolsHttp, match = (t) => t.type === 'page' && /^https:\/\/localhost/.test(t.url)) {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    const list = await fetch(`${devtoolsHttp}/json/list`).then((r) => r.json()).catch(() => []);
    // The app also runs hidden WebViews (stream resolvers); prefer the one on screen.
    const isVisible = (t) => { try { return JSON.parse(t.description || '{}').visible === true; } catch { return false; } };
    target = list.filter(match).sort((a, b) => isVisible(b) - isVisible(a))[0];
    if (!target) await sleep(1000);
  }
  if (!target) throw new Error('no matching page in /json/list');

  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

  let id = 0;
  const pending = new Map();
  const bus = new EventEmitter();
  bus.setMaxListeners(50);
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(`${m.error.message} (${m.error.code})`)) : resolve(m.result);
    } else if (m.method) {
      bus.emit(m.method, m.params);
    }
  });
  const send = (method, params = {}, timeoutMs = 60000) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error(`${method} timed out`)); } }, timeoutMs);
  });

  // ── frames and their JavaScript worlds
  const frameUrl = new Map();
  const contextOf = new Map();
  let mainFrameId = null;
  let mainUrl = target.url;
  bus.on('Page.frameNavigated', ({ frame }) => {
    frameUrl.set(frame.id, frame.url);
    if (!frame.parentId) { mainFrameId = frame.id; mainUrl = frame.url; }
  });
  bus.on('Page.frameDetached', ({ frameId }) => { frameUrl.delete(frameId); contextOf.delete(frameId); });
  bus.on('Runtime.executionContextCreated', ({ context }) => {
    if (context.auxData && context.auxData.isDefault && context.auxData.frameId) contextOf.set(context.auxData.frameId, context.id);
  });
  bus.on('Runtime.executionContextsCleared', () => contextOf.clear());

  await send('Page.enable');
  await send('Network.enable', { maxTotalBufferSize: 64 * 1024 * 1024, maxResourceBufferSize: 8 * 1024 * 1024 });
  await send('Runtime.enable');
  const tree = await send('Page.getFrameTree');
  const walk = (ft) => { frameUrl.set(ft.frame.id, ft.frame.url); if (!ft.frame.parentId) mainFrameId = ft.frame.id; (ft.childFrames || []).forEach(walk); };
  walk(tree.frameTree);

  const evaluateIn = async (contextId, fn, args) => {
    const expression = typeof fn === 'function' ? `(${fn.toString()})(...${JSON.stringify(args)})` : String(fn);
    const params = { expression, awaitPromise: true, returnByValue: true, userGesture: true };
    if (contextId) params.contextId = contextId;
    const r = await send('Runtime.evaluate', params);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  // ── network, in the shape the recorder expects (one object per request)
  const reqs = new Map();
  const finished = new Map();
  let inflight = 0;
  let lastActivity = Date.now();
  const typeName = (t) => (t || 'other').toLowerCase();
  const page = new EventEmitter();

  bus.on('Network.requestWillBeSent', (p) => {
    // A redirect re-announces the same requestId but finishes only once.
    if (!p.redirectResponse) inflight++;
    lastActivity = Date.now();
    let done;
    const doneP = new Promise((r) => { done = r; });
    finished.set(p.requestId, { doneP, done });
    const req = {
      _id: p.requestId,
      url: () => p.request.url,
      method: () => p.request.method,
      resourceType: () => typeName(p.type),
      frame: () => ({ url: () => frameUrl.get(p.frameId) || '' }),
      isNavigationRequest: () => p.type === 'Document' && p.requestId === p.loaderId,
      failure: () => req._failure || null,
    };
    reqs.set(p.requestId, req);
    page.emit('request', req);
  });
  bus.on('Network.responseReceived', (p) => {
    const req = reqs.get(p.requestId);
    if (!req) return;
    const res = {
      request: () => req,
      status: () => p.response.status,
      headers: () => Object.fromEntries(Object.entries(p.response.headers || {}).map(([k, v]) => [k.toLowerCase(), v])),
      buffer: async () => {
        await finished.get(p.requestId)?.doneP;
        const b = await send('Network.getResponseBody', { requestId: p.requestId }, 15000);
        return Buffer.from(b.body, b.base64Encoded ? 'base64' : 'utf8');
      },
    };
    page.emit('response', res);
  });
  const settleReq = (requestId) => { inflight = Math.max(0, inflight - 1); lastActivity = Date.now(); finished.get(requestId)?.done(); };
  bus.on('Network.loadingFinished', (p) => settleReq(p.requestId));
  bus.on('Network.loadingFailed', (p) => {
    const req = reqs.get(p.requestId);
    if (req) { req._failure = { errorText: p.errorText }; page.emit('requestfailed', req); }
    settleReq(p.requestId);
  });
  bus.on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args || []).map((a) => (a.value !== undefined ? String(a.value) : a.description || '')).join(' ');
    page.emit('console', { type: () => (p.type === 'error' ? 'error' : p.type), text: () => text });
  });
  bus.on('Runtime.exceptionThrown', (p) => {
    page.emit('pageerror', new Error(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception'));
  });

  const key = async (name) => {
    const k = KEYS[name] || { key: name, text: name };
    await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...k });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
  };

  Object.assign(page, {
    url: () => mainUrl,
    evaluate: (fn, ...args) => evaluateIn(null, fn, args),
    // Also run it in the current document: the WebView ignores Page.reload, so a
    // 'future documents only' script might never run at all.
    evaluateOnNewDocument: async (fn) => {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fn.toString()})()` });
      await evaluateIn(null, fn, []).catch(() => {});
    },
    frames: () => [...frameUrl.keys()].map((fid) => ({
      url: () => frameUrl.get(fid) || '',
      name: () => fid,
      evaluate: (fn, ...args) => {
        const ctx = contextOf.get(fid);
        if (!ctx) return Promise.reject(new Error('no context for frame'));
        return evaluateIn(ctx, fn, args);
      },
    })),
    $: async (selector) => {
      const found = await evaluateIn(null, (s) => !!document.querySelector(s), [selector]);
      if (!found) return null;
      return {
        focus: () => evaluateIn(null, (s) => document.querySelector(s).focus(), [selector]),
        click: () => evaluateIn(null, (s) => document.querySelector(s).click(), [selector]),
      };
    },
    keyboard: {
      press: key,
      type: async (text, { delay = 0 } = {}) => {
        for (const ch of text) { await send('Input.insertText', { text: ch }); if (delay) await sleep(delay); }
      },
    },
    screenshot: async ({ path }) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, 30000);
      fs.writeFileSync(path, Buffer.from(data, 'base64'));
    },
    // Page.reload is silently ignored by Android WebView; reload from inside.
    reload: async ({ timeout = 60000 } = {}) => {
      const fresh = new Promise((r) => bus.once('Runtime.executionContextsCleared', r));
      await send('Runtime.evaluate', { expression: 'setTimeout(() => location.reload(), 0)' }).catch(() => {});
      await Promise.race([fresh, sleep(timeout)]);
      await sleep(2000);
    },
    waitForNetworkIdle: async ({ idleTime = 1000, timeout = 15000 } = {}) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (inflight === 0 && Date.now() - lastActivity >= idleTime) return;
        await sleep(200);
      }
      throw new Error('network never went idle');
    },
    close: () => ws.close(),
  });
  return page;
}
