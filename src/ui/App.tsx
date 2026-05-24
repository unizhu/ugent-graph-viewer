import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Graph from "graphology";
import type { FilterState, CodebaseSummary, ExportStats, GraphNode, ExportViewport, CommunityInfo, NodeKind } from "../types";
import { loadGraph, parseViewport } from "../graph/loader";
import { countVisible } from "../graph/filters";
import { assignCommunityColors } from "../graph/communities";
import { detectCommunities, buildCommunityInfo } from "../graph/clustering";
import { FilterPanel } from "./FilterPanel";
import { CommunityPanel } from "./CommunityPanel";
import { SearchBar } from "./SearchBar";
import { StatsPanel } from "./StatsPanel";
import { NodeDetail } from "./NodeDetail";
import { ForceGraph3DCanvas } from "../canvas/ForceGraph3D";
import { useDebounce } from "./useDebounce";

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
  const [codebases, setCodebases] = useState<CodebaseSummary[]>([]);
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    codebaseId: null,
    nodeKinds: new Set(DEFAULT_NODE_KINDS),
    edgeRelations: new Set(),
    searchQuery: "",
    showIsolated: false,
    selectedCommunities: new Set(),
    aggregateMode: false,
  });
  const [manifestFiles, setManifestFiles] = useState<string[]>([]);
  const graphRef = useRef<Graph | null>(null);

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

  const loadViewport = useCallback((viewport: ExportViewport) => {
    setLoadingPhase("Parsing graph data...");
    storedViewport = viewport;

    // Use setTimeout to let the loading phase render before heavy work.
    setTimeout(() => {
      setLoadingPhase("Building graph structure...");
      // By default, prune isolated nodes (showIsolated=false).
      const g = loadGraph(viewport, true);

      // Detect communities client-side if not provided by the server.
      setLoadingPhase("Detecting communities...");
      detectCommunities(g);

      // Assign community colors based on detected communityIds.
      const communityColors = assignCommunityColors(g);

      setCodebases(viewport.codebases);
      setStats(viewport.stats);
      setSelectedNode(null);
      graphRef.current = g;

      // Reset filters. Default to code kinds (function/struct/...) for code
      // repos; for documents-only exports, pickDefaultKinds falls back to the
      // kinds actually present so the canvas isn't blank on first load.
      setFilters({
        codebaseId: null,
        nodeKinds: pickDefaultKinds(viewport),
        edgeRelations: new Set(),
        searchQuery: "",
        showIsolated: false,
        selectedCommunities: new Set(),
        aggregateMode: false,
      });

      // Build community info immediately.
      const infos = buildCommunityInfo(g, communityColors);
      setCommunities(infos);

      setGraph(g);
      setLoadingPhase("");
      setLayoutRunning(false);
    }, 0);
  }, []);

  const handleFileLoad = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLayoutRunning(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text !== "string") { setLayoutRunning(false); return; }
        try { loadViewport(parseViewport(text)); }
        catch { setLayoutRunning(false); alert("Failed to parse JSON."); }
      };
      reader.onerror = () => { setLayoutRunning(false); alert("Failed to read file."); };
      reader.readAsText(file, "UTF-8");
    },
    [loadViewport],
  );

  const handleLoadFromData = useCallback(
    (fileName: string) => {
      setLayoutRunning(true);
      fetch("/data/" + fileName)
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then((text) => loadViewport(parseViewport(text)))
        .catch((err) => { setLayoutRunning(false); alert("Failed to load " + fileName + ": " + err); });
    },
    [loadViewport],
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
    detectCommunities(g);
    const communityColors = assignCommunityColors(g);
    graphRef.current = g;
    
    const infos = buildCommunityInfo(g, communityColors);
    setCommunities(infos);
    setGraph(g);
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
        hiddenByCodebase: 0,
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

  if (!stats) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 bg-gray-950">
        <h1 className="text-2xl font-bold text-white">UGENT Graph Viewer</h1>
        <p className="text-gray-500 text-sm max-w-md text-center">
          Export your graph via CLI, then load it here to explore.
        </p>
        {manifestFiles.length > 0 && (
          <div className="flex flex-col gap-2 items-center">
            <p className="text-xs text-gray-600 mb-1">Available exports:</p>
            {manifestFiles.map((f) => (
              <button key={f} onClick={() => handleLoadFromData(f)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 font-mono transition-colors">
                {f}
              </button>
            ))}
          </div>
        )}
        <label className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium cursor-pointer transition-colors">
          {layoutRunning ? (loadingPhase || "Loading...") : "Load Graph JSON"}
          <input type="file" accept=".json" onChange={handleFileLoad} disabled={layoutRunning} className="hidden" />
        </label>
        <p className="text-xs text-gray-600 mt-2">
          Export: <code className="text-gray-500">ugent-context-engine graph export &lt;codebase_id&gt; --no-blocks --no-contains</code>
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-gray-950">
      <div className="flex flex-col w-72 shrink-0 overflow-y-auto">
        <FilterPanel codebases={codebases} stats={stats} filters={filters} onFiltersChange={setFilters} />
        <div className="px-4 py-2">
          <SearchBar value={filters.searchQuery} onChange={(q) => setFilters({ ...filters, searchQuery: q })} />
        </div>
        <div className="px-4 py-2">
          <CommunityPanel
            communities={communities}
            selectedCommunities={filters.selectedCommunities}
            onToggleCommunity={handleToggleCommunity}
            onClearSelection={handleClearCommunitySelection}
          />
        </div>
        <div className="px-4">
          <StatsPanel
            stats={stats}
            visibleNodes={visibility.visibleNodes}
            visibleEdges={visibility.visibleEdges}
            hiddenByKind={visibility.hiddenByKind}
            hiddenByCommunity={visibility.hiddenByCommunity}
            hiddenBySearch={visibility.hiddenBySearch}
            hiddenByCodebase={visibility.hiddenByCodebase}
            isolatedHidden={isolatedHidden}
          />
        </div>
        <div className="px-4 pb-4">
          <NodeDetail node={selectedNode ? getStoredNodes().find((n) => n.id === selectedNode) ?? null : null} />
        </div>
        <div className="px-4 pb-4 flex flex-col gap-2">
          <label className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors text-center block">
            Load Different File
            <input type="file" accept=".json" onChange={handleFileLoad} disabled={layoutRunning} className="hidden" />
          </label>
          {manifestFiles.length > 0 && (
            <div className="border-t border-gray-800 pt-2">
              <p className="text-xs text-gray-500 mb-1">Quick load:</p>
              {manifestFiles.map((f) => (
                <button key={f} onClick={() => handleLoadFromData(f)}
                  className="w-full text-left px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 rounded font-mono transition-colors">
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
        {layoutRunning && <div className="px-4 pb-4 text-xs text-blue-400 animate-pulse">{loadingPhase || "Computing layout..."}</div>}
      </div>
      <div className="flex-1 relative">
        {graph ? (
          <ForceGraph3DCanvas graph={graph} filters={debouncedFilters} onNodeClick={(nodeId) => setSelectedNode(nodeId)} selectedNodeId={selectedNode} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">Loading graph...</div>
        )}
      </div>
    </div>
  );
}
