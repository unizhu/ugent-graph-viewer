import type {
  FilterState,
  NodeKind,
  EdgeRelation,
  CodebaseSummary,
  ExportStats,
} from "../types";
import { NODE_KIND_COLORS, EDGE_RELATION_COLORS } from "../types";

interface FilterPanelProps {
  codebases: CodebaseSummary[];
  stats: ExportStats;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

export function FilterPanel({
  codebases,
  stats,
  filters,
  onFiltersChange,
}: FilterPanelProps) {
  const toggleKind = (kind: NodeKind) => {
    const next = new Set(filters.nodeKinds);
    if (next.has(kind)) {
      next.delete(kind);
    } else {
      next.add(kind);
    }
    onFiltersChange({ ...filters, nodeKinds: next });
  };

  const toggleRelation = (rel: EdgeRelation) => {
    const next = new Set(filters.edgeRelations);
    if (next.has(rel)) {
      next.delete(rel);
    } else {
      next.add(rel);
    }
    onFiltersChange({ ...filters, edgeRelations: next });
  };

  const selectCodebase = (id: string | null) => {
    onFiltersChange({
      ...filters,
      codebaseId: id,
      nodeKinds: new Set(),
      edgeRelations: new Set(),
      searchQuery: "",
    });
  };

  const allNodeKinds = Object.keys(stats.nodes_by_kind) as NodeKind[];
  const allEdgeRelations = Object.keys(stats.edges_by_relation) as EdgeRelation[];

  return (
    <div className="w-72 bg-gray-900 border-r border-gray-800 p-4 flex flex-col gap-4 overflow-y-auto">
      <h1 className="text-lg font-bold text-white">UGENT Graph Viewer</h1>

      {/* Codebase selector */}
      <div>
        <label className="text-xs font-semibold text-gray-400 mb-1 block">
          Codebase
        </label>
        <select
          value={filters.codebaseId ?? ""}
          onChange={(e) =>
            selectCodebase(e.target.value || null)
          }
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
                     text-sm text-gray-200 focus:outline-none focus:ring-2
                     focus:ring-blue-500"
        >
          <option value="">All ({codebases.length})</option>
          {codebases.map((c) => (
            <option key={c.codebase_id} value={c.codebase_id}>
              {c.codebase_id} ({c.node_count} nodes)
            </option>
          ))}
        </select>
      </div>

      {/* Node kind toggles */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-400">Node Kinds</span>
          <button
            onClick={() =>
              onFiltersChange({
                ...filters,
                nodeKinds: new Set(),
              })
            }
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {allNodeKinds.map((kind) => {
            const active = filters.nodeKinds.size === 0 || filters.nodeKinds.has(kind);
            const color = NODE_KIND_COLORS[kind] || "#6b7280";
            const count = stats.nodes_by_kind[kind] || 0;
            return (
              <button
                key={kind}
                onClick={() => toggleKind(kind)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
                style={{
                  backgroundColor: active ? color : "#1f2937",
                  color: active ? "#fff" : "#6b7280",
                  opacity: active ? 1 : 0.5,
                }}
              >
                <span>{kind}</span>
                <span className="tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Edge relation toggles */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-400">
            Edge Relations
          </span>
          <button
            onClick={() =>
              onFiltersChange({
                ...filters,
                edgeRelations: new Set(),
              })
            }
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {allEdgeRelations.map((rel) => {
            const active =
              filters.edgeRelations.size === 0 || filters.edgeRelations.has(rel);
            const color = EDGE_RELATION_COLORS[rel] || "#374151";
            const count = stats.edges_by_relation[rel] || 0;
            return (
              <button
                key={rel}
                onClick={() => toggleRelation(rel)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
                style={{
                  backgroundColor: active ? color : "#1f2937",
                  color: active ? "#fff" : "#6b7280",
                  opacity: active ? 1 : 0.5,
                }}
              >
                <span>{rel}</span>
                <span className="tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Isolated nodes toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">
          Show Isolated Nodes
        </span>
        <button
          onClick={() =>
            onFiltersChange({
              ...filters,
              showIsolated: !filters.showIsolated,
            })
          }
          className={`w-9 h-5 rounded-full transition-colors relative ${
            filters.showIsolated ? "bg-blue-500" : "bg-gray-700"
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              filters.showIsolated ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
