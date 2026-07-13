import type { ExportStats } from "../types";

interface StatsPanelProps {
  stats: ExportStats;
  visibleNodes: number;
  visibleEdges: number;
  hiddenByKind?: number;
  hiddenByCommunity?: number;
  hiddenBySearch?: number;
  hiddenByCodebase?: number;
  isolatedHidden?: number;
}

export function StatsPanel({
  stats,
  visibleNodes,
  visibleEdges,
  hiddenByKind = 0,
  hiddenByCommunity = 0,
  hiddenBySearch = 0,
  hiddenByCodebase = 0,
  isolatedHidden = 0,
}: StatsPanelProps) {
  const showHiddenBreakdown =
    hiddenByKind > 0 ||
    hiddenByCommunity > 0 ||
    hiddenBySearch > 0 ||
    hiddenByCodebase > 0 ||
    isolatedHidden > 0;

  const cardStyle = { background: "var(--gv-surface-raised)" };
  const labelStyle = { color: "var(--gv-text-secondary)" };
  const valueStyle = { color: "var(--gv-text-primary)" };

  return (
    <div className="pt-4" style={{ borderTop: "1px solid var(--gv-border)" }}>
      <h2 className="text-sm font-semibold mb-2" style={labelStyle}>Statistics</h2>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded p-2" style={cardStyle}>
          <div style={labelStyle}>Total Nodes</div>
          <div className="font-mono" style={valueStyle}>{stats.total_nodes}</div>
        </div>
        <div className="rounded p-2" style={cardStyle}>
          <div style={labelStyle}>Total Edges</div>
          <div className="font-mono" style={valueStyle}>{stats.total_edges}</div>
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
          <div style={labelStyle}>Communities</div>
          <div className="font-mono" style={valueStyle}>{stats.communities}</div>
        </div>
      </div>
      {showHiddenBreakdown && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold mb-1" style={labelStyle}>Hidden</h3>
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            {isolatedHidden > 0 && (
              <div className="rounded px-2 py-1" style={cardStyle}>
                <span style={labelStyle}>isolated</span>{" "}
                <span className="text-amber-500 font-mono">{isolatedHidden}</span>
              </div>
            )}
            {hiddenByKind > 0 && (
              <div className="rounded px-2 py-1" style={cardStyle}>
                <span style={labelStyle}>by kind</span>{" "}
                <span className="text-amber-500 font-mono">{hiddenByKind}</span>
              </div>
            )}
            {hiddenByCommunity > 0 && (
              <div className="rounded px-2 py-1" style={cardStyle}>
                <span style={labelStyle}>by community</span>{" "}
                <span className="text-amber-500 font-mono">{hiddenByCommunity}</span>
              </div>
            )}
            {hiddenBySearch > 0 && (
              <div className="rounded px-2 py-1" style={cardStyle}>
                <span style={labelStyle}>by search</span>{" "}
                <span className="text-amber-500 font-mono">{hiddenBySearch}</span>
              </div>
            )}
            {hiddenByCodebase > 0 && (
              <div className="rounded px-2 py-1" style={cardStyle}>
                <span style={labelStyle}>by codebase</span>{" "}
                <span className="text-amber-500 font-mono">{hiddenByCodebase}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
