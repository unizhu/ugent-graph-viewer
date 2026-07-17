# STATE.md — Memory Graph View

## Goal
Add a Memory graph view mode to the graph viewer per docs/plans/2026-07-17-memory-graph-view.md: parse a memory export (NDJSON/array), build a record graph (records + identity hubs, supersession edges), render it with memory-specific palettes/filters/stats/detail, alongside the existing code-graph view. Console handoff (R7) is a separate cross-repo PR — out of scope here.

## Now
Read plan + all core source. Starting R1 (types).

## Next
1. R1 types.ts: MemoryRecordExport, MemoryViewNode/Edge, MemoryFilterState, ViewMode union
2. R2 graph/memory-loader.ts: parseMemoryExport (NDJSON + array) + buildMemoryGraph (hubs, supersession) + test
3. R6 theme.ts: memoryNodeColor/memoryEdgeColor palettes
4. R4 canvas/graph-data.ts: buildMemoryGraphData + GraphCanvas accessors (size by access_count, tooltip, link color)
5. R3 App.tsx: viewMode state + localStorage + shape detection in file/manifest load + Manifest type
6. R5 memory variants: FilterPanel/StatsPanel/NodeDetail/SearchBar; hide CommunityPanel in memory mode
7. data/memory-sample.ndjson (~200 records) + manifest entry + README section
8. Verify: pnpm build (tsc && vite build) + loader test; commit & push

## Constraints
- User authorized push for THIS task in their message.
- Do not clone into the tenant-console workspace; graph-viewer lives at /workspaces/ugent-graph-viewer.
- Keep existing code-graph behavior unchanged (detection by shape; existing files load as code).
- Change only what the plan requires; unrelated finds -> NOTED not done.

## Decisions
- DECISION: sample uses .ndjson extension — why: data/.gitignore is `*.json` (would ignore a .json sample); .ndjson commits cleanly. File input accept extended to .ndjson.
- DECISION: viewMode persisted in localStorage mirroring render-settings.ts pattern.
- DECISION: memory vs code detected by export shape at parse time; code path unchanged.

## Facts
- pkg manager: pnpm. Commands: pnpm build (tsc && vite build) | pnpm dev | pnpm preview. No lint script, no test runner configured — CONFIRM tsx availability before claiming loader test pass.
- Core files: src/types.ts | src/graph/loader.ts | src/canvas/graph-data.ts | src/canvas/GraphCanvas.tsx | src/theme/theme.ts | src/ui/App.tsx | src/canvas/render-settings.ts (localStorage pattern)
- Panels: FilterPanel, StatsPanel, NodeDetail, SearchBar, CommunityPanel, RenderControls, LargeGraphPrompt (LoadChoice="file"|"twod"|"threed")
- Data: data/manifest.json tracked; data/.gitignore=`*.json`. App fetches /data/manifest.json {files:[]} then /data/<file>.
- Render: RenderNode {id,label,kind,color,val,filePath,communityId}; GraphCanvas uses ForceGraph2D/3D.

## Done
(none yet this repo)

## Open items
(none yet)

## Failed attempts
(none)
