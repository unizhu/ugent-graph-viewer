# UGENT Graph Viewer

Interactive 3D WebGL visualization for the ugent-context-engine knowledge
graph. Renders an `ExportViewport` as a force-directed graph you can filter,
search, and inspect.

The viewer runs two ways:

- **From the tenant console (primary).** The console's Codebases page has a
  **View graph** button that opens this app in a new tab and hands off a
  short-lived, single-use session over an origin-checked `postMessage`
  handshake. The viewer never holds an engine credential; the console
  proxies the graph export with its sealed key. See "Console handoff" below.
- **Standalone (local dev / debugging).** Load an exported JSON file
  directly, no console required.

## Quick start (standalone)

### 1. Export a graph

Use the engine's MCP tools to export a graph JSON file:

```
graph_list_codebases                    # discover codebase IDs
graph_export codebase_id="my-project"   # export a filtered graph
```

Save the `data` field of the JSON-RPC response as `my-graph.json`.

### 2. Run the viewer

```bash
pnpm install
pnpm dev
```

Open the dev URL, click **Load Graph JSON**, and select your file. You can
also deep-link a node with `?node=<node_id>` — the camera flies to it once
the layout settles.

## Console handoff

When opened from the console, the viewer completes this handshake:

1. On load (with a `window.opener`), the viewer posts `graph-viewer:ready`
   to the opener.
2. The console replies with `graph-viewer:handoff` carrying a single-use
   token, the console origin, the codebase id, the resolved theme (tokens +
   per-kind palette), and an optional focus node. The viewer validates that
   the message origin matches the claimed console origin.
3. The viewer redeems the token **once** at
   `{consoleOrigin}/api/graph/redeem` for a short-lived HMAC-signed data
   URL, then fetches it to load the `ExportViewport`.
4. On tab close the viewer beacons `{consoleOrigin}/api/graph/close`
   (`text/plain`, so no preflight) to revoke the session.

If a token expires and the opener is still open, the viewer re-requests a
fresh handoff automatically; otherwise it shows a "reopen from the console"
state. See the console's `docs/plans/phase-5-graph-viewer-handoff.md` for
the full contract.

### Theme

The viewer has no theme of its own — it applies the tokens and per-kind
palette from the handoff payload onto CSS variables (`src/theme/theme.ts`),
so it matches whatever light/dark theme the user chose in the console. When
run standalone it falls back to a dark theme.

## Features

- **3D force-directed canvas** with auto-orbit, hover neighbor highlighting,
  and click-to-focus.
- **Node kind / edge relation filters**, name/path **search**, and
  **community clustering** (Louvain).
- **Node inspector** — kind, id, file, line range, codebase, community.
- **Progressive loading** — graphs above a node-count threshold reveal in
  batches (highest-degree first) with a live node-count notice, so large
  tenant graphs stay responsive. Constants live in `src/ui/App.tsx`.
- **Deep-linking** via `?node=<id>` and via the handoff focus node.

## Memory graph view

Alongside the code graph, the viewer can explore a **memory export** — the
flat list of memory records the engine stores per tenant. Switch between
**Code** and **Memory** with the toggle in the sidebar header (each mode is
enabled once its dataset is loaded; the choice persists per session).

Load a memory export the same way as a code graph: **Load Graph JSON**
(also accepts `.ndjson`) or a **Quick load** manifest entry. The format is
detected by shape, so no mode switch is needed before loading:

- a JSON array of records,
- a `{ "records": [...] }` wrapper, or
- **NDJSON** (one record object per line; blank/malformed lines are skipped).

Each record becomes a node; identity fields (`actor_id`, `app_id`,
`agent_id`, `session_id`, `scope_id`) are synthesized into **hub nodes** that
records connect to via *membership* edges, and `superseded_by` produces
*supersession* edges (drawn only when the target record is in the export).
Hub dimensions can be toggled on/off without reloading. The memory panels
offer kind/tier/hub filters, a show-superseded and hide-orphans switch, a
stats panel, and a record/hub inspector (hubs list up to 50 members).

A seeded sample lives at [`data/memory-sample.ndjson`](data/memory-sample.ndjson)
(~200 synthetic records with supersession chains across several actors, apps,
and sessions) and is wired into the quick-load manifest.

## Tech stack

| Library | Purpose |
|---------|---------|
| react-force-graph-3d + three | 3D WebGL graph renderer |
| Graphology (+ louvain, forceatlas2, noverlap) | Graph structure, communities, layout |
| React | UI framework |
| Vite | Build tool |
| Tailwind CSS | Styling |
| TypeScript | Type safety |

## Architecture

```
Engine export (graph_export)  ──▶  ExportViewport JSON
                                        │
        console handoff  ──────────────┤  (or standalone file load)
                                        ▼
                            Graphology graph instance
                                        │
                                        ▼
                     react-force-graph-3d (three.js) canvas
```

The viewer is a client-side app. Graph data arrives either from the console
handoff (redeem → signed URL → fetch) or a local file; there is no viewer
backend.

## Security notes

- The viewer holds **no engine credential**. Handoff tokens are single-use
  and short-lived; the console proxies the actual engine export.
- All `postMessage` exchanges are origin-checked on both ends.
- No `localStorage`/`sessionStorage` and no tokens in the URL.
- File-snippet fetching is **out of scope** for v1 (there is no console
  proxy route for it); the previous in-browser engine-token input was
  removed.
