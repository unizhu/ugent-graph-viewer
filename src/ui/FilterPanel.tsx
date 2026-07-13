import type {
  FilterState,
  NodeKind,
  EdgeRelation,
  CodebaseSummary,
  ExportStats,
} from "../types";
import { nodeKindColor, edgeRelationColor } from "../theme/theme";

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
    <div
      className="w-72 p-4 flex flex-col gap-4 overflow-y-auto"
      style={{ background: "var(--gv-surface)", borderRight: "1px solid var(--gv-border)" }}
    >
      <h1 className="text-lg font-bold" style={{ color: "var(--gv-text-primary)" }}>
        UGENT Graph Viewer
      </h1>

      {/* Codebase selector */}
      <div>
        <label
          className="text-xs font-semibold mb-1 block"
          style={{ color: "var(--gv-text-secondary)" }}
        >
          Codebase
        </label>
        <select
          value={filters.codebaseId ?? ""}
          onChange={(e) =>
            selectCodebase(e.target.value || null)
          }
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gv-accent)]"
          style={{
            background: "var(--gv-surface-raised)",
            border: "1px solid var(--gv-border)",
            color: "var(--gv-text-primary)",
          }}
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
          <span className="text-xs font-semibold" style={{ color: "var(--gv-text-secondary)" }}>Node Kinds</span>
          <button
            onClick={() =>
              onFiltersChange({
                ...filters,
                nodeKinds: new Set(),
              })
            }
            className="text-xs hover:opacity-80"
            style={{ color: "var(--gv-accent)" }}
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {allNodeKinds.map((kind) => {
            const active = filters.nodeKinds.size === 0 || filters.nodeKinds.has(kind);
            const color = nodeKindColor(kind);
            const count = stats.nodes_by_kind[kind] || 0;
            return (
              <button
                key={kind}
                onClick={() => toggleKind(kind)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
                style={{
                  backgroundColor: active ? color : "var(--gv-surface-raised)",
                  color: active ? "#fff" : "var(--gv-text-secondary)",
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
          <span className="text-xs font-semibold" style={{ color: "var(--gv-text-secondary)" }}>
            Edge Relations
          </span>
          <button
            onClick={() =>
              onFiltersChange({
                ...filters,
                edgeRelations: new Set(),
              })
            }
            className="text-xs hover:opacity-80"
            style={{ color: "var(--gv-accent)" }}
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {allEdgeRelations.map((rel) => {
            const active =
              filters.edgeRelations.size === 0 || filters.edgeRelations.has(rel);
            const color = edgeRelationColor(rel);
            const count = stats.edges_by_relation[rel] || 0;
            return (
              <button
                key={rel}
                onClick={() => toggleRelation(rel)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
                style={{
                  backgroundColor: active ? color : "var(--gv-surface-raised)",
                  color: active ? "#fff" : "var(--gv-text-secondary)",
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

      {/* Quick toggles for kind visibility */}
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: "var(--gv-text-secondary)" }}>Quick Toggles</div>
        <div className="flex flex-wrap gap-1 mb-2">
          <KindQuickToggle
            label="Show files"
            kind="file"
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
          <KindQuickToggle
            label="Show blocks"
            kind="block"
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        </div>
      </div>

      {/* Isolated nodes toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--gv-text-secondary)" }}>
          Show Isolated Nodes
        </span>
        <button
          onClick={() =>
            onFiltersChange({
              ...filters,
              showIsolated: !filters.showIsolated,
            })
          }
          className="w-9 h-5 rounded-full transition-colors relative"
          style={{
            background: filters.showIsolated ? "var(--gv-accent)" : "var(--gv-border)",
            border: "1px solid var(--gv-border)",
          }}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              filters.showIsolated ? "left-[18px]" : "left-0.5"
            }`}
            style={{ border: "1px solid rgba(0,0,0,0.15)" }}
          />
        </button>
      </div>

      {/* Aggregate to file view toggle */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--gv-text-secondary)" }}
          title="Collapse symbol-level nodes into their parent file and dedupe edges between files."
        >
          Aggregate to File View
        </span>
        <button
          onClick={() =>
            onFiltersChange({
              ...filters,
              aggregateMode: !filters.aggregateMode,
            })
          }
          className="w-9 h-5 rounded-full transition-colors relative"
          style={{
            background: filters.aggregateMode ? "var(--gv-accent)" : "var(--gv-border)",
            border: "1px solid var(--gv-border)",
          }}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              filters.aggregateMode ? "left-[18px]" : "left-0.5"
            }`}
            style={{ border: "1px solid rgba(0,0,0,0.15)" }}
          />
        </button>
      </div>
    </div>
  );
}

interface KindQuickToggleProps {
  label: string;
  kind: NodeKind;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

function KindQuickToggle({
  label,
  kind,
  filters,
  onFiltersChange,
}: KindQuickToggleProps) {
  // When `nodeKinds` is empty all kinds are shown. Otherwise the kind is
  // shown only if it's in the set.
  const visible = filters.nodeKinds.size === 0 || filters.nodeKinds.has(kind);
  const color = nodeKindColor(kind);

  const onClick = () => {
    const next = new Set(filters.nodeKinds);
    if (next.size === 0) {
      // Empty means "all kinds"; toggling off means we have to enumerate
      // the visible kinds explicitly minus this one.
      const ALL: NodeKind[] = [
        "file",
        "module",
        "struct",
        "enum",
        "function",
        "trait",
        "type_alias",
        "constant",
        "impl",
        "block",
      ];
      for (const k of ALL) {
        if (k !== kind) next.add(k);
      }
    } else if (next.has(kind)) {
      next.delete(kind);
    } else {
      next.add(kind);
    }
    onFiltersChange({ ...filters, nodeKinds: next });
  };

  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded text-xs transition-all"
      style={{
        backgroundColor: visible ? color : "var(--gv-surface-raised)",
        color: visible ? "#fff" : "var(--gv-text-secondary)",
        opacity: visible ? 1 : 0.7,
      }}
    >
      {label}
    </button>
  );
}
