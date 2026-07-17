# Memory Graph View

- Date: 2026-07-17
- Author: Uni Zhu
- Status: Proposed
- Engine reference: `ugent-context-engine/docs/MEMORY.md` (record model, export endpoint), branch `feature/memory-v2`
- Console reference: `ugent-tenant-console/docs/plans/phase-5-graph-viewer-handoff.md` (handoff pattern), `.../phase-7-memory-console.md` (memory console)

## Problem statement

The viewer renders one kind of graph today: the engine's code knowledge
graph (`ExportViewport` JSON from `GET /v1/graph/export`). The engine now
also hosts a tenant memory subsystem whose records form a natural graph -
supersession chains, and records grouped by the actor, application, and
session that produced them - but there is no way to see it. A tenant
debugging "what does my agent remember about user X, and how did those
facts evolve" has only flat tables.

The memory data is exportable today as NDJSON
(`GET /v1/memory/export`, one `MemoryRecord` JSON per line), but it is a
flat record list with no edges and no graph envelope, so the viewer cannot
load it. This plan adds a memory view that synthesizes the graph
client-side from the export, reusing the existing canvas.

## Decisions

| Topic | Decision |
|---|---|
| Where edges come from | Synthesized client-side in the loader from the flat records. No engine change is required for v1; an optional engine `GET /v1/memory/graph` endpoint is a v2 follow-up (contract sketched below) once the client-side model proves out. |
| Grouping topology | Hub nodes, not pairwise cliques. Shared attribution creates one hub node per distinct `actor_id` / `app_id` / `session_id` / `scope_id` value with an edge record->hub. Pairwise record-record edges for shared attribution would explode quadratically (1,000 records for one actor = ~500k edges); hubs keep it linear and read better visually. |
| Supersession | The one true record-to-record edge: `superseded_by` produces a directed `supersedes` edge (new -> old). Chains render as paths; superseded records get a distinct dimmed style. |
| Type system | A parallel memory model (`MemoryViewNode`/`MemoryViewEdge` and a `MemoryFilterState`), not a widening of the code enums. `NodeKind`/`EdgeRelation` are coupled to code semantics across `types.ts`, `graph-data.ts`, `theme.ts`, and every panel; widening them would leak memory concepts into the code view. The canvas layer (`RenderNode`/`RenderLink`) stays shared. |
| View selection | A top-level view mode (`code` / `memory`) in the existing single-page app, hosted next to the 2D/3D toggle in `RenderControls.tsx` and persisted in localStorage (`gv:view-mode`), mirroring `gv:render-mode`. No router, no second Vite entry page. |
| Data ingress | Same three paths as the code view: file picker (accepts `.ndjson` and `.json`), quick-load from `data/` samples, and console handoff (a memory variant of the phase-5 token redeem, delivering the NDJSON export). The viewer never holds an engine credential. |

## Memory graph model

Nodes:

| Node | Source | Visual |
|---|---|---|
| `record` | One per exported `MemoryRecord` | Color by `kind` (semantic/episodic/procedural); size by `importance` (with a small boost from `access_count`); dimmed + hollow when superseded or expired; `core` tier gets a ring highlight. |
| `actor` / `app` / `session` / `scope` hubs | One per distinct non-null value | Fixed per-dimension colors; square/diamond shape accents; size by member count. Hub kinds are individually toggleable. |

Edges:

| Edge | Source | Visual |
|---|---|---|
| `supersedes` | `record.superseded_by` (edge from replacement to replaced; the export must include superseded records, so load with `include_superseded=true`, `include_expired=true`) | Directed, accent color, always on top. |
| `belongs_to_actor` / `belongs_to_app` / `in_session` / `in_scope` | record -> hub | Thin, per-dimension color, opacity follows the hub toggle. |

Node tooltip: content preview (first ~140 chars), kind, tier, category,
importance/confidence, created/updated, access_count. The detail drawer
(memory `NodeDetail` variant) shows the full content and all fields.

## Requirements

### R1 - Types (`src/types.ts`)

`MemoryRecordExport` mirroring the engine's serialized `MemoryRecord`
(fields per `ugent-context-engine/docs/MEMORY.md` section 1; `tenant_id`
is never serialized and must not appear). `MemoryViewNode`
(`{ id, nodeType: "record" | "actor" | "app" | "session" | "scope", label,
record?: MemoryRecordExport, memberCount?: number }`), `MemoryViewEdge`
(`{ source, target, relation: "supersedes" | "belongs_to_actor" |
"belongs_to_app" | "in_session" | "in_scope" }`), `MemoryFilterState`
(kind set, tier set, category text, hub-dimension toggles, show
superseded/expired, search), and `ViewMode = "code" | "memory"`.

### R2 - Loader (`src/graph/memory-loader.ts`, new)

- `parseMemoryExport(text: string): MemoryRecordExport[]` - NDJSON parse
  (split lines, skip blanks, per-line `JSON.parse` with a tolerant
  error count surfaced to the UI; also accept a plain JSON array so
  hand-made files work).
- `buildMemoryGraph(records): { nodes: MemoryViewNode[], edges:
  MemoryViewEdge[], stats }` - hub synthesis and supersession edges as
  above; stats (record count, by kind/tier, hub counts, superseded count)
  feed the stats panel.
