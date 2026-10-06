// Compare two runs' stage screenshots pixel by pixel.
// Usage: node diff.mjs <labelA> <labelB>  → prints per view: % of pixels that differ by more than 8/255, mean abs diff,
// and writes out/diff-<A>-<B>-<view>.png (differences amplified 4×, on black).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [a, b] = process.argv.slice(2);
const dir = new URL('./out/', import.meta.url).pathname;
const views = fs.readdirSync(dir).filter(f => f.startsWith(a + '-') && f.endsWith('.png')).map(f => f.slice(a.length + 1, -4));
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await browser.newPage();
const rows = [];
for (const v of views) {
  const fa = dir + `${a}-${v}.png`, fb = dir + `${b}-${v}.png`;
  if (!fs.existsSync(fb)) continue;
  const res = await p.evaluate(async ([da, db]) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(da), load(db)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const get = img => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const A = get(ia), B = get(ib), c = new OffscreenCanvas(w, h), g = c.getContext('2d'), out = g.createImageData(w, h);
    let changed = 0, sum = 0;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i+1] - B[i+1]), Math.abs(A[i+2] - B[i+2]));
      sum += d; if (d > 8) changed++;
      out.data[i] = out.data[i+1] = out.data[i+2] = Math.min(255, d * 4); out.data[i+3] = 255;
    }
    g.putImageData(out, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/png' }), buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode(...buf.subarray(i, i + 32768));
    return { changedPct: +(changed / (w * h) * 100).toFixed(3), meanAbs: +(sum / (w * h)).toFixed(3), png: btoa(bin) };
  }, ['data:image/png;base64,' + fs.readFileSync(fa).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(fb).toString('base64')]);
  fs.writeFileSync(dir + `diff-${a}-${b}-${v}.png`, Buffer.from(res.png, 'base64'));
  rows.push({ view: v, changedPct: res.changedPct, meanAbs: res.meanAbs });
}
console.table(rows);
await browser.close();
