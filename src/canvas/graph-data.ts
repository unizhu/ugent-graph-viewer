import Graph from "graphology";
import type { FilterState, NodeKind } from "../types";
import { nodeKindColor, edgeRelationColor } from "../theme/theme";

// Shared node/link builders used by both the 2D and 3D canvases. Kept in one
// place so the two render modes always agree on which nodes/links are visible
// and what color/size/relation each carries.

export interface RenderNode {
  id: string;
  label: string;
  kind: string;
  codebaseId: string;
  filePath: string;
  degree: number;
  color: string;
  communityId: number | null;
  childCount?: number;
}

export interface RenderLink {
  id: string;
  source: string;
  target: string;
  relation: string;
  confidence: number;
  color: string;
}

export interface RenderGraphData {
  nodes: RenderNode[];
  links: RenderLink[];
}

/** Check if a node should be hidden based on filter state. */
function shouldHideNode(
  filters: FilterState,
  data: {
    label: string;
    kind: string;
    codebaseId: string;
    filePath: string;
    degree: number;
    communityId: number | null;
  },
): boolean {
  if (filters.codebaseId && data.codebaseId !== filters.codebaseId) {
    return true;
  }
  if (filters.nodeKinds.size > 0 && !filters.nodeKinds.has(data.kind as NodeKind)) {
    return true;
  }
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
 * Cap a built {nodes, links} set to the top-`limit` nodes by degree,
 * dropping links whose endpoints fall outside the kept set. Used for
 * progressive loading (R18): the highest-degree nodes are the structural
 * backbone, so revealing them first keeps early frames meaningful.
 */
export function capByDegree(data: RenderGraphData, limit: number): RenderGraphData {
  if (!Number.isFinite(limit) || data.nodes.length <= limit) return data;
  const kept = [...data.nodes]
    .sort((a, b) => (b.degree || 0) - (a.degree || 0))
    .slice(0, limit);
  const keptIds = new Set(kept.map((n) => n.id));
  const links = data.links.filter((l) => {
    const src = typeof l.source === "object" ? (l.source as { id: string }).id : l.source;
    const tgt = typeof l.target === "object" ? (l.target as { id: string }).id : l.target;
    return keptIds.has(src) && keptIds.has(tgt);
  });
  return { nodes: kept, links };
}

/** Build node and link arrays at the symbol level (default mode). */
export function buildSymbolGraphData(graph: Graph, filters: FilterState): RenderGraphData {
  const nodes: RenderNode[] = [];
  const nodeMap = new Map<string, RenderNode>();

  graph.forEachNode((nodeId, attrs) => {
    const isHidden = shouldHideNode(filters, {
      label: attrs.label || nodeId,
      kind: attrs.kind,
      codebaseId: attrs.codebaseId,
      filePath: attrs.filePath,
      degree: attrs.degree || 0,
      communityId: attrs.communityId,
    });
    if (isHidden) return;

    const color = attrs.color || nodeKindColor(attrs.kind as NodeKind);
    const nodeObj: RenderNode = {
      id: nodeId,
      label: attrs.label || nodeId,
      kind: attrs.kind,
      codebaseId: attrs.codebaseId,
      filePath: attrs.filePath,
      degree: attrs.degree || 0,
      color,
      communityId: attrs.communityId,
    };
    nodes.push(nodeObj);
    nodeMap.set(nodeId, nodeObj);
  });

  const links: RenderLink[] = [];
  graph.forEachEdge((edgeId, attrs, source, target) => {
    if (!nodeMap.has(source) || !nodeMap.has(target)) return;
    if (filters.edgeRelations.size > 0 && !filters.edgeRelations.has(attrs.relation)) return;
    links.push({
      id: edgeId,
      source,
      target,
      relation: attrs.relation,
      confidence: attrs.confidence ?? 0.5,
      color: edgeRelationColor(attrs.relation),
    });
  });

  return { nodes, links };
}

/**
 * Build a file-level macro view: collapse symbol-level nodes onto their parent
 * file node (keyed by codebaseId::filePath) and dedupe edges by
 * (source_file, target_file, relation). Edges where source and target share
 * the same file are dropped (intra-file noise).
 */
export function buildAggregatedGraphData(graph: Graph, filters: FilterState): RenderGraphData {
  const fileKey = (codebaseId: string, filePath: string) =>
    `${codebaseId || ""}::${filePath || ""}`;

  const fileNodes = new Map<string, RenderNode>();
  const idToFileKey = new Map<string, string>();

  graph.forEachNode((nodeId, attrs) => {
    const isHidden = shouldHideNode(filters, {
      label: attrs.label || nodeId,
      kind: attrs.kind,
      codebaseId: attrs.codebaseId,
      filePath: attrs.filePath,
      degree: attrs.degree || 0,
      communityId: attrs.communityId,
    });
    if (isHidden) return;
    const filePath: string = attrs.filePath || "";
    if (!filePath) return;
    const codebaseId: string = attrs.codebaseId || "";
    const key = fileKey(codebaseId, filePath);
    idToFileKey.set(nodeId, key);

    const existing = fileNodes.get(key);
    if (existing) {
      existing.degree += attrs.degree || 0;
      existing.childCount = (existing.childCount ?? 0) + 1;
    } else {
      const fileLabel = filePath.split("/").pop() || filePath;
      fileNodes.set(key, {
        id: key,
        label: fileLabel,
        kind: "file",
        codebaseId,
        filePath,
        degree: attrs.degree || 0,
        color: nodeKindColor("file"),
        communityId: attrs.communityId,
        childCount: 1,
      });
    }
  });

  const links: RenderLink[] = [];
  const seenEdge = new Set<string>();
  graph.forEachEdge((_edgeId, attrs, source, target) => {
    const srcKey = idToFileKey.get(source);
    const tgtKey = idToFileKey.get(target);
    if (!srcKey || !tgtKey) return;
    if (srcKey === tgtKey) return;
    if (filters.edgeRelations.size > 0 && !filters.edgeRelations.has(attrs.relation)) return;

    const dedupeKey = `${srcKey}|${tgtKey}|${attrs.relation}`;
    if (seenEdge.has(dedupeKey)) return;
    seenEdge.add(dedupeKey);

    links.push({
      id: dedupeKey,
      source: srcKey,
      target: tgtKey,
      relation: attrs.relation,
      confidence: attrs.confidence ?? 0.5,
      color: edgeRelationColor(attrs.relation),
    });
  });

  return { nodes: Array.from(fileNodes.values()), links };
}

/** Build the render graph data for the current filters, applying a reveal cap. */
export function buildGraphData(
  graph: Graph,
  filters: FilterState,
  revealLimit?: number,
): RenderGraphData {
  const full = filters.aggregateMode
    ? buildAggregatedGraphData(graph, filters)
    : buildSymbolGraphData(graph, filters);
  if (revealLimit === undefined || !Number.isFinite(revealLimit)) return full;
  return capByDegree(full, revealLimit);
}

/** Node draw radius/volume from its degree (shared by both render modes). */
export function nodeSize(degree: number): number {
  return Math.min(18, 2 + Math.log2(degree + 1) * 3);
}
