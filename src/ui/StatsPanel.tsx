import type { ExportStats } from "../types";

interface StatsPanelProps {
  stats: ExportStats;
  visibleNodes: number;
  visibleEdges: number;
}

export function StatsPanel({ stats, visibleNodes, visibleEdges }: StatsPanelProps) {
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
    </div>
  );
}
