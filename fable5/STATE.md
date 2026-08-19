# STATE.md — Viewer performance (Phases A/B/C)

## Goal
Make the 3D viewer usable on 10k+ node workspaces, then improve node appearance
against whatever renderer wins. Three phases with a measurement gate between A
and B. Plan: Phase A cheap wins + instrumentation, gate on measured draw calls,
Phase B single-draw-call renderer, Phase C appearance.

## Now
All three phases shipped and deployed, each verified in headless Chromium
(Playwright is available via ../ugent-tenant-console).

## Next
Nothing outstanding. Possible follow-ups, none blocking:
1. LARGE_GRAPH_PROMPT_THRESHOLD (5000) was set when 3D was expensive; it is now
   a legibility prompt, not a performance one, so the number and wording could
   be revisited.
2. graphology-types is declared but never imported; left alone because removing
   a types package is a different risk class from removing a runtime one.

## Constraints
- 2D path (react-force-graph-2d) untouched.
- No engine (Rust) changes in this work.

## Decisions
- DECISION: quality thresholds live in src/canvas/render-settings.ts, not
  GraphCanvas.tsx — React-free so they are unit testable in the standalone tsx
  suite, and all tiers are visible in one place.
- DECISION: link width must be EXACTLY 0 to shed cylinders. three-forcegraph
  branches on `useCylinder = !!widthAccessor(link)`, so a small dimmed width
  costs the same as a full cylinder.
- DECISION: stats overlay lives in GraphCanvas (next to the renderer) while its
  toggle lives in RenderControls, following the existing persisted-settings
  pattern. Plan had said RenderControls for both; the renderer handle is only
  reachable inside GraphCanvas.
- DECISION (pending gate): Phase B replaces ForceGraph3D on a single 3D path
  rather than keeping two renderers. Fallback if picking/parity overruns: a
  threshold-selected two-path variant.

## Facts
- pkg manager: pnpm. `pnpm build` (tsc && vite build), `pnpm test` (standalone
  tsx scripts that throw on failure: memory-loader, handoff, render-settings).
- No instancing in three-forcegraph@1.43.4: one Mesh per node, one Mesh/Line per
  link, so ~30k draw calls at 10k nodes. Verified in the shipped bundle.
- Library defaults: nodeResolution 8, linkResolution 6, nodeOpacity 0.75,
  linkOpacity 0.2. antialias already true in three-render-objects.
- react-force-graph-3d/three-forcegraph are gone: the 3D path is our own
  three.js scene. Dropping that dependency took the bundle from 1,787kB to
  1,087kB (gzip 486 -> 296). react-force-graph-2d still serves the 2D path.
- Workspace sizes (raw, from the engine): ugent 26,107 | reelchair 22,580 |
  comet 13,831 | ugent-context-engine 12,988 | 8 of 12 under 9k. HTTP export
  prunes block nodes (~60% off), so rendered counts are far lower.
- Prerequisites for Phase B already installed: d3-force-3d@3.0.6 (transitive),
  OrbitControls in three/examples/jsm/controls. Worker precedent:
  src/graph/clustering.ts:66.

## Done
- Phase A: quality tiers in render-settings.ts; large-graph prompt threshold
  8000 -> 5000 with file aggregation marked Recommended; render stats overlay
  + persisted toggle. The flat-link and sphere-resolution tiers were deleted
  again in Phase B once the mesh renderer they served was gone.
- Phase B: PointsCanvas/PointsScene replace react-force-graph-3d. ~30k draw
  calls -> 2, verified at 10k nodes / 16.7k links, 120 fps headless and 60 fps
  on the real 26k workspace. Layout runs in a worker; picking is a GPU readback.
- Phase C: sphere-impostor shader and SDF per-kind silhouettes, both in the
  fragment shader, still one draw call. Persisted "Node shapes" toggle.
- Post-ship fixes, each reproduced in a browser before and after: canvas CSS
  sizing (setSize updateStyle=false rendered the graph off-screen at 2x); node
  size calibration (sub-pixel nodes); pick window 1x1 -> 13x13 (tooltip hits
  1/15 -> 14/15 at 2x); hover highlight no longer gated at 6000 nodes in 3D.
- Removed progressive reveal entirely: it rebuilt graphData with fresh node
  objects each step, so both canvases restarted their layout. 2D blocking
  12 long tasks / 8,092ms -> 1 / 1,112ms on a 7,400-node export.
- Removed three now-unused dependencies (react-force-graph-3d,
  graphology-layout-forceatlas2, graphology-layout-noverlap) and the dead 3D
  branch in GraphCanvas.handleNodeClick.

## Open items
- The product question in the plan: aggregation-by-default above ~5k with
  drill-down may beat a renderer rewrite for legibility. Phase A makes it cheap
  to try before committing to Phase B.

## Failed attempts
(none)
