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
  // once: the soft contact shadow used by Fast mode (no shadow map there): the real shadow, seen from above, at full
  // strength (the page sets the opacity per theme). The rectangle must match CONTACT in src/main.js.
  if (layout === 'desktop' && theme === 'light') {
    const shadow = await p.evaluate(() => {
      const { THREE, scene, renderer } = window.__bike, C = { x0: -1.6, x1: 1.4, z0: -1.3, z1: .6 };
      let ground; scene.traverse(o => { if (o.material?.isShadowMaterial) ground = o; });
      const W = 1024, H = Math.round(W * (C.z1 - C.z0) / (C.x1 - C.x0)), pr = renderer.getPixelRatio();
      const cam = new THREE.OrthographicCamera((C.x0 - C.x1) / 2, (C.x1 - C.x0) / 2, (C.z1 - C.z0) / 2, (C.z0 - C.z1) / 2, .1, 20);
      cam.position.set((C.x0 + C.x1) / 2, 6, (C.z0 + C.z1) / 2); cam.up.set(0, 0, -1); cam.lookAt((C.x0 + C.x1) / 2, 0, (C.z0 + C.z1) / 2);
      const hidden = []; scene.traverse(o => { if (o.isMesh && o !== ground && o.visible) { o.visible = false; hidden.push(o); } });
      const op = ground.material.opacity; ground.material.opacity = 1;
      const size = renderer.getSize(new THREE.Vector2()), buf = renderer.getDrawingBufferSize(new THREE.Vector2());
      renderer.setScissorTest(true); renderer.setScissor(0, 0, W / pr, H / pr); renderer.setViewport(0, 0, W / pr, H / pr);
      renderer.render(scene, cam);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(renderer.domElement, 0, buf.y - H, W, H, 0, 0, W, H);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y);
      ground.material.opacity = op; hidden.forEach(o => o.visible = true); renderer.render(scene, window.__bike.camera);
      return c.toDataURL('image/webp', .9);
    });
    fs.writeFileSync(dest + 'contact-shadow.webp', Buffer.from(shadow.split(',')[1], 'base64'));
    console.log(dest + 'contact-shadow.webp', Math.round(fs.statSync(dest + 'contact-shadow.webp').size / 1024) + ' KB');
  }
  fs.writeFileSync(file, Buffer.from(data[0].split(',')[1], 'base64'));
  console.log(file, `${data[1]}×${data[2]}`, Math.round(fs.statSync(file).size / 1024) + ' KB');
  await ctx.close();
}
await b.close();
