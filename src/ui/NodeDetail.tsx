import type { GraphNode } from "../types";
import { NODE_KIND_COLORS } from "../types";

interface NodeDetailProps {
  node: GraphNode | null;
}

export function NodeDetail({ node }: NodeDetailProps) {
  if (!node) {
    return (
      <div className="border-t border-gray-800 pt-4">
        <h2 className="text-sm font-semibold text-gray-400 mb-2">Node Detail</h2>
        <p className="text-xs text-gray-600">Click a node to inspect.</p>
      </div>
    );
  }

  const kindColor = NODE_KIND_COLORS[node.kind] || "#6b7280";

  return (
    <div className="border-t border-gray-800 pt-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-2">Node Detail</h2>
      <div className="space-y-2 text-xs">
        <div>
          <span
            className="inline-block px-2 py-0.5 rounded text-white text-xs"
            style={{ backgroundColor: kindColor }}
          >
            {node.kind}
          </span>
          <span className="ml-2 text-white font-mono">{node.name}</span>
        </div>
        <div>
          <div className="text-gray-500">ID</div>
          <div className="text-gray-300 font-mono break-all">{node.id}</div>
        </div>
        <div>
          <div className="text-gray-500">File</div>
          <div className="text-gray-300 font-mono">{node.file_path}</div>
        </div>
        <div>
          <div className="text-gray-500">Lines</div>
          <div className="text-gray-300 font-mono">
            {node.line_range[0]}-{node.line_range[1]}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Codebase</div>
          <div className="text-gray-300 font-mono">{node.codebase_id}</div>
        </div>
        {node.community_id != null && (
          <div>
            <div className="text-gray-500">Community</div>
            <div className="text-gray-300 font-mono">{node.community_id}</div>
          </div>
        )}
      </div>
    </div>
  );
}