- Orphan tolerance: a `superseded_by` id missing from the export renders
  the edge to a stub node flagged `missing` rather than crashing.

### R3 - App orchestration (`src/ui/App.tsx`)

- `viewMode` state with localStorage persistence; switching modes swaps
  which loaded dataset and panel set is active (both datasets may stay in
  memory; no reload on toggle).
- File picker accepts `.ndjson`; when a file parses as NDJSON records (or
  a JSON array of records) it loads as memory data; an `ExportViewport`
  object loads as code data - detection by shape, with the current
  behavior unchanged for existing files.
- Quick-load: `data/manifest.json` gains an optional per-file
  `"type": "code" | "memory"`; add one seeded sample
  `data/memory-sample.ndjson` (~200 synthetic records with supersession
  chains and several actors/apps/sessions).

### R4 - Canvas mapping (`src/canvas/graph-data.ts`, `GraphCanvas.tsx`)

- A `buildMemoryGraphData` producing the existing `RenderGraphData`
  shape so `GraphCanvas` (2D and 3D), hover-neighbor highlighting,
  camera fly-to, and progressive loading are reused untouched apart from:
  - node size accessor: importance-based for records, member-count for
    hubs (instead of degree-log);
  - tooltip builder: memory variant;
  - link color/width: memory relation palette, `supersedes` arrows on.
- Reuse the large-graph prompt thresholds as-is.

### R5 - Panels

- `FilterPanel`: memory variant - kind checkboxes, tier checkboxes,
  hub-dimension toggles, show-superseded / show-expired switches,
  category contains-filter.
- `SearchBar`: reuse; search matches record content, category, and hub
  labels.
- `StatsPanel`: memory variant fed by loader stats.
- `NodeDetail`: memory variant (full content, all fields, and for hubs a
  member list capped at 50 with counts).
- `CommunityPanel`: hidden in memory mode for v1 (hubs already provide
  grouping; Louvain over hub topology is a follow-up).

### R6 - Theme (`src/theme/theme.ts`)

Memory palettes for both light and dark themes: three record-kind colors,
four hub-dimension colors, five edge-relation colors, plus the
superseded/expired dim treatment. Exposed via `memoryNodeColor(node)` /
`memoryEdgeColor(relation)` beside the existing accessors; CSS-variable
driven like everything else, honoring console handoff theming.

### R7 - Console handoff (cross-repo, optional for v1)

Extend the phase-5 handoff so the console can open the viewer directly on
a tenant's memory: the console adds a "View memory graph" action that
redeems a single-use token for a signed URL streaming
`GET /v1/memory/export?include_superseded=true&include_expired=true`
through the console BFF (the tenant key never reaches the viewer), and the
handoff payload gains `"dataType": "memory"` so `src/handoff/handoff.ts`
routes the fetched body to `parseMemoryExport`. Until that ships, tenants
download the NDJSON from the memory console and use the file picker.

## Optional v2: engine `GET /v1/memory/graph`

If client-side synthesis becomes limiting (very large tenants, server-side
filtering before graphing), add an engine endpoint returning a
viewer-ready envelope
`{ nodes: MemoryViewNode[], edges: MemoryViewEdge[], stats }` built by the
same hub rules, with the list endpoint's exact-match filters as query
parameters and `memory:read` scope. The client model in this plan is
deliberately shaped so that endpoint could feed `buildMemoryGraphData`
without change. Do not build it before the client-side path has proven
which filters matter.

## Acceptance criteria

- AC1: Loading a 5,000-record NDJSON export renders records, hubs, and
  supersession chains in both 2D and 3D with hover/click/search working,
  and the code view remains byte-identical in behavior for existing
  `ExportViewport` files.
- AC2: A supersession chain of 3+ records renders as a directed path;
  toggling "show superseded" hides the replaced records and their edges.
- AC3: Hub toggles add/remove whole dimensions without a reload; filters
  and search compose (e.g. kind=semantic + actor hub + content search).
- AC4: A malformed NDJSON line is skipped with a visible "N lines
  skipped" notice, never a blank screen.
- AC5: View mode, render mode, and orbit settings persist independently
  across reloads.
- AC6: No engine credential ever reaches the viewer; the only network
  sources are `/data/` samples and the console handoff URL.

## Implementation approach (ordered)

1. R1 types + R2 loader with unit-style assertions in a small
   `memory-loader.test.ts` (add vitest, or plain assertions run via
   `tsx`, matching the repo's no-CI reality).
2. R4 canvas mapping + R6 palette; render the seeded sample via the file
   picker.
3. R3 view-mode plumbing + quick-load manifest typing.
4. R5 panels (filter, stats, detail), memory tooltip.
5. Data sample + README section + AC pass.
6. R7 console handoff (coordinate with the console repo; separate PRs).

## Out of scope

- Editing memories from the viewer (the memory console owns mutations).
- Louvain communities over memory topology.
- The engine `GET /v1/memory/graph` endpoint (v2, contract above).
- Real-time updates from the memory event log.

## Open questions

- Should hub nodes for `agent_id` exist too? Left out of v1 (agents are
  attribution, and agent hubs largely duplicate app hubs in practice);
  trivially added to the loader if wanted.
- Content preview length in tooltips (140 chars proposed) - adjust after
  seeing real data density.
