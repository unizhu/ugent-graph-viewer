import Graph from "graphology";
import type {
  FilterState,
  NodeKind,
  EdgeRelation,
  VisibilityCounts,
} from "../types";
import { compileSearch } from "./search";

/**
 * Compute visibility counts from filter state WITHOUT mutating the graph.
 * The actual visual filtering is handled by the ForceGraph3D `graphData`
 * memo (see src/canvas/graph-data.ts).
 *
 * Tracks per-reason hidden counts so the StatsPanel can surface why nodes
 * are missing from the canvas.
 */
export function countVisible(graph: Graph, filters: FilterState): VisibilityCounts {
  const hasKindFilter = filters.nodeKinds.size > 0;
  const hasRelationFilter = filters.edgeRelations.size > 0;
  const hasCommunityFilter = filters.selectedCommunities.size > 0;
  const searchMatcher = compileSearch(filters.searchQuery, filters.searchRegex);
  const hasSearch = !searchMatcher.isEmpty;

  let hiddenByKind = 0;
  let hiddenByCommunity = 0;
  let hiddenBySearch = 0;
  let hiddenByCodebase = 0;

  // Fast path: no filters -> everything visible.
  if (
    !filters.codebaseId &&
    !hasKindFilter &&
    !hasSearch &&
    !hasRelationFilter &&
    !hasCommunityFilter
  ) {
    return {
      visibleNodes: graph.order,
      visibleEdges: graph.size,
      hiddenByKind: 0,
      hiddenByCommunity: 0,
      hiddenBySearch: 0,
      hiddenByCodebase: 0,
    };
  }

  const visibleNodeIds = new Set<string>();

  graph.forEachNode((node, attrs) => {
    let visible = true;
    let blamed = false;

    if (filters.codebaseId && attrs.codebaseId !== filters.codebaseId) {
      visible = false;
      if (!blamed) {
        hiddenByCodebase++;
        blamed = true;
      }
    }
    if (visible && hasKindFilter) {
      if (!filters.nodeKinds.has(attrs.kind as NodeKind)) {
        visible = false;
        if (!blamed) {
          hiddenByKind++;
          blamed = true;
        }
      }
    }
    if (visible && hasCommunityFilter) {
      const cid = attrs.communityId as number | null;
      if (cid != null && !filters.selectedCommunities.has(cid)) {
        visible = false;
        if (!blamed) {
          hiddenByCommunity++;
          blamed = true;
        }
      }
    }
    if (visible && hasSearch) {
      if (!searchMatcher.test((attrs.label as string) || "", (attrs.filePath as string) || "")) {
        visible = false;
        if (!blamed) {
          hiddenBySearch++;
          blamed = true;
        }
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

  return {
    visibleNodes: visibleNodeIds.size,
    visibleEdges,
    hiddenByKind,
    hiddenByCommunity,
    hiddenBySearch,
    hiddenByCodebase,
  };
}
