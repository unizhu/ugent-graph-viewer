import Graph from "graphology";
import type { FilterState, NodeKind, EdgeRelation } from "../types";

/**
 * Apply filter state to a Graphology graph by tagging nodes/edges as hidden.
 * Returns the number of visible nodes and edges.
 */
export function applyFilters(
  graph: Graph,
  filters: FilterState,
): { visibleNodes: number; visibleEdges: number } {
  let visibleNodes = 0;
  let visibleEdges = 0;

  const hasKindFilter = filters.nodeKinds.size > 0;
  const hasRelationFilter = filters.edgeRelations.size > 0;

  // Phase 1: Mark nodes visible/hidden.
  const visibleNodeIds = new Set<string>();
  graph.forEachNode((node, attrs) => {
    let visible = true;

    if (filters.codebaseId && attrs.codebaseId !== filters.codebaseId) {
      visible = false;
    }

    if (visible && hasKindFilter) {
      if (!filters.nodeKinds.has(attrs.kind as NodeKind)) {
        visible = false;
      }
    }

    if (visible && filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      if (
        !attrs.label.toLowerCase().includes(q) &&
        !attrs.filePath.toLowerCase().includes(q)
      ) {
        visible = false;
      }
    }

    graph.setNodeAttribute(node, "hidden", !visible);
    if (visible) {
      visibleNodeIds.add(node);
      visibleNodes++;
    }
  });

  // Phase 2: Mark edges visible/hidden.
  graph.forEachEdge((edge, attrs, source, target) => {
    let visible = true;

    if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) {
      visible = false;
    }

    if (visible && hasRelationFilter) {
      if (!filters.edgeRelations.has(attrs.relation as EdgeRelation)) {
        visible = false;
      }
    }

    graph.setEdgeAttribute(edge, "hidden", !visible);
    if (visible) {
      visibleEdges++;
    }
  });

  return { visibleNodes, visibleEdges };
}
