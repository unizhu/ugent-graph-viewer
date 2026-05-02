import type { NodeDisplayData } from "sigma/types";
import type { FilterState, NodeKind } from "../types";
import { NODE_KIND_COLORS } from "../types";

interface NodeData {
  label: string;
  kind: string;
  codebaseId: string;
  filePath: string;
  degree: number;
  color: string;
  x: number;
  y: number;
  hidden?: boolean;
  highlighted?: boolean;
}

/**
 * Check if a node should be hidden based on filter state.
 * Pure function — no graph mutation.
 */
function shouldHideNode(filters: FilterState, data: NodeData): boolean {
  if (filters.codebaseId && data.codebaseId !== filters.codebaseId) {
    return true;
  }
  if (filters.nodeKinds.size > 0 && !filters.nodeKinds.has(data.kind as NodeKind)) {
    return true;
  }
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    if (
      !data.label.toLowerCase().includes(q) &&
      !data.filePath.toLowerCase().includes(q)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Create a nodeReducer that uses filter state to hide/show nodes.
 *
 * IMPORTANT: Sigma.js v3 nodeReducer output REPLACES node attributes,
 * it is NOT merged. The reducer MUST return x and y for every node.
 */
export function createNodeReducer(
  filters: FilterState,
): (_key: string, data: NodeData) => Partial<NodeDisplayData> {
  return (_key, data) => {
    if (shouldHideNode(filters, data)) {
      return { x: data.x, y: data.y, size: 0, color: "transparent" };
    }

    const degree = data.degree || 0;
    const size = Math.min(20, Math.max(3, 3 + degree * 1.5));
    const color =
      data.color ||
      NODE_KIND_COLORS[data.kind as keyof typeof NODE_KIND_COLORS] ||
      "#6b7280";
    const showLabel = degree >= 2;
    const label = showLabel ? data.label : "";

    // Must include x, y — Sigma replaces attributes with reducer output.
    return { x: data.x, y: data.y, size, color, label };
  };
}
