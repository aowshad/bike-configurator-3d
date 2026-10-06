// Repeatable performance scenarios for docs/PERF.md.
// Usage:  npm install && node bench.mjs <label> [--url http://localhost:5181/] [--only idle,drag,mobile,load,shots]
// Needs a running dev server (npm start in the repo root) and Google Chrome (override with CHROME=/path/to/chrome).
// Writes out/<label>.json and out/<label>-<view>.png (full-size stage screenshots for diffing).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2), label = args[0] || 'run';
const opt = k => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : null; };
const PAGE = opt('url') || 'http://localhost:5181/';
const only = (opt('only') || 'idle,drag,mobile,load,shots').split(',');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_VIEWS = ['overview', 'cockpit', 'tire', 'downtube'];
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
const out = p => new URL('./out/' + p, import.meta.url).pathname;

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const result = { label, date: new Date().toISOString(), url: PAGE };

async function open({ w = 1440, h = 900, dpr = 2, mobile = false, theme = 'light' } = {}){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(t => { try { localStorage.setItem('dh-theme', t); } catch (e) {} }, theme);
  return { ctx, p, errors };
}
// loader hidden, look thumbnails done, and (when the page has LODs) the detailed model swapped in
async function settle(p){
  await p.waitForSelector('#loader.done', { timeout: 120000 });
  await p.waitForFunction(() => document.querySelectorAll('.look.ready').length === document.querySelectorAll('.look').length, null, { timeout: 60000 }).catch(() => {});
  await p.waitForFunction(() => !document.documentElement.dataset.lod || document.documentElement.dataset.lod === 'detail', null, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(2500);
}
const gpuName = p => p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
async function drag(p, ms = 2000){
  const box = await (await p.$('#stage canvas')).boundingBox();
  const x0 = box.x + box.width * .35, y0 = box.y + box.height * .5;
  await p.mouse.move(x0, y0); await p.mouse.down();
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) { await p.mouse.move(x0 + Math.sin(i / steps * Math.PI * 2) * box.width * .25, y0 + Math.sin(i / steps * Math.PI * 4) * 30); await p.waitForTimeout(16); }
  const s = await p.evaluate(() => window.__perf.stats());
  await p.mouse.up();
  return s;
}

if (only.includes('idle') || only.includes('drag') || only.includes('shots')) {
  const { ctx, p, errors } = await open();
  await p.goto(PAGE + '?perf&debug'); await settle(p);
  result.gpu = await gpuName(p);
  if (only.includes('idle')) {
    const s = await p.evaluate(() => window.__perf.stats());
    const bench = await p.evaluate(() => window.__perf.bench(30));
    result.idle = { ...s, benchMsPerFrame: bench };
    console.log('idle', result.idle);
  }
  if (only.includes('drag')) {
    const s = await drag(p);
    await p.waitForTimeout(1500);
    const after = await p.evaluate(() => window.__perf.stats());
    result.drag = { ...s, rendersPerSecAfterSettle: after.rendersPerSec };
    console.log('drag', result.drag);
  }
  if (only.includes('shots')) {
    for (const v of SHOT_VIEWS) {
      await p.evaluate(v => window.__bike.flyTo(v), v);
      await p.waitForTimeout(2200);
      await (await p.$('#stage')).screenshot({ path: out(`${label}-${v}.png`) });
    }
    console.log('shots written');
  }
  result.errors = errors;
  await ctx.close();
}

if (only.includes('mobile')) {
  const { ctx, p, errors } = await open({ w: 375, h: 812, dpr: 3, mobile: true });
  const cdp = await ctx.newCDPSession(p);
  await p.goto(PAGE + '?perf&debug'); await settle(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.waitForTimeout(1000);
  const idle = await p.evaluate(() => window.__perf.stats());
  const s = await drag(p);
  result.mobile = { idleRendersPerSec: idle.rendersPerSec, ...s, cpuThrottle: 4 };
  result.mobileErrors = errors;
  console.log('mobile', result.mobile);
  await ctx.close();
}

if (only.includes('load')) {
  // Chrome DevTools "Fast 4G": 9 Mbps down, 1.5 Mbps up, 165 ms latency (60 ms × 2.75), cache disabled
  const { ctx, p } = await open();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 165, downloadThroughput: 9e6 / 8 * .9, uploadThroughput: 1.5e6 / 8 * .9 });
  let bytes = 0; const marks = {}; let bytesAtInteractive = null;
  cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; });
  const t0 = Date.now();
  await p.goto(PAGE, { waitUntil: 'commit' });
  const poll = setInterval(async () => {
    try {
      const m = await p.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').map(x => [x.name, Math.round(x.startTime)])));
      if (m.interactive && bytesAtInteractive === null) bytesAtInteractive = bytes;
      Object.assign(marks, m);
    } catch (e) {}
  }, 100);
  await settle(p);
  clearInterval(poll);
  const m = await p.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').map(x => [x.name, Math.round(x.startTime)])));
  Object.assign(marks, m);
  const fcp = await p.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0));
  result.load = { network: 'Fast 4G (9 Mbps, 165 ms)', fcp, ...marks, mbAtInteractive: bytesAtInteractive && +(bytesAtInteractive / 1048576).toFixed(2), mbTotal: +(bytes / 1048576).toFixed(2), wallMs: Date.now() - t0 };
  console.log('load', result.load);
  await ctx.close();
}

fs.writeFileSync(out(label + '.json'), JSON.stringify(result, null, 2));
console.log('wrote', out(label + '.json'));
await browser.close();
