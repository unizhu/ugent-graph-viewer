# Spec: Large-graph performance for the UGENT Graph Viewer

## Problem statement

On large exports (observed: 17,438 nodes / 29,572 edges; ~6,600 nodes / ~8,000
edges visible after default filtering) the viewer becomes sluggish and the page
"freezes a lot". The freezes come from a combination of a heavy 3D render path,
an always-on camera-orbit loop that forces a re-render every 25 ms, synchronous
force-layout and clustering on the main thread, and full graph-data rebuilds on
every filter/search change.

The goal is to make the viewer stay responsive (no long UI blocks; usable
pan/zoom) up to roughly **50,000 nodes**, without regressing the current
behavior on small graphs.

## Root-cause findings (current code)

1. **Always-on auto-orbit** — `src/canvas/ForceGraph3D.tsx:384` runs a
   `setInterval` every **25 ms (~40 fps)** that calls `cameraPosition()` whenever
   the user is idle, forcing continuous 3D re-rendering even when nothing is
   happening. Largest constant cost.
2. **Synchronous force layout on the main thread** — `warmupTicks={120}`
   (`ForceGraph3D.tsx:507`) runs 120 simulation ticks before first paint; at this
   scale it blocks the UI thread (the initial freeze). `cooldownTicks={0}` stops
   afterward but the warmup spike is severe.
3. **3D geometry volume** — one sphere mesh per node (`nodeResolution={6}`), one
   line per link, plus a **directional-arrow cone per link**
   (`linkDirectionalArrowLength={3.5}`), i.e. ~8k extra cones for the visible set.
   3D is far heavier than 2D at this count.
4. **`graphData` memo churn** — `ForceGraph3D.tsx:266` rebuilds the full
   node/link arrays over all nodes/edges on every filter or debounced-search
   change; new array identity makes the renderer re-ingest and re-run layout.
5. **Progressive-reveal re-layout** — `revealLimit` bumps every 350 ms
   (`App.tsx:24-27,177`); each bump re-triggers the `graphData` memo and a fresh
   layout pass during load.
6. **All preprocessing is synchronous** — `loadGraph`, Louvain
   `detectCommunities`, `assignCommunityColors`, and `buildCommunityInfo` all run
   on the main thread (only a single `setTimeout(…, 0)` defer in `loadViewport`).

## Requirements

### R1 — 2D / 3D render-mode switch (user-controlled)
- Add `react-force-graph-2d` as a dependency alongside the existing
  `react-force-graph-3d`.
- Add a sidebar control to switch between **3D** and **2D** render modes.
- 2D mode is the lightweight path (no sphere meshes, no arrow cones) and is what
  keeps ~50k responsive.
- The two canvases must share the same graph data, filters, theme tokens,
  node/edge colors, hover-highlight behavior, click-to-focus, and node tooltip
  content. Node color, size (by degree), and edge color must match across modes.
- The selected mode persists for the session (e.g. `localStorage`), defaulting
  per R5.

### R2 — Configurable auto-orbit
- Auto-orbit becomes an explicit **toggle** (on/off).
- The orbit re-render **interval is configurable**, defaulting to **1000 ms**,
  with selectable values (at least: 25 ms, 250 ms, 500 ms, 1 s, 2 s). A slower
  interval means fewer forced re-renders.
- When orbit is off, no orbit timer runs and the camera only moves on user
  interaction or click-to-focus.
- The existing "pause on user interaction, resume after idle" behavior is
  preserved when orbit is on.
- Orbit settings persist for the session.

### R3 — Off-main-thread preprocessing (Web Worker)
- Move the expensive load-time work off the main thread into a Web Worker:
  graph construction (`loadGraph`), Louvain community detection
  (`detectCommunities`), color assignment, and community-info build.
- The worker returns a serializable result (nodes with computed
  `degree`/`communityId`/`color`, edges, community metadata, stats) that the main
  thread hydrates into the render structures.
- The main thread must remain interactive (no long blocks) while the worker runs;
  show existing loading-phase UI until results arrive.
- Fallback: if Workers are unavailable, run the same pipeline inline (current
  behavior) so nothing breaks.

### R4 — Reduce render + re-layout cost
- Remove or gate the per-25ms orbit re-render (covered by R2).
- Stop feeding a brand-new `graphData` object on every filter change when only
  visibility changed: prefer updating node/link visibility (e.g. filtered arrays
  built once, or reuse of stable object identities) so the renderer does not
  re-ingest/re-layout on each keystroke. Keep the debounce.
- In 3D, make the directional-arrow cones and node resolution scale down (or turn
  off arrows) automatically above a node/edge threshold to cut geometry.
