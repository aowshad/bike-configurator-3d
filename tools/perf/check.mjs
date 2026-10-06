// Regression check for the performance work: every option still updates the bike, rendering stops again afterwards,
// no shader recompiles, shadows refresh when parts appear or disappear, look thumbnails, undo and share links work.
// Usage: node check.mjs [--url http://localhost:5181/]   (exit code 1 on any failure)
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), i = args.indexOf('--url');
const PAGE = i >= 0 ? args[i + 1] : 'http://localhost:5181/';
const qi = args.indexOf('--quality'), QUALITY = qi >= 0 ? args[qi + 1] : null;   // auto (default), high or fast
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const fails = [], ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? 'ok   ' : 'FAIL ') + msg); };

for (const [w, h, mobile] of [[1440, 900, false], [375, 812, true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage(), errors = [];
  if (QUALITY) await p.addInitScript(q => localStorage.setItem('dh-quality', q), QUALITY);
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await p.goto(PAGE + '?perf&debug');
  await p.waitForSelector('#loader.done', { timeout: 120000 });
  await p.waitForFunction(() => document.querySelectorAll('.look.ready').length === document.querySelectorAll('.look').length, null, { timeout: 60000 });
  await p.waitForFunction(() => ['detail', 'single', 'light-only'].includes(document.documentElement.dataset.lod), null, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const tag = `[${w}${QUALITY ? ' ' + QUALITY : ''}]`;
  const stats = () => p.evaluate(() => window.__perf.stats());
  ok((await stats()).rendersPerSec === 0, `${tag} idle: 0 renders/s`);
  const programs0 = (await stats()).programs;
  // count renders caused by a state change, then confirm they stop
  const renders = () => p.evaluate(() => window.__perf.count());
  const patches = [{ frame: 6 }, { paint: 3 }, { paint: 5 }, { accent: 6 }, { chain: 3 }, { tread: 3 }, { tread: 1 }, { sidewall: 2 }, { gripPat: 1 }, { rise: 1 }, { width: 2 },
    { collars: 2 }, { saddleShape: 2 }, { cover: 3 }, { rimDepth: 1 }, { spokeShape: 1 }, { nipples: 1 }, { pedalStyle: 1 }, { pedalsOn: 1 }, { guide: 1 }, { height: 3 },
    { name: 'CHECK' }, { tiresTxt: 'GRIP', tread: 0 }, { logos: 1 }, { finish: 3 }];
  for (const patch of patches) {
    const r0 = await renders(), sh0 = await p.evaluate(() => window.__perf.shadowPasses());
    await p.evaluate(s => { Object.assign(window.__bike.state, s); window.__bike.applyState(); }, patch);
    await p.waitForTimeout(700);
    const r1 = await renders(); await p.waitForTimeout(600); const r2 = await renders();
    const sh1 = await p.evaluate(() => window.__perf.shadowPasses());
    const geo = QUALITY !== 'fast' && ['tread', 'pedalsOn', 'guide', 'height', 'rise', 'width', 'collars', 'saddleShape', 'rimDepth', 'spokeShape', 'pedalStyle'].some(k => k in patch);
    const pr = (await stats()).programs; if (pr !== programs0) console.log('     programs now', pr, 'after', JSON.stringify(patch));
    ok(r1 > r0 && r2 === r1 && (!geo || sh1 > sh0), `${tag} ${JSON.stringify(patch)}: rendered ${r1 - r0}×, then stopped${geo ? `, shadow passes +${sh1 - sh0}` : ''}`);
  }
  ok((await stats()).programs === programs0, `${tag} shader programs constant (${programs0})`);
  // looks: apply + undo restores state exactly
  const before = await p.evaluate(() => JSON.stringify(window.__bike.state));
  await p.evaluate(() => document.querySelector('[data-preset="5"]').click()); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('#toast .tact')?.click()); await p.waitForTimeout(400);
  ok(before === await p.evaluate(() => JSON.stringify(window.__bike.state)), `${tag} look apply + undo restores the build`);
  // share link round trip
  const hash = await p.evaluate(() => location.hash);
  const p2 = await ctx.newPage(); await p2.goto(PAGE + '?debug' + hash); await p2.waitForSelector('#loader.done', { timeout: 120000 });
  ok(before === await p2.evaluate(() => JSON.stringify(window.__bike.state)), `${tag} share link restores the build`);
  await p2.close();
  ok(errors.length === 0, `${tag} no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}
await b.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
