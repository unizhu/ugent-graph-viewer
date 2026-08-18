# STATE.md — Viewer performance (Phases A/B/C)

## Goal
Make the 3D viewer usable on 10k+ node workspaces, then improve node appearance
against whatever renderer wins. Three phases with a measurement gate between A
and B. Plan: Phase A cheap wins + instrumentation, gate on measured draw calls,
Phase B single-draw-call renderer, Phase C appearance.

## Now
Phase A complete and verified locally (tests + build). Awaiting the deployed
measurement that decides Phase B.

## Next
1. Deploy Phase A; enable "Render stats" in the sidebar.
2. Record draw calls / triangles / fps on ugent-7559fca657ae (26k raw, ~10k
   rendered), comet-d023d9211ed3 (13.8k) and ugent-tenant-console (2k).
3. Gate: GPU/draw-call bound -> Phase B. Comfortable already -> skip to Phase C
   against the existing mesh renderer.
4. Phase B (if gated in): layout worker -> Points/LineSegments scene -> GPU
   picking -> attribute-based highlight -> parity -> swap out ForceGraph3D.
5. Phase C: sphere-impostor shader, per-kind glyph atlas.

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
- Versions are current: react-force-graph-3d 1.29.1 and three-forcegraph 1.43.4
  are latest; three 0.184.0 vs 0.185.1. No perf win available from upgrading.
- Workspace sizes (raw, from the engine): ugent 26,107 | reelchair 22,580 |
  comet 13,831 | ugent-context-engine 12,988 | 8 of 12 under 9k. HTTP export
  prunes block nodes (~60% off), so rendered counts are far lower.
- Prerequisites for Phase B already installed: d3-force-3d@3.0.6 (transitive),
  OrbitControls in three/examples/jsm/controls. Worker precedent:
  src/graph/clustering.ts:66.

## Done
- Phase A: quality tiers + predicates (render-settings.ts) with 16 tests; flat
  links above 4000; hover highlight off above 6000 nodes; powerPreference
  high-performance; large-graph prompt threshold 8000 -> 5000 with file
  aggregation marked Recommended; render stats overlay + persisted toggle.

## Open items
- The product question in the plan: aggregation-by-default above ~5k with
  drill-down may beat a renderer rewrite for legibility. Phase A makes it cheap
  to try before committing to Phase B.

## Failed attempts
(none)
