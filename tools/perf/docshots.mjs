// Downscale a run's screenshots into docs/perf/<label>-<view>.webp for PERF.md.
// Usage: node docshots.mjs <label> [width=900]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [label, width = '900'] = process.argv.slice(2);
const dir = new URL('./out/', import.meta.url).pathname, dest = new URL('../../docs/perf/', import.meta.url).pathname;
fs.mkdirSync(dest, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await browser.newPage();
for (const f of fs.readdirSync(dir).filter(f => f.startsWith(label + '-') && f.endsWith('.png') && !f.startsWith('diff'))) {
  const b64 = await p.evaluate(async ([src, w]) => {
    const i = new Image(); await new Promise(r => { i.onload = r; i.src = src; });
    const c = new OffscreenCanvas(w, Math.round(i.height * w / i.width)); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
    const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: .82 })).arrayBuffer());
    let s = ''; for (let k = 0; k < buf.length; k += 32768) s += String.fromCharCode(...buf.subarray(k, k + 32768)); return btoa(s);
  }, ['data:image/png;base64,' + fs.readFileSync(dir + f).toString('base64'), +width]);
  fs.writeFileSync(dest + f.replace('.png', '.webp'), Buffer.from(b64, 'base64'));
}
console.log(fs.readdirSync(dest).filter(f => f.startsWith(label)).join(' '));
await browser.close();
