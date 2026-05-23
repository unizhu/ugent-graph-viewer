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

  return (
    <div className="border-t border-gray-800 pt-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-2">Statistics</h2>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800 rounded p-2">
          <div className="text-gray-500">Total Nodes</div>
          <div className="text-white font-mono">{stats.total_nodes}</div>
        </div>
        <div className="bg-gray-800 rounded p-2">
          <div className="text-gray-500">Total Edges</div>
          <div className="text-white font-mono">{stats.total_edges}</div>
        </div>
        <div className="bg-gray-800 rounded p-2">
          <div className="text-gray-500">Visible Nodes</div>
          <div className="text-green-400 font-mono">{visibleNodes}</div>
        </div>
        <div className="bg-gray-800 rounded p-2">
          <div className="text-gray-500">Visible Edges</div>
          <div className="text-green-400 font-mono">{visibleEdges}</div>
        </div>
        <div className="bg-gray-800 rounded p-2 col-span-2">
          <div className="text-gray-500">Communities</div>
          <div className="text-white font-mono">{stats.communities}</div>
        </div>
      </div>
      {showHiddenBreakdown && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold text-gray-500 mb-1">Hidden</h3>
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            {isolatedHidden > 0 && (
              <div className="bg-gray-800/60 rounded px-2 py-1">
                <span className="text-gray-500">isolated</span>{" "}
                <span className="text-amber-400 font-mono">{isolatedHidden}</span>
              </div>
            )}
            {hiddenByKind > 0 && (
              <div className="bg-gray-800/60 rounded px-2 py-1">
                <span className="text-gray-500">by kind</span>{" "}
                <span className="text-amber-400 font-mono">{hiddenByKind}</span>
              </div>
            )}
            {hiddenByCommunity > 0 && (
              <div className="bg-gray-800/60 rounded px-2 py-1">
                <span className="text-gray-500">by community</span>{" "}
                <span className="text-amber-400 font-mono">{hiddenByCommunity}</span>
              </div>
            )}
            {hiddenBySearch > 0 && (
              <div className="bg-gray-800/60 rounded px-2 py-1">
                <span className="text-gray-500">by search</span>{" "}
                <span className="text-amber-400 font-mono">{hiddenBySearch}</span>
              </div>
            )}
            {hiddenByCodebase > 0 && (
              <div className="bg-gray-800/60 rounded px-2 py-1">
                <span className="text-gray-500">by codebase</span>{" "}
                <span className="text-amber-400 font-mono">{hiddenByCodebase}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
