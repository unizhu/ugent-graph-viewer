import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Graph from "graphology";
import type { FilterState, CodebaseSummary, ExportStats, GraphNode, ExportViewport, CommunityInfo, NodeKind } from "../types";
import { loadGraph, parseViewport } from "../graph/loader";
import { countVisible } from "../graph/filters";
import { assignCommunityColors } from "../graph/communities";
import { detectCommunitiesAsync, buildCommunityInfo } from "../graph/clustering";
import { FilterPanel } from "./FilterPanel";
import { CommunityPanel } from "./CommunityPanel";
import { SearchBar } from "./SearchBar";
import { StatsPanel } from "./StatsPanel";
import { NodeDetail } from "./NodeDetail";
import { GraphCanvas } from "../canvas/GraphCanvas";
import { useDebounce } from "./useDebounce";
import { createHandoff, hasConsoleOpener, type HandoffState } from "../handoff/handoff";
import { HandoffStatus } from "./HandoffStatus";
import { ThemeToggle, useThemeName } from "./ThemeToggle";
import { RenderControls } from "./RenderControls";
import { LargeGraphPrompt, type LoadChoice } from "./LargeGraphPrompt";
import {
  type RenderMode,
  type OrbitSettings,
  loadRenderMode,
  saveRenderMode,
  loadOrbit,
  saveOrbit,
} from "../canvas/render-settings";

// Progressive loading (R18). Graphs with more than PROGRESSIVE_THRESHOLD
// nodes are revealed in batches so the first frame is fast and the UI stays
// responsive: the canvas seeds with PROGRESSIVE_INITIAL_BATCH highest-degree
// nodes, then adds PROGRESSIVE_BATCH_STEP more every PROGRESSIVE_INTERVAL_MS
// until the whole graph is shown. Tunable constants.
const PROGRESSIVE_THRESHOLD = 1500;
const PROGRESSIVE_INITIAL_BATCH = 800;
const PROGRESSIVE_BATCH_STEP = 600;
const PROGRESSIVE_INTERVAL_MS = 350;

// Above this node count, prompt the user to choose how to open the graph
// (File View / 2D full / 3D full) before rendering, so a huge export doesn't
// drop them straight into the heaviest path (R5). Tunable.
const LARGE_GRAPH_PROMPT_THRESHOLD = 8000;

const DEFAULT_NODE_KINDS = new Set<NodeKind>([
  "module",
  "struct",
  "enum",
  "function",
  "trait",
  "type_alias",
  "constant",
  "impl",
]);

// Pick a sensible default kind filter for a freshly loaded export.
// Code repos have function/struct/etc. and we want to hide file/block noise.
// Document-only exports (e.g. converted PDFs) only contain file+block — using
// the code-centric defaults would hide everything, so fall back to the kinds
// that actually exist in the data.
function pickDefaultKinds(viewport: ExportViewport): Set<NodeKind> {
  const present = new Set<NodeKind>();
  for (const [kind, count] of Object.entries(viewport.stats.nodes_by_kind)) {
    if (Number(count) > 0) present.add(kind as NodeKind);
  }
  const intersection = new Set<NodeKind>();
  for (const kind of DEFAULT_NODE_KINDS) {
    if (present.has(kind)) intersection.add(kind);
  }
  return intersection.size > 0 ? intersection : present;
}

let storedViewport: ExportViewport | null = null;

function getStoredNodes(): GraphNode[] {
  return storedViewport?.nodes ?? [];
}

interface Manifest {
  files: string[];
}