- Warmup/cooldown ticks tuned so first paint is not a long synchronous block
  (e.g. lower `warmupTicks`, or let layout settle progressively) — layout quality
  vs. responsiveness trade-off documented in code comments.

### R5 — Large-graph "choose how to load" prompt
- Above a configurable node threshold (default around the current
  `PROGRESSIVE_THRESHOLD`, tunable), before rendering, show a prompt letting the
  user choose how to open the graph. Options at minimum:
  - **Aggregate to File View** (collapse symbols to files — lightest),
  - **Full symbol view in 2D** (fast mode),
  - **Full symbol view in 3D** (heaviest; current default).
- The prompt states the node/edge counts so the choice is informed.
- The chosen option sets the initial render mode (R1) and aggregate/progressive
  state accordingly.
- Small graphs (below the threshold) skip the prompt and render as today.

### R6 — No regressions
- Small-graph behavior, the console handoff flow, theme light/dark, deep-link
  focus (`?node=`), progressive loading, filters, search, communities, and node
  detail all continue to work in both render modes.
- `tsc && vite build` passes. Existing behavior for direct/standalone opens is
  preserved.

## Acceptance criteria

- **AC1 (2D/3D):** A visible sidebar control switches between 2D and 3D; both
  render the same filtered graph with matching colors/sizes, working hover
  highlight, click-to-focus, and tooltips. Mode persists across reloads in the
  session.
- **AC2 (orbit):** Auto-orbit can be toggled off; when on, the re-render interval
  is user-selectable and defaults to 1000 ms. With orbit off, no periodic
  re-render occurs (verifiable: no continuous `cameraPosition` calls at idle).
- **AC3 (worker):** Loading a large export does not block the main thread for the
  duration of layout/clustering; the tab stays responsive (scroll/typing) while
  the loading UI is shown. Worker-unavailable fallback still loads the graph.
- **AC4 (50k target):** With a ~50k-node dataset in 2D fast mode (or File View),
  pan/zoom is usable and the page does not freeze; switching filters/search does
  not cause multi-second blocks.
- **AC5 (prompt):** Opening a graph above the threshold shows the load-choice
  prompt with node/edge counts; each choice sets the correct initial
  mode/aggregate state. Below the threshold, no prompt appears.
- **AC6 (no regressions):** Handoff, theme switch, deep-link focus, and all
  sidebar filters work in both 2D and 3D; `tsc && vite build` is green.

## Implementation approach (ordered)

1. **Add `react-force-graph-2d` dependency** and a shared render-props layer so
   2D and 3D consume the same node/link accessors (color, size, label/tooltip,
   link color/width). Extract the common config to avoid duplication.
2. **Introduce a render-mode state** (`"2d" | "3d"`) with a sidebar toggle and
   session persistence; render `ForceGraph2D` or `ForceGraph3D` accordingly.
3. **Rework auto-orbit** in the canvas: convert to a toggle + configurable
   interval (default 1000 ms), preserve idle-pause/resume, and skip the timer
   entirely when off. Add sidebar controls + persistence.
4. **Move preprocessing into a Web Worker**: create a worker that runs
   `loadGraph` + `detectCommunities` + `assignCommunityColors` +
   `buildCommunityInfo`, posts back a serializable payload; main thread hydrates.
   Add an inline fallback path.
5. **Cut re-layout/render churn**: stabilize `graphData` so visibility-only
   filter changes don't force re-ingest/re-layout; auto-scale 3D arrows/node
   resolution above a threshold; tune warmup/cooldown for a non-blocking first
   paint.
6. **Add the large-graph load-choice prompt** (File View / 2D full / 3D full)
   gated by a tunable threshold, wiring the choice into render mode + aggregate +
   progressive state. Small graphs bypass it.
7. **Verify**: run `tsc && vite build`; manually validate handoff, theme, deep
   link, filters/search, hover, focus in both modes; sanity-check responsiveness
   with a large dataset.
8. **Commit & push** to the viewer `main` (no `[ci]` marker — viewer has no CI).

## Out of scope
- Server/engine-side export changes or pagination.
- Level-of-detail streaming beyond the existing progressive reveal.
- Persisting settings server-side or per-tenant (session `localStorage` only).
- GPU/WebGL2 custom shaders or swapping the graph library beyond adding the 2D
  variant.

## Open questions / assumptions
- Assumes `react-force-graph-2d` is API-compatible enough to share accessors; if
  a prop differs, the shared layer adapts per mode.
- 50k target assumes 2D fast mode or File View; 3D full symbol view at 50k is not
  guaranteed smooth and is offered as the explicit "heaviest" choice.
- Orbit interval options and the large-graph threshold are tunable constants with
  the defaults stated above.
