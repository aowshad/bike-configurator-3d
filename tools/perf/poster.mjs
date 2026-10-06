// Render the posters shown before the 3D model loads: the default build from the overview camera, transparent background
// (the stage gradient shows through), ground shadow included. Re-run after changing the model, the default build or the lighting.
// Usage: node poster.mjs [--url http://localhost:5181/]  → ../../assets/poster/{desktop,mobile}-{light,dark}.webp
// The page picks one in index.html. Desktop is sized by stage height (≥ 0.9 aspect), mobile by stage width.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const args = process.argv.slice(2), i = args.indexOf('--url');
const PAGE = i >= 0 ? args[i + 1] : 'http://localhost:5181/';
const dest = new URL('../../assets/poster/', import.meta.url).pathname;
fs.mkdirSync(dest, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
for (const [layout, w, h, mobile] of [['desktop', 1440, 900, false], ['mobile', 390, 844, true]]) for (const theme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.addInitScript(t => localStorage.setItem('dh-theme', t), theme);
  await p.goto(PAGE + '?debug&noposter');
  await p.waitForSelector('#loader.done', { timeout: 120000 });
  await p.waitForFunction(() => document.documentElement.dataset.lod === 'detail', null, { timeout: 120000 });
  await p.waitForTimeout(2500);
  const data = await p.evaluate(() => {
    const B = window.__bike; B.flyTo('overview', true);
    B.renderer.render(B.scene, B.camera);   // same task as the read, so the drawing buffer is still there
    const c = B.renderer.domElement; return [c.toDataURL('image/webp', .82), c.width, c.height];
  });
  const file = `${dest}${layout}-${theme}.webp`;
  fs.writeFileSync(file, Buffer.from(data[0].split(',')[1], 'base64'));
  console.log(file, `${data[1]}×${data[2]}`, Math.round(fs.statSync(file).size / 1024) + ' KB');
  await ctx.close();
}
await b.close();
