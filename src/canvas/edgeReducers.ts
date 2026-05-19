import type { EdgeDisplayData } from "sigma/types";
import type { FilterState, EdgeRelation, ZoomLevel } from "../types";
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
  communityId: number | null;
  highlighted?: boolean;
}

function isNodeHidden(filters: FilterState, data: NodeData): boolean {
  if (filters.codebaseId && data.codebaseId !== filters.codebaseId) return true;
  if (filters.nodeKinds.size > 0 && !filters.nodeKinds.has(data.kind as any)) return true;
  if (
    filters.selectedCommunities.size > 0 &&
    data.communityId != null &&
    !filters.selectedCommunities.has(data.communityId)
  ) {
    return true;
  }
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    if (
      !data.label.toLowerCase().includes(q) &&
      !(data.filePath || "").toLowerCase().includes(q)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Create an edgeReducer with zoom-aware visibility.
 *
 * - far (zoomed out): hide all edges to reduce clutter
 * - mid: show edges only if both endpoints are visible
 * - close (zoomed in): show all edges with normal styling
 */
export function createEdgeReducer(
  filters: FilterState,
  graph: import("graphology").default,
  zoom: ZoomLevel = "mid",
): (edge: string, data: EdgeData) => Partial<EdgeDisplayData> {
  return (edge, data) => {
    // When zoomed way out, hide all edges for clean cluster view.
    if (zoom === "far") {
      return { size: 0, color: "transparent" };
    }

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

    // At mid zoom, only show edges connected to highlighted nodes.
    if (zoom === "mid" && !sourceData.highlighted && !targetData.highlighted) {
      const sourceDeg = sourceData.degree || 0;
      const targetDeg = targetData.degree || 0;
      // Show edges between reasonably connected nodes.
      if (sourceDeg < 3 && targetDeg < 3) {
        return { size: 0, color: "transparent" };
      }
    }

    const color =
      EDGE_RELATION_COLORS[
        data.relation as keyof typeof EDGE_RELATION_COLORS
      ] || "#374151";
    const conf = data.confidence ?? 0.5;
    const size = Math.max(0.5, conf * 2);

    return { size, color };
  };
}