export function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string>("");
  const [workspaces, setWorkspaces] = useState<CodebaseSummary[]>([]);
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    workspaceId: null,
    nodeKinds: new Set(DEFAULT_NODE_KINDS),
    edgeRelations: new Set(),
    searchQuery: "",
    searchRegex: false,
    showIsolated: false,
    selectedCommunities: new Set(),
    aggregateMode: false,
  });
  const [manifestFiles, setManifestFiles] = useState<string[]>([]);
  const graphRef = useRef<Graph | null>(null);

  // Render mode (2D/3D) and auto-orbit settings, persisted per session (R1, R2).
  const [renderMode, setRenderMode] = useState<RenderMode>(() => loadRenderMode());
  const [orbit, setOrbit] = useState<OrbitSettings>(() => loadOrbit());
  useEffect(() => saveRenderMode(renderMode), [renderMode]);
  useEffect(() => saveOrbit(orbit), [orbit]);

  // Large-graph load prompt (R5): when a big viewport is pending, hold it here
  // and show the chooser instead of rendering straight away.
  const [pendingViewport, setPendingViewport] = useState<ExportViewport | null>(null);

  // Re-render the whole tree (chrome + canvas) when the theme changes, whether
  // from the console handoff or the sidebar toggle. The canvas reads
  // `currentTheme()` at render, so it needs App to re-render to re-tint.
  useThemeName();

  // Console handoff: when this tab was opened by the console, the graph is
  // delivered over a postMessage handshake rather than a file load. Null
  // means "standalone" (opened directly) - keep the file-load UI. A
  // non-null state drives the full-screen handoff surfaces (R14) until a
  // viewport arrives, after which the normal explorer renders.
  const [handoffState, setHandoffState] = useState<HandoffState | null>(null);
  const [focusNode, setFocusNode] = useState<string | null>(null);

  // Progressive reveal cap (R18). undefined = render everything (small
  // graphs). A finite value is ramped up by the effect below for large ones.
  const [revealLimit, setRevealLimit] = useState<number | undefined>(undefined);
  const [totalNodeCount, setTotalNodeCount] = useState(0);

  // Debounce search query to avoid excessive reducer recomputation.
  const debouncedSearchQuery = useDebounce(filters.searchQuery, 150);
  const debouncedFilters = useMemo(() => ({
    ...filters,
    searchQuery: debouncedSearchQuery,
  }), [filters, debouncedSearchQuery]);

  useEffect(() => {
    fetch("/data/manifest.json")
      .then((r) => r.json())
      .then((m: Manifest) => setManifestFiles(m.files ?? []))
      .catch(() => setManifestFiles([]));
  }, []);

  const loadViewport = useCallback((viewport: ExportViewport, choice?: LoadChoice) => {
    setLoadingPhase("Parsing graph data...");
    storedViewport = viewport;

    // Apply the load choice (R5): File View aggregates; 2D/3D full set the
    // render mode. Absent (small graph), keep symbol view + persisted mode.
    const aggregate = choice === "file";
    if (choice === "twod") setRenderMode("2d");
    else if (choice === "threed") setRenderMode("3d");

    // Use setTimeout to let the loading phase render before heavy work.
    setTimeout(async () => {
      setLoadingPhase("Building graph structure...");
      // By default, prune isolated nodes (showIsolated=false).
      const g = loadGraph(viewport, true);

      // Detect communities off the main thread (R3) if not provided by the
      // server; falls back to a synchronous pass when Workers are unavailable.
      setLoadingPhase("Detecting communities...");
      await detectCommunitiesAsync(g);

      // Assign community colors based on detected communityIds.
      const communityColors = assignCommunityColors(g);

      setWorkspaces(viewport.codebases);
      setStats(viewport.stats);
      setSelectedNode(null);
      graphRef.current = g;

      // Reset filters. Default to code kinds (function/struct/...) for code
      // repos; for documents-only exports, pickDefaultKinds falls back to the
      // kinds actually present so the canvas isn't blank on first load.
      setFilters({
        workspaceId: null,
        nodeKinds: pickDefaultKinds(viewport),
        edgeRelations: new Set(),
        searchQuery: "",
        searchRegex: false,
        showIsolated: false,
        selectedCommunities: new Set(),
        aggregateMode: aggregate,
      });

      // Build community info immediately.
      const infos = buildCommunityInfo(g, communityColors);
      setCommunities(infos);

      // Progressive loading (R18): for large graphs, seed the canvas with an
      // initial batch and let the ramp effect grow it; small graphs render in
      // full immediately.
      const nodeCount = g.order;
      setTotalNodeCount(nodeCount);
      setRevealLimit(nodeCount > PROGRESSIVE_THRESHOLD ? PROGRESSIVE_INITIAL_BATCH : undefined);

      setGraph(g);
      setLoadingPhase("");
      setLayoutRunning(false);
    }, 0);
  }, []);

  // Gate loads through the large-graph chooser (R5). Above the threshold we
  // stash the viewport and show the prompt; below it we load straight away.
  const beginLoad = useCallback((viewport: ExportViewport) => {
    const nodeCount = viewport.stats?.total_nodes ?? viewport.nodes?.length ?? 0;
    if (nodeCount > LARGE_GRAPH_PROMPT_THRESHOLD) {
      setLayoutRunning(false);
      setPendingViewport(viewport);
      return;
    }
    loadViewport(viewport);
  }, [loadViewport]);

  const handleLoadChoice = useCallback((choice: LoadChoice) => {
    const viewport = pendingViewport;
    setPendingViewport(null);
    if (!viewport) return;
    setLayoutRunning(true);
    loadViewport(viewport, choice);
  }, [pendingViewport, loadViewport]);

  // Progressive reveal ramp (R18): once a finite revealLimit is set, grow it
  // by PROGRESSIVE_BATCH_STEP on an interval until the whole graph is shown,
  // then clear the cap. Chunked insertion happens in the canvas memo, which
  // re-derives graphData from the new limit while keeping node positions.
  useEffect(() => {
    if (revealLimit === undefined || revealLimit >= totalNodeCount) return;
    const timer = window.setInterval(() => {
      setRevealLimit((prev) => {
        if (prev === undefined) return undefined;
        const next = prev + PROGRESSIVE_BATCH_STEP;
        return next >= totalNodeCount ? undefined : next; // undefined = full
      });
    }, PROGRESSIVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [revealLimit, totalNodeCount]);

  // Deep link: ?node=<id> focuses a node once the graph loads (R13). The
  // console may also send a focus node inside the handoff payload; whichever
  // is present wins (handoff payload takes precedence, set below).
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("node");
    if (fromUrl) setFocusNode(fromUrl);
  }, []);

  // Start the console handoff exactly once, only when opened with an opener.
  // Standalone opens (direct URL, file load) skip this entirely and keep the
  // existing loader UI.
  useEffect(() => {
    if (!hasConsoleOpener()) return;
    const controller = createHandoff((state) => {
      setHandoffState(state);
      if (state.status === "ready") {
        if (state.focusNode) setFocusNode(state.focusNode);
        beginLoad(state.viewport);
      }
    });
    controller.start();
    return () => controller.dispose();
  }, [beginLoad]);

  const handleFileLoad = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLayoutRunning(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text !== "string") { setLayoutRunning(false); return; }
        try { beginLoad(parseViewport(text)); }
        catch { setLayoutRunning(false); alert("Failed to parse JSON."); }
      };
      reader.onerror = () => { setLayoutRunning(false); alert("Failed to read file."); };
      reader.readAsText(file, "UTF-8");
    },
    [beginLoad],
  );

  const handleLoadFromData = useCallback(
    (fileName: string) => {
      setLayoutRunning(true);
      fetch("/data/" + fileName)
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then((text) => beginLoad(parseViewport(text)))
        .catch((err) => { setLayoutRunning(false); alert("Failed to load " + fileName + ": " + err); });
    },
    [beginLoad],
  );

  const handleToggleCommunity = useCallback((id: number) => {
    setFilters((prev) => {
      const next = new Set(prev.selectedCommunities);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, selectedCommunities: next };
    });
  }, []);

  const handleClearCommunitySelection = useCallback(() => {
    setFilters((prev) => ({ ...prev, selectedCommunities: new Set() }));
  }, []);

  // When showIsolated changes, we need to reload the graph with/without isolated nodes.
  const prevShowIsolated = useRef(false);
  useEffect(() => {
    if (!storedViewport || !graph) return;
    if (filters.showIsolated === prevShowIsolated.current) return;
    prevShowIsolated.current = filters.showIsolated;

    // Reload graph with new pruneIsolated setting.
    const viewport = storedViewport;
    const g = loadGraph(viewport, !filters.showIsolated);
    void detectCommunitiesAsync(g).then(() => {
      const communityColors = assignCommunityColors(g);
      graphRef.current = g;
      const infos = buildCommunityInfo(g, communityColors);
      setCommunities(infos);
      setGraph(g);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.showIsolated]);

  // Compute visible counts for the stats panel (read-only, no graph mutation).
  const visibility = useMemo(() => {
    if (!graphRef.current) {
      return {
        visibleNodes: stats?.total_nodes ?? 0,
        visibleEdges: stats?.total_edges ?? 0,
        hiddenByKind: 0,
        hiddenByCommunity: 0,
        hiddenBySearch: 0,
        hiddenByWorkspace: 0,
      };
    }
    return countVisible(graphRef.current, debouncedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilters, graph]);

  // Isolated nodes are pruned at load time when showIsolated=false. Surface
  // the count (total_nodes - graph.order) so the user can see how many were
  // removed and toggle them back on.
  const isolatedHidden = useMemo(() => {
    if (!stats || !graph || filters.showIsolated) return 0;
    return Math.max(0, stats.total_nodes - graph.order);
  }, [stats, graph, filters.showIsolated]);

  // While a console handoff is in flight (or ended in a terminal state)
  // and no graph has loaded yet, show the dedicated handoff surface instead
  // of the file-load screen (R14).
  if (handoffState && handoffState.status !== "ready" && !stats) {
    return <HandoffStatus state={handoffState} />;
  }

  if (!stats) {
    return (
      <div
        className="h-screen w-screen flex flex-col items-center justify-center gap-4"
        style={{ background: "var(--gv-bg)", color: "var(--gv-text-primary)" }}
      >
        <h1 className="text-2xl font-bold" style={{ color: "var(--gv-text-primary)" }}>UGENT Graph Viewer</h1>
        <p className="text-sm max-w-md text-center" style={{ color: "var(--gv-text-secondary)" }}>
          Export your graph via CLI, then load it here to explore.
        </p>
        {manifestFiles.length > 0 && (
          <div className="flex flex-col gap-2 items-center">
            <p className="text-xs mb-1" style={{ color: "var(--gv-text-secondary)" }}>Available exports:</p>
            {manifestFiles.map((f) => (
              <button key={f} onClick={() => handleLoadFromData(f)}
                className="px-4 py-2 rounded-lg text-sm font-mono transition-colors hover:opacity-80"
                style={{ background: "var(--gv-surface-raised)", color: "var(--gv-text-primary)" }}>
                {f}
              </button>
            ))}
          </div>
        )}
        <label
          className="px-6 py-3 rounded-lg font-medium cursor-pointer transition-opacity hover:opacity-90"
          style={{ background: "var(--gv-accent)", color: "var(--gv-accent-foreground)" }}
        >
          {layoutRunning ? (loadingPhase || "Loading...") : "Load Graph JSON"}
          <input type="file" accept=".json" onChange={handleFileLoad} disabled={layoutRunning} className="hidden" />
        </label>
        <p className="text-xs mt-2" style={{ color: "var(--gv-text-secondary)" }}>
          Export: <code style={{ color: "var(--gv-text-secondary)" }}>ugent-context-engine graph export &lt;codebase_id&gt; --no-blocks --no-contains</code>
        </p>
        {pendingViewport && (
          <LargeGraphPrompt
            nodeCount={pendingViewport.stats?.total_nodes ?? pendingViewport.nodes?.length ?? 0}
            edgeCount={pendingViewport.stats?.total_edges ?? pendingViewport.edges?.length ?? 0}
            onChoose={handleLoadChoice}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-screen"
      style={{ background: "var(--gv-bg)", color: "var(--gv-text-primary)" }}
    >
      <div
        className="flex flex-col w-72 shrink-0 h-screen min-h-0"
        style={{ background: "var(--gv-surface)", borderRight: "1px solid var(--gv-border)" }}
      >
        {/* Fixed header: title, theme, render controls. Always visible. */}
        <div className="shrink-0 px-4 pt-3 pb-3" style={{ borderBottom: "1px solid var(--gv-border)" }}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h1 className="text-base font-bold leading-tight" style={{ color: "var(--gv-text-primary)" }}>
              UGENT Graph Viewer
            </h1>
            <ThemeToggle />
          </div>
          <RenderControls
            mode={renderMode}
            onModeChange={setRenderMode}
            orbit={orbit}
            onOrbitChange={setOrbit}
          />
        </div>

        {/* Scrollable middle: the single scroll region for all content. */}
        <div className="flex-1 min-h-0 overflow-y-auto py-3">
          <FilterPanel workspaces={workspaces} stats={stats} filters={filters} onFiltersChange={setFilters} />
          <div className="px-4 py-2">
            <SearchBar
              value={filters.searchQuery}
              onChange={(q) => setFilters({ ...filters, searchQuery: q })}
              regexMode={filters.searchRegex}
              onRegexModeChange={(on) => setFilters({ ...filters, searchRegex: on })}
            />
          </div>
          <div className="px-4 py-2">
            <CommunityPanel
              communities={communities}
              selectedCommunities={filters.selectedCommunities}
              onToggleCommunity={handleToggleCommunity}
              onClearSelection={handleClearCommunitySelection}
            />
          </div>
          <div className="px-4 py-2">
            <StatsPanel
              stats={stats}
              visibleNodes={visibility.visibleNodes}
              visibleEdges={visibility.visibleEdges}
              hiddenByKind={visibility.hiddenByKind}
              hiddenByCommunity={visibility.hiddenByCommunity}
              hiddenBySearch={visibility.hiddenBySearch}
              hiddenByWorkspace={visibility.hiddenByWorkspace}
              isolatedHidden={isolatedHidden}
            />
          </div>
          <div className="px-4 py-2">
            <NodeDetail node={selectedNode ? getStoredNodes().find((n) => n.id === selectedNode) ?? null : null} />
          </div>
        </div>

        {/* Fixed footer: load controls + status. Always reachable. */}
        <div className="shrink-0 px-4 py-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--gv-border)" }}>
          <label
            className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors text-center block hover:opacity-80"
            style={{ background: "var(--gv-surface-raised)", border: "1px solid var(--gv-border)", color: "var(--gv-text-primary)" }}
          >
            Load Different File
            <input type="file" accept=".json" onChange={handleFileLoad} disabled={layoutRunning} className="hidden" />
          </label>
          {manifestFiles.length > 0 && (
            <div className="pt-2 max-h-24 overflow-y-auto" style={{ borderTop: "1px solid var(--gv-border)" }}>
              <p className="text-xs mb-1" style={{ color: "var(--gv-text-secondary)" }}>Quick load:</p>
              {manifestFiles.map((f) => (
                <button key={f} onClick={() => handleLoadFromData(f)}
                  className="w-full text-left px-2 py-1 text-xs rounded font-mono transition-colors hover:bg-[var(--gv-surface-raised)]"
                  style={{ color: "var(--gv-text-secondary)" }}>
                  {f}
                </button>
              ))}
            </div>
          )}
          {layoutRunning && <div className="text-xs animate-pulse" style={{ color: "var(--gv-accent)" }}>{loadingPhase || "Computing layout..."}</div>}
        </div>
      </div>
      <div className="flex-1 relative">
        {revealLimit !== undefined && totalNodeCount > PROGRESSIVE_THRESHOLD && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg flex items-center gap-2"
            style={{
              background: "var(--gv-surface-raised)",
              color: "var(--gv-text-primary)",
              border: "1px solid var(--gv-border)",
            }}
          >
            <span
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ background: "var(--gv-accent)" }}
              aria-hidden="true"
            />
            Loading large graph — showing {Math.min(revealLimit, totalNodeCount).toLocaleString()} of{" "}
            {totalNodeCount.toLocaleString()} nodes…
          </div>
        )}
        {graph ? (
          <GraphCanvas
            graph={graph}
            filters={debouncedFilters}
            onNodeClick={(nodeId) => setSelectedNode(nodeId)}
            selectedNodeId={selectedNode}
            focusNodeId={focusNode}
            onFocusHandled={() => setFocusNode(null)}
            revealLimit={revealLimit}
            mode={renderMode}
            orbit={orbit}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "var(--gv-text-secondary)" }}>Loading graph...</div>
        )}
      </div>
      {pendingViewport && (
        <LargeGraphPrompt
          nodeCount={pendingViewport.stats?.total_nodes ?? pendingViewport.nodes?.length ?? 0}
          edgeCount={pendingViewport.stats?.total_edges ?? pendingViewport.edges?.length ?? 0}
          onChoose={handleLoadChoice}
        />
      )}
    </div>
  );
}
