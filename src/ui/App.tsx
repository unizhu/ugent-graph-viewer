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
  const [codebases, setCodebases] = useState<CodebaseSummary[]>([]);
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    codebaseId: null,
    nodeKinds: new Set(),
    edgeRelations: new Set(),
    searchQuery: "",
  });
  const [manifestFiles, setManifestFiles] = useState<string[]>([]);
  const graphRef = useRef<Graph | null>(null);
  const sigmaRefreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetch("/data/manifest.json")
      .then((r) => r.json())
      .then((m: Manifest) => setManifestFiles(m.files ?? []))
      .catch(() => setManifestFiles([]));
  }, []);

  const handleSigmaRefreshReady = useCallback((refresh: () => void) => {
    sigmaRefreshRef.current = refresh;
  }, []);

  const loadViewport = useCallback((viewport: ExportViewport) => {
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

  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    applyFilters(g, filters);
    sigmaRefreshRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const visibility = useMemo(() => {
    if (!graphRef.current) return { visibleNodes: stats?.total_nodes ?? 0, visibleEdges: stats?.total_edges ?? 0 };
    return applyFilters(graphRef.current, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

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
          {layoutRunning ? "Loading..." : "Load Graph JSON"}
          <input type="file" accept=".json" onChange={handleFileLoad} disabled={layoutRunning} className="hidden" />
        </label>
        <p className="text-xs text-gray-600 mt-2">
          Export: <code className="text-gray-500">ugent-context-engine graph export &lt;codebase_id&gt;</code>
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-gray-950">
      <div className="flex flex-col w-72 shrink-0">
        <FilterPanel codebases={codebases} stats={stats} filters={filters} onFiltersChange={setFilters} />
        <div className="px-4 py-2">
          <SearchBar value={filters.searchQuery} onChange={(q) => setFilters({ ...filters, searchQuery: q })} />
        </div>
        <div className="px-4">
          <StatsPanel stats={stats} visibleNodes={visibility.visibleNodes} visibleEdges={visibility.visibleEdges} />
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
        {layoutRunning && <div className="px-4 pb-4 text-xs text-gray-500 animate-pulse">Computing layout...</div>}
      </div>
      <div className="flex-1 relative">
        {graph ? (
          <SigmaCanvas graph={graph} onNodeClick={(nodeId) => setSelectedNode(nodeId)} onRefreshReady={handleSigmaRefreshReady} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">Loading graph...</div>
        )}
      </div>
    </div>
  );
}
