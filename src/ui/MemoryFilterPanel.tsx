import type { MemoryFilterState, MemoryHubDimension, MemoryStats } from "../types";
import { MEMORY_HUB_DIMENSIONS } from "../types";
import { memoryNodeColor } from "../theme/theme";

// Memory-view filter panel (R5). Parallels the code FilterPanel but over the
// memory dimensions: record kinds, tiers, identity-hub toggles, a
// show-superseded switch, and a hide-orphans switch. Kind/tier options are
// driven by the loader stats so only values present in the data are offered.

interface MemoryFilterPanelProps {
  stats: MemoryStats;
  filters: MemoryFilterState;
  onFiltersChange: (filters: MemoryFilterState) => void;
}

const HUB_LABEL: Record<MemoryHubDimension, string> = {
  actor: "Actor",
  app: "App",
  agent: "Agent",
  session: "Session",
  scope: "Scope",
};

export function MemoryFilterPanel({ stats, filters, onFiltersChange }: MemoryFilterPanelProps) {
  const toggleInSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const kinds = Object.keys(stats.byKind).sort();
  const tiers = Object.keys(stats.byTier).sort();

  return (
    <div className="px-4 pt-2 flex flex-col gap-4">
      {/* Record kinds */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: "var(--gv-text-secondary)" }}>Record Kinds</span>
          <button
            onClick={() => onFiltersChange({ ...filters, kinds: new Set() })}
            className="text-xs hover:opacity-80"
            style={{ color: "var(--gv-accent)" }}
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {kinds.map((kind) => {
            const active = filters.kinds.size === 0 || filters.kinds.has(kind);
            const count = stats.byKind[kind] || 0;
            return (
              <button
                key={kind}
                onClick={() => onFiltersChange({ ...filters, kinds: toggleInSet(filters.kinds, kind) })}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
                style={{
                  backgroundColor: active ? memoryNodeColor("record") : "var(--gv-surface-raised)",
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

      {/* Tiers */}
      {tiers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: "var(--gv-text-secondary)" }}>Tiers</span>
            <button
              onClick={() => onFiltersChange({ ...filters, tiers: new Set() })}
              className="text-xs hover:opacity-80"
              style={{ color: "var(--gv-accent)" }}
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {tiers.map((tier) => {
              const active = filters.tiers.size === 0 || filters.tiers.has(tier);
              const count = stats.byTier[tier] || 0;
              return (
                <button
                  key={tier}
                  onClick={() => onFiltersChange({ ...filters, tiers: toggleInSet(filters.tiers, tier) })}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
                  style={{
                    backgroundColor: active ? "var(--gv-accent)" : "var(--gv-surface-raised)",
                    color: active ? "var(--gv-accent-foreground)" : "var(--gv-text-secondary)",
                    opacity: active ? 1 : 0.5,
                  }}
                >
                  <span>{tier}</span>
                  <span className="tabular-nums">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Identity hubs */}
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: "var(--gv-text-secondary)" }}>Identity Hubs</div>
        <div className="flex flex-wrap gap-1">
          {MEMORY_HUB_DIMENSIONS.map((dim) => {
            const active = filters.hubs.has(dim);
            const count = stats.hubCounts[dim] || 0;
            return (
              <button
                key={dim}
                onClick={() => onFiltersChange({ ...filters, hubs: toggleInSet(filters.hubs, dim) })}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
                style={{
                  backgroundColor: active ? memoryNodeColor(dim) : "var(--gv-surface-raised)",
                  color: active ? "#fff" : "var(--gv-text-secondary)",
                  opacity: active ? 1 : 0.5,
                }}
              >
                <span>{HUB_LABEL[dim]}</span>
                <span className="tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Show superseded toggle */}
      <Toggle
        label="Show Superseded"
        on={filters.showSuperseded}
        onChange={(on) => onFiltersChange({ ...filters, showSuperseded: on })}
      />

      {/* Hide orphans toggle */}
      <Toggle
        label="Hide Orphan Records"
        title="Hide records that belong to no enabled identity hub."
        on={filters.hideOrphans}
        onChange={(on) => onFiltersChange({ ...filters, hideOrphans: on })}
      />
    </div>
  );
}

function Toggle({
  label,
  title,
  on,
  onChange,
}: {
  label: string;
  title?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold" style={{ color: "var(--gv-text-secondary)" }} title={title}>
        {label}
      </span>
      <button
        onClick={() => onChange(!on)}
        className="w-9 h-5 rounded-full transition-colors relative"
        style={{ background: on ? "var(--gv-accent)" : "var(--gv-border)", border: "1px solid var(--gv-border)" }}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            on ? "left-[18px]" : "left-0.5"
          }`}
          style={{ border: "1px solid rgba(0,0,0,0.15)" }}
        />
      </button>
    </div>
  );
}
