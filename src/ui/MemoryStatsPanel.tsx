import type { MemoryStats } from "../types";

// Memory-view stats panel (R5), fed by the loader's derived stats. Shows total
// and superseded record counts, visible node/edge counts for the current
// filters, and per-dimension hub counts.

interface MemoryStatsPanelProps {
  stats: MemoryStats;
  visibleNodes: number;
  visibleEdges: number;
}

export function MemoryStatsPanel({ stats, visibleNodes, visibleEdges }: MemoryStatsPanelProps) {
  const cardStyle = { background: "var(--gv-surface-raised)", border: "1px solid var(--gv-border)" };
  const labelStyle = { color: "var(--gv-text-secondary)" };
  const valueStyle = { color: "var(--gv-text-primary)" };

  const hubTotal = Object.values(stats.hubCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="pt-4" style={{ borderTop: "1px solid var(--gv-border)" }}>
      <h2 className="text-sm font-semibold mb-2" style={labelStyle}>Statistics</h2>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded p-2" style={cardStyle}>
          <div style={labelStyle}>Records</div>
          <div className="font-mono" style={valueStyle}>{stats.totalRecords}</div>
        </div>
        <div className="rounded p-2" style={cardStyle}>
          <div style={labelStyle}>Superseded</div>
          <div className="font-mono" style={valueStyle}>{stats.supersededRecords}</div>
        </div>
        <div className="rounded p-2" style={cardStyle}>
          <div style={labelStyle}>Visible Nodes</div>
          <div className="font-mono" style={{ color: "var(--gv-accent)" }}>{visibleNodes}</div>
        </div>
        <div className="rounded p-2" style={cardStyle}>
          <div style={labelStyle}>Visible Edges</div>
          <div className="font-mono" style={{ color: "var(--gv-accent)" }}>{visibleEdges}</div>
        </div>
        <div className="rounded p-2 col-span-2" style={cardStyle}>
          <div style={labelStyle}>Hubs</div>
          <div className="font-mono" style={valueStyle}>{hubTotal}</div>
        </div>
      </div>

      <div className="mt-3">
        <h3 className="text-xs font-semibold mb-1" style={labelStyle}>Hubs by dimension</h3>
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          {(Object.keys(stats.hubCounts) as (keyof MemoryStats["hubCounts"])[]).map((dim) => (
            <div key={dim} className="rounded px-2 py-1" style={cardStyle}>
              <span style={labelStyle}>{dim}</span>{" "}
              <span className="font-mono" style={{ color: "var(--gv-accent)" }}>{stats.hubCounts[dim]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
