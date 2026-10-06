// ?perf overlay: renders per second, frame times, renderer.info and JS heap.
// It updates its text on a timer, never by requesting a render, so an idle page stays idle.
// window.__perf.bench(n) renders n synced frames and returns the average cost (CPU + GPU) per frame.

export function initPerf(renderer, scene, camera){
  if (!new URLSearchParams(location.search).has('perf')) return () => {};
  const frames = [];   // [time, interval since previous render, cpu ms of render()]
  let last = 0, count = 0, shadows = 0;
  const el = document.createElement('div');
  el.className = 'perfHud'; el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  const gl = renderer.getContext(), px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // waits for the GPU
  const stats = () => {
    const now = performance.now(), win = frames.filter(f => now - f[0] < 2000);
    const iv = win.slice(1).map(f => f[1]), cpu = win.map(f => f[2]);
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0, max = a => a.length ? Math.max(...a) : 0;
    const i = renderer.info, m = performance.memory;
    return {
      rendersPerSec: +(win.length / 2).toFixed(1), frameAvg: +avg(iv).toFixed(1), frameWorst: +max(iv).toFixed(1),
      renderCpuAvg: +avg(cpu).toFixed(2), calls: i.render.calls, triangles: i.render.triangles,
      programs: i.programs?.length ?? 0, geometries: i.memory.geometries, textures: i.memory.textures,
      dpr: +renderer.getPixelRatio().toFixed(2), heapMB: m ? Math.round(m.usedJSHeapSize / 1048576) : null,
    };
  };
  const fmt = n => n.toLocaleString('en-US');
  setInterval(() => {
    const s = stats();
    el.innerHTML = `<b>${s.rendersPerSec}</b> renders/s<br>frame ${s.frameAvg} ms · worst ${s.frameWorst}<br>render() ${s.renderCpuAvg} ms · DPR ${s.dpr}<br>` +
      `${fmt(s.calls)} draws · ${fmt(s.triangles)} tris<br>${s.programs} programs · ${s.geometries} geo · ${s.textures} tex` + (s.heapMB !== null ? `<br>heap ${s.heapMB} MB` : '');
  }, 500);
  window.__perf = {
    stats,
    count: () => count,            // total main renders since load
    shadowPasses: () => shadows,   // total shadow-map updates since load
    // cost of one full frame at the current size: n renders, each waited on
    // median of n synced frames after a warm-up, so GPU clock ramps don't skew it
    bench(n = 60){
      for (let k = 0; k < 15; k++) { renderer.render(scene, camera); sync(); }
      const t = [];
      for (let k = 0; k < n; k++) { const t0 = performance.now(); renderer.render(scene, camera); sync(); t.push(performance.now() - t0); }
      t.sort((a, b) => a - b); return +t[n >> 1].toFixed(2);
    },
    // the same at another pixel ratio (e.g. the 1.0 used while dragging), then back
    benchAt(dpr, n = 30){
      const was = renderer.getPixelRatio(); renderer.setPixelRatio(dpr);
      const ms = window.__perf.bench(n); renderer.setPixelRatio(was); renderer.render(scene, camera); return ms;
    },
  };
  return (t0, t1, shadowPass) => { count++; if (shadowPass) shadows++; frames.push([t1, last ? t1 - last : 0, t1 - t0]); last = t1; if (frames.length > 600) frames.splice(0, 300); };
}
