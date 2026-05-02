import type { EdgeDisplayData } from "sigma/types";
import type { FilterState, EdgeRelation } from "../types";
import { EDGE_RELATION_COLORS } from "../types";

interface EdgeData {
  relation: string;
  confidence: number;
  hidden?: boolean;
}

interface NodeData {
  kind: string;
  codebaseId: string;
  label: string;
  filePath: string;
  degree: number;
  color: string;
}

function isNodeHidden(filters: FilterState, data: NodeData): boolean {
  if (filters.codebaseId && data.codebaseId !== filters.codebaseId) return true;
  if (filters.nodeKinds.size > 0 && !filters.nodeKinds.has(data.kind as any)) return true;
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    if (!data.label.toLowerCase().includes(q) && !data.filePath.toLowerCase().includes(q)) return true;
  }
  return false;
}

/**
 * Create an edgeReducer that uses filter state.
 * Checks endpoint visibility by looking up node attributes from the graph.
 */
export function createEdgeReducer(
  filters: FilterState,
  graph: import("graphology").default,
): (edge: string, data: EdgeData) => Partial<EdgeDisplayData> {
  return (edge, data) => {
    // Look up endpoints to check visibility.
    const source = graph.source(edge);
    const target = graph.target(edge);
    const sourceData = graph.getNodeAttributes(source) as unknown as NodeData;
    const targetData = graph.getNodeAttributes(target) as unknown as NodeData;

    if (isNodeHidden(filters, sourceData) || isNodeHidden(filters, targetData)) {
      return { size: 0, color: "transparent" };
    }

    if (filters.edgeRelations.size > 0 && !filters.edgeRelations.has(data.relation as EdgeRelation)) {
      return { size: 0, color: "transparent" };
    }

    const color =
      EDGE_RELATION_COLORS[
        data.relation as keyof typeof EDGE_RELATION_COLORS
      ] || "#374151";
    const size = Math.max(0.5, (data.confidence || 0.5) * 2);

    return { size, color };
  };
}
