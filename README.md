# UGENT Graph Viewer

Interactive WebGL visualization for the ugent-context-engine knowledge graph.

Lives as a git submodule at `viewers/graph-viewer/` in the main engine repo.

## Quick Start

### 1. Export your graph

Use MCP tools to export a graph JSON file:

```
graph_list_codebases                    # discover codebase IDs
graph_export codebase_id="my-project"  # export filtered graph
```

Save the `data` field from the JSON-RPC response as `my-graph.json`.

### 2. Run the viewer

```bash
npm install
npm run dev
```

Open http://localhost:5180, click "Load Graph JSON", select your file.

## Features

- **Codebase selector** -- switch between indexed codebases
- **Node kind filters** -- toggle File, Module, Function, Struct, Enum, Trait, Block
- **Edge relation filters** -- toggle Imports, Calls, Contains, References, etc.
- **Search** -- filter visible nodes by name or file path
- **Community clusters** -- nodes colored by community detection
- **Hover highlighting** -- neighbors highlighted on hover
- **Click-to-inspect** -- node detail panel shows file, line range, community
- **Zoom/pan** -- mouse wheel + drag

## Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| Sigma.js | 3.0.3 | WebGL graph renderer |
| Graphology | 0.26.0 | Graph data structure |
| ForceAtlas2 | 0.10.1 | Force-directed layout |
| React | 19.2.5 | UI framework |
| Vite | 8.0.10 | Build tool |
| Tailwind CSS | 4.2.4 | Styling |
| TypeScript | 6.0.3 | Type safety |

## Architecture

```
Rust export (graph_export MCP tool)
  --> JSON file (ExportViewport)
    --> Graphology graph instance
      --> Sigma.js WebGL renderer
```

The viewer is a pure client-side app -- no server needed. Load a static JSON file and explore.
