import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Graph from "graphology";
import type { FilterState, CodebaseSummary, ExportStats, GraphNode, ExportViewport } from "../types";
import { loadGraph, parseViewport } from "../graph/loader";
import { applyFilters } from "../graph/filters";
import { runLayout } from "../graph/layout";
import { assignCommunityColors } from "../graph/communities";
import { FilterPanel } from "./FilterPanel";
import { SearchBar } from "./SearchBar";
import { StatsPanel } from "./StatsPanel";
import { NodeDetail } from "./NodeDetail";
import { SigmaCanvas } from "../canvas/SigmaCanvas";

// Store the raw viewport data for NodeDetail access.
let storedViewport: ExportViewport | null = null;

function getStoredNodes(): GraphNode[] {
  return storedViewport?.nodes ?? [];
}

export function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [codebases, setCodebases] = useState<CodebaseSummary[]>([]);
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    codebaseId: null,
    nodeKinds: new Set(),
    edgeRelations: new Set(),
    searchQuery: "",
  });
  const graphRef = useRef<Graph | null>(null);
  const sigmaRefreshRef = useRef<(() => void) | null>(null);

  const handleSigmaRefreshReady = useCallback((refresh: () => void) => {
    sigmaRefreshRef.current = refresh;
  }, []);

  const handleFileLoad = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLayoutRunning(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text !== "string") {
          setLayoutRunning(false);
          return;
        }
        try {
          const viewport = parseViewport(text);
          storedViewport = viewport;
          const g = loadGraph(viewport);
          assignCommunityColors(g);
          runLayout(g, 100);
          graphRef.current = g;
          setGraph(g);
          setCodebases(viewport.codebases);
          setStats(viewport.stats);
          setSelectedNode(null);
          setLayoutRunning(false);
        } catch {
          setLayoutRunning(false);
          alert("Failed to parse JSON. Ensure it is a valid ExportViewport.");
        }
      };
      reader.onerror = () => {
        setLayoutRunning(false);
        alert("Failed to read file.");
      };
      reader.readAsText(file, "UTF-8");
    },
    [],
  );

  // Apply filters and trigger Sigma refresh when filters change.
  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    applyFilters(g, filters);
    sigmaRefreshRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Derive visible counts from applying filters to graph.
  const visibility = useMemo(() => {
    if (!graphRef.current) return { visibleNodes: stats?.total_nodes ?? 0, visibleEdges: stats?.total_edges ?? 0 };
    return applyFilters(graphRef.current, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  if (!stats) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 bg-gray-950">
        <h1 className="text-2xl font-bold text-white">UGENT Graph Viewer</h1>
        <p className="text-gray-500 text-sm">
          Load a graph JSON file to begin exploring.
        </p>
        <label className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg
                          text-white font-medium cursor-pointer transition-colors">
          {layoutRunning ? "Loading..." : "Load Graph JSON"}
          <input
            type="file"
            accept=".json"
            onChange={handleFileLoad}
            disabled={layoutRunning}
            className="hidden"
          />
        </label>
        <p className="text-xs text-gray-600 mt-2">
          Export your graph via MCP: <code className="text-gray-500">graph_export</code>
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-gray-950">
      {/* Filter sidebar */}
      <div className="flex flex-col w-72 shrink-0">
        <FilterPanel
          codebases={codebases}
          stats={stats}
          filters={filters}
          onFiltersChange={setFilters}
        />
        <div className="px-4 py-2">
          <SearchBar
            value={filters.searchQuery}
            onChange={(q) => setFilters({ ...filters, searchQuery: q })}
          />
        </div>
        <div className="px-4">
          <StatsPanel
            stats={stats}
            visibleNodes={visibility.visibleNodes}
            visibleEdges={visibility.visibleEdges}
          />
        </div>
        <div className="px-4 pb-4">
          <NodeDetail
            node={
              selectedNode
                ? getStoredNodes().find((n) => n.id === selectedNode) ?? null
                : null
            }
          />
        </div>
        <div className="px-4 pb-4">
          <label className="w-full px-3 py-2 bg-gray-800 border border-gray-700
                            rounded-lg text-sm text-gray-300 cursor-pointer
                            hover:bg-gray-700 transition-colors text-center block">
            Load Different File
            <input
              type="file"
              accept=".json"
              onChange={handleFileLoad}
              disabled={layoutRunning}
              className="hidden"
            />
          </label>
        </div>
        {layoutRunning && (
          <div className="px-4 pb-4 text-xs text-gray-500 animate-pulse">
            Computing layout...
          </div>
        )}
      </div>

      {/* Sigma.js canvas */}
      <div className="flex-1 relative">
        {graph ? (
          <SigmaCanvas
            graph={graph}
            onNodeClick={(nodeId) => setSelectedNode(nodeId)}
            onRefreshReady={handleSigmaRefreshReady}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
            Loading graph...
          </div>
        )}
      </div>
    </div>
  );
}
