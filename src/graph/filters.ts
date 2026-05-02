import Graph from "graphology";
import type { FilterState, NodeKind, EdgeRelation } from "../types";

/**
 * Compute visibility counts from filter state WITHOUT mutating the graph.
 * The actual visual filtering is handled by nodeReducer/edgeReducer in Sigma.
 *
 * This function only counts visible nodes/edges for the stats panel.
 */
export function countVisible(
  graph: Graph,
  filters: FilterState,
): { visibleNodes: number; visibleEdges: number } {
  const hasKindFilter = filters.nodeKinds.size > 0;
  const hasRelationFilter = filters.edgeRelations.size > 0;
  const hasSearch = !!filters.searchQuery;

  // Fast path: no filters → everything visible.
  if (!filters.codebaseId && !hasKindFilter && !hasSearch && !hasRelationFilter) {
    return { visibleNodes: graph.order, visibleEdges: graph.size };
  }

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
    if (visible && hasSearch) {
      const q = filters.searchQuery.toLowerCase();
      if (
        !(attrs.label as string).toLowerCase().includes(q) &&
        !(attrs.filePath as string).toLowerCase().includes(q)
      ) {
        visible = false;
      }
    }

    if (visible) {
      visibleNodeIds.add(node);
    }
  });

  let visibleEdges = 0;
  graph.forEachEdge((_edge, attrs, source, target) => {
    if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) return;
    if (hasRelationFilter) {
      if (!filters.edgeRelations.has(attrs.relation as EdgeRelation)) return;
    }
    visibleEdges++;
  });

  return { visibleNodes: visibleNodeIds.size, visibleEdges };
}
