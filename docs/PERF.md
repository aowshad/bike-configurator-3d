# Performance

How fast the configurator is, how it is measured, and what each optimization changed.

## How to measure

- **Overlay:** open the page with `?perf`. It shows renders per second, frame time (average and worst over the last 2 s),
  the CPU time of `renderer.render()`, draw calls, triangles, shader programs, geometries, textures, pixel ratio and JS heap.
  The overlay updates on a timer, so it never causes a render itself.
- **Scenarios:** `tools/perf/bench.mjs` runs the same scenarios every time in headless Chrome:
  ```bash
  npm start                                  # in the repo root
  cd tools/perf && npm install
  node bench.mjs <label>                     # idle, drag, mobile, load, shots
  node diff.mjs baseline <label>             # pixel diff of the at-rest screenshots
  node docshots.mjs <label>                  # small WebP copies for this page
  ```
- **Regression check:** `node check.mjs` applies 25 options at 1440 and 375 px and fails if any of them doesn't render, doesn't
  stop rendering afterwards, misses a shadow update, or compiles a new shader; it also checks look undo and share links.
- **Machine:** Apple M4, 16 GB, Chrome (ANGLE Metal). This is faster than the M1-class target, so frame *time* is the number to
  compare, not fps: headless Chrome caps rAF at 60 fps, which hides how much work a frame really takes.
  `bench ms/frame` renders 30 frames at the current size and waits for the GPU after each one, so it is the true cost of a frame.

| # | Scenario | Setup |
|---|---|---|
| 1 | Idle | 1440×900 at DPR 2, overview camera, nothing moving, after all look thumbnails are done |
| 2 | Dragging | same page, mouse orbit for 2 s |
| 3 | Phone | 375×812 at DPR 3, mobile emulation, 4× CPU throttle, idle then a 2 s drag |
| 4 | First load | Chrome's "Fast 4G" (9 Mbps down, 1.5 Mbps up, 165 ms latency), cache disabled |

## Baseline (before any optimization, commit `289002c`)

| Metric | Value |
|---|---|
| Idle renders per second | **60** (the loop renders every frame, even when nothing moves) |
| Frame cost at DPR 2 (bench) | **9.4 ms** |
| Triangles per frame | 1,364,279 |
| Draw calls (main pass) | 80 |
| Shader programs | 17 |
| Geometries / textures | 99 / 56 |
| JS heap | 59 MB |
| Dragging, desktop | 60 fps, worst frame 18.7 ms |
| Phone, 4× throttle | 60 fps, worst frame 18.3 ms (canvas capped at DPR 2) |
| Fast 4G: first contentful paint | 0.7 s (page shell) |
| Fast 4G: first visual of the bike | **8.9 s** |
| Fast 4G: configurable | **8.9 s** |
| Fast 4G: transferred | **7.4 MB** (7.2 MB of it is `bike.glb`) |

At-rest screenshots hide the overlays that change between runs (perf HUD, hint, pulsing dot). With the seeded noise maps,
two loads of the same build differ in **0 pixels**, so any difference below comes from the change being measured.

| Overview | Cockpit |
|---|---|
| ![](perf/baseline-overview.webp) | ![](perf/baseline-cockpit.webp) |
| **Tire** | **Down tube** |
| ![](perf/baseline-tire.webp) | ![](perf/baseline-downtube.webp) |

## Phase 1: stop wasting frames

- **Render on demand.** `requestRender()` schedules one frame; a frame asks for the next only while something moves: the camera
  (controls, damping, tweens, auto-rotate), a material or uniform animation, a deformation, or a pending look thumbnail.
  Resizes render synchronously, so the canvas never flashes. Rendering pauses while the tab is hidden or the stage is off screen.
- **Adaptive resolution** (`src/quality.js`). At rest the canvas keeps the pixel ratio it always had (`min(devicePixelRatio, 2)`),
  so the still image is unchanged. While the camera moves it drops to 1.5 (1.25 on touch devices), and while the user drags or
  zooms to 1.0. About 200 ms after the camera stops, one full-quality frame is rendered. A governor scales the moving resolution
  down when a frame costs more than 20 ms and back up under 10 ms, using GPU timer queries where available.
  Color fades and shape changes with a still camera keep full resolution, so clicking an option never flickers.
- **Static shadows.** `shadowMap.autoUpdate = false`; one shadow pass runs only when the silhouette changes (tread, pedals,
  guide, collars, saddle height, deformations while they animate). The map is 1024² instead of 2048², and the shadow camera is
  fitted to the bike (±0.95 m instead of ±1.5 m; the widest build, an 800 mm high-rise bar, reaches ±0.84 m), so shadow texels
  are about the same size as before.
- `preserveDrawingBuffer` is off. The image button and look thumbnails read the canvas in the same task they render it.

| Metric | Baseline | Phase 1 |
|---|---|---|
| Idle renders per second | 60 | **0** |
| Frame cost at rest, DPR 2 | 9.4 ms | 10.4 ms (one frame, then nothing) |
| Frame cost while dragging | 9.4 ms (DPR 2) | **6.5 ms** (DPR 1) |
| Shadow passes | every frame | only when the silhouette changes |
| Shader programs | 17 | 17 |
| At-rest pixels changed vs baseline | | ≤ 0.06% (soft shadow edges only) |

While dragging the frame is now triangle-bound (1.36M triangles), which is what Phase 2 addresses.
