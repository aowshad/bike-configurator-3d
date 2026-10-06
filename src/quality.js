// Adaptive resolution.
// At rest the canvas renders at REST (the full quality the page always had). While the camera moves it renders at
// `cap` (1.5 desktop, 1.25 phones), and while the user drags or zooms at `input` (1.0). A frame-cost governor scales
// the moving resolution down when frames cost more than 20 ms and back up under 10 ms. Cost is GPU time from a
// timer query when the browser has one (EXT_disjoint_timer_query_webgl2), otherwise the rAF interval.

export class Resolution {
  constructor(renderer, { rest, cap, input }){
    this.r = renderer; this.rest = rest; this.cap = Math.min(cap, rest); this.input = Math.min(input, rest);
    this.scale = 1; this.cost = 0; this.slow = 0; this.fast = 0;
    const gl = this.gl = renderer.getContext();
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.queries = []; this.active = null;
  }
  configure({ rest, cap, input }){ this.rest = rest; this.cap = Math.min(cap, rest); this.input = Math.min(input, rest); this.scale = 1; }
  // the pixel ratio for this frame: 'rest', 'move' (camera moving) or 'input' (dragging, zooming)
  target(mode){
    if (mode === 'rest') return this.rest;
    return Math.max(.5, (mode === 'input' ? this.input : this.cap) * this.scale);
  }
  apply(dpr){
    if (Math.abs(this.r.getPixelRatio() - dpr) < .01) return false;
    this.r.setPixelRatio(dpr);   // resizes the drawing buffer; the caller renders in the same task, so nothing flashes
    return true;
  }
  // wrap the main render to time it on the GPU
  begin(){
    if (!this.ext || this.active) return;
    const q = this.queries.pop() || this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.active = q;
  }
  end(){
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    (this.pending ??= []).push(this.active); this.active = null;
  }
  // collect finished GPU timings; returns the newest one in ms, or null
  poll(){
    if (!this.pending?.length) return null;
    const gl = this.gl, disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    let ms = null;
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift();
      if (!disjoint) ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      this.queries.push(q);
    }
    return ms;
  }
  // feed one moving frame: interval since the previous frame (ms). Steps the scale after a few consistent frames.
  sample(interval){
    const gpu = this.ext ? this.poll() : null;
    const cost = gpu ?? interval;
    if (cost == null || !isFinite(cost)) return;
    // without a GPU timer the interval can't drop below the display's frame time, so "fast" means hitting vsync
    const fastLimit = gpu != null ? 10 : 17.5;
    this.cost = this.cost ? this.cost * .8 + cost * .2 : cost;
    if (this.cost > 20) { this.fast = 0; if (++this.slow >= 6) { this.scale = Math.max(.5, this.scale * .85); this.slow = 0; this.cost = 0; } }
    else if (this.cost < fastLimit) { this.slow = 0; if (++this.fast >= 30) { this.scale = Math.min(1, this.scale / .85); this.fast = 0; } }
    else { this.slow = 0; this.fast = 0; }
  }
}

/* ============ quality mode: Auto / High / Fast ============ */
export const QUALITY_MODES = ['auto', 'high', 'fast'];
export function savedQuality(){
  try { const q = localStorage.getItem('dh-quality'); return QUALITY_MODES.includes(q) ? q : 'auto'; } catch (e) { return 'auto'; }
}
export function saveQuality(q){ try { localStorage.setItem('dh-quality', q); } catch (e) {} }

// Low-end score. Each signal alone is weak (reduced motion is an accessibility choice, not a slow device), so Fast needs
// several: score ≥ 3. `probeMs` is the cost of a synced frame of the light model at DPR 1 (null before it has run).
export function lowEndScore(probeMs = null){
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  let s = 0;
  if (mem) s += mem <= 2 ? 2 : mem <= 4 ? 1 : 0;
  if (cores) s += cores <= 2 ? 2 : cores <= 4 ? 1 : 0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) s += 1;
  if (probeMs != null) s += probeMs > 14 ? 2 : probeMs > 9 ? 1 : 0;
  return s;
}
// median cost of a few synced frames (CPU + GPU), after a warm-up
export function probeFrame(render, gl){
  const px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px), t = [];
  for (let k = 0; k < 2; k++) { render(); sync(); }
  for (let k = 0; k < 5; k++) { const t0 = performance.now(); render(); sync(); t.push(performance.now() - t0); }
  return t.sort((a, b) => a - b)[2];
}
