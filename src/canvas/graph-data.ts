import Graph from "graphology";
import type {
  FilterState,
  NodeKind,
  MemoryFilterState,
  MemoryNodeKind,
  MemoryEdgeKind,
  MemoryHubDimension,
  MemoryRecordExport,
} from "../types";
import { nodeKindColor, edgeRelationColor, memoryNodeColor, memoryEdgeColor } from "../theme/theme";
import { compileSearch, type SearchMatcher } from "../graph/search";

// Shared node/link builders used by both the 2D and 3D canvases. Kept in one
// place so the two render modes always agree on which nodes/links are visible
// and what color/size/relation each carries.

export interface RenderNode {
  id: string;
  label: string;
  kind: string;
  workspaceId: string;
  filePath: string;
  degree: number;
  color: string;
  communityId: number | null;
  childCount?: number;
  // --- Memory-view fields (present only when built by buildMemoryGraphData) ---
  /** Discriminates the render path: memory nodes carry a memoryKind. */
  memoryKind?: MemoryNodeKind;
  /** For memory record nodes: the source record, for the detail/tooltip. */
  record?: MemoryRecordExport;
  /** For memory hub nodes: member count, used for node sizing. */
  memberCount?: number;
}

export interface RenderLink {
  id: string;
  source: string;
  target: string;
  relation: string;
  confidence: number;
  color: string;
  /** Memory-view edge kind (membership/supersession); absent for code links. */
  memoryEdgeKind?: MemoryEdgeKind;
}

export interface RenderGraphData {
  nodes: RenderNode[];
  links: RenderLink[];
}

/** Check if a node should be hidden based on filter state. */
function shouldHideNode(
  filters: FilterState,
  matcher: SearchMatcher,
  data: {
    label: string;
    kind: string;
    workspaceId: string;
    filePath: string;
    degree: number;
    communityId: number | null;
  },
): boolean {
  if (filters.workspaceId && data.workspaceId !== filters.workspaceId) {
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
  if (!matcher.isEmpty && !matcher.test(data.label, data.filePath || "")) {
    return true;
  }
  return false;
}

/** Build node and link arrays at the symbol level (default mode). */
export function buildSymbolGraphData(graph: Graph, filters: FilterState): RenderGraphData {
  const nodes: RenderNode[] = [];
  const nodeMap = new Map<string, RenderNode>();
  const matcher = compileSearch(filters.searchQuery, filters.searchRegex);

  graph.forEachNode((nodeId, attrs) => {
    const isHidden = shouldHideNode(filters, matcher, {
      label: attrs.label || nodeId,
      kind: attrs.kind,
      workspaceId: attrs.workspaceId,
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
      workspaceId: attrs.workspaceId,
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
 * file node (keyed by workspaceId::filePath) and dedupe edges by
 * (source_file, target_file, relation). Edges where source and target share
 * the same file are dropped (intra-file noise).
 */
export function buildAggregatedGraphData(graph: Graph, filters: FilterState): RenderGraphData {
  const fileKey = (workspaceId: string, filePath: string) =>
    `${workspaceId || ""}::${filePath || ""}`;

  const fileNodes = new Map<string, RenderNode>();
  const idToFileKey = new Map<string, string>();
  const matcher = compileSearch(filters.searchQuery, filters.searchRegex);

  graph.forEachNode((nodeId, attrs) => {
    const isHidden = shouldHideNode(filters, matcher, {
      label: attrs.label || nodeId,
      kind: attrs.kind,
      workspaceId: attrs.workspaceId,
      filePath: attrs.filePath,
      degree: attrs.degree || 0,
      communityId: attrs.communityId,
    });
    if (isHidden) return;
    const filePath: string = attrs.filePath || "";
    if (!filePath) return;
    const workspaceId: string = attrs.workspaceId || "";
    const key = fileKey(workspaceId, filePath);
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
        workspaceId,
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

/** Build the render graph data for the current filters. */
export function buildGraphData(graph: Graph, filters: FilterState): RenderGraphData {
  return filters.aggregateMode
    ? buildAggregatedGraphData(graph, filters)
    : buildSymbolGraphData(graph, filters);
}

/** Node draw radius/volume from its degree (shared by both render modes). */
export function nodeSize(degree: number): number {
  return Math.min(18, 2 + Math.log2(degree + 1) * 3);
}

// ---------------------------------------------------------------------------
// Memory view
//
// buildMemoryGraphData produces the same RenderGraphData shape as the code
// builders, so GraphCanvas (2D/3D), hover highlighting, camera fly-to, and
// filtering are reused unchanged. The differences are carried on the
// render nodes/links (memoryKind, record, memberCount, memoryEdgeKind) and read
// by the canvas's memory-aware size/tooltip/color accessors.
// ---------------------------------------------------------------------------

/**
 * Node size for the memory view. Records scale with importance (falling back to
 * a log of access_count when importance is absent) so frequently-recalled or
 * high-importance records read larger; hubs scale with member count so a busy
 * actor/app is visibly bigger. Ranges are clamped to match the code view's
 * visual weight so the two modes feel consistent.
 */
export function memoryNodeSize(node: RenderNode): number {
  if (node.memoryKind && node.memoryKind !== "record") {
    // Hub: size by membership, log-scaled like the code degree sizing.
    return Math.min(20, 4 + Math.log2((node.memberCount ?? 0) + 1) * 3);
  }
  const record = node.record;
  const importance = typeof record?.importance === "number" ? record.importance : null;
  if (importance != null) {
    // importance is 0..1; map to a 3..14 radius.
    return 3 + Math.max(0, Math.min(1, importance)) * 11;
  }
  // No importance: fall back to access_count (log-scaled), else a small base.
  const access = typeof record?.access_count === "number" ? record.access_count : 0;
  return Math.min(14, 3 + Math.log2(access + 1) * 2);
}

/** Does a record pass the memory filter's search over content/category/id? */
function memoryRecordMatches(record: MemoryRecordExport, matcher: SearchMatcher): boolean {
  if (matcher.isEmpty) return true;
  // Reuse the shared matcher: label slot = content, path slot = category+ids so
  // a search like "billing" hits content OR a category/hub value.
  const haystackPath = [record.category, record.actor_id, record.app_id, record.agent_id, record.session_id, record.scope_id]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ");
  return matcher.test(record.content, haystackPath);
}

/**
 * Build render nodes/links for the memory view from a graphology graph produced
 * by `memoryGraphToGraphology`. Applies the memory filters (kinds, tiers,
 * superseded, search, orphan hiding) and colors nodes/edges from the memory
 * palette. Hub nodes are kept only when at least one visible record still
 * points at them, so filtering records also prunes now-empty hubs.
 */
export function buildMemoryGraphData(graph: Graph, filters: MemoryFilterState): RenderGraphData {
  const matcher = compileSearch(filters.searchQuery, filters.searchRegex);

  // First pass: decide which record nodes are visible.
  const visibleRecordIds = new Set<string>();
  const recordAttrs = new Map<string, Record<string, unknown>>();
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.nodeKind !== "record") return;
    const record = attrs.record as MemoryRecordExport | undefined;
    if (!record) return;
    recordAttrs.set(nodeId, attrs);

    if (filters.kinds.size > 0 && !filters.kinds.has(record.kind || "unknown")) return;
    if (filters.tiers.size > 0 && !filters.tiers.has(record.tier || "unknown")) return;
    if (!filters.showSuperseded && record.superseded) return;
    if (!memoryRecordMatches(record, matcher)) return;
    visibleRecordIds.add(nodeId);
  });

  // Second pass: membership edges from visible records to enabled hubs. Track
  // which hubs actually receive an edge so we can drop empty hubs afterward.
  const links: RenderLink[] = [];
  const usedHubIds = new Set<string>();
  const recordHubDegree = new Map<string, number>(); // for orphan hiding

  graph.forEachEdge((edgeId, attrs, source, target) => {
    const edgeKind = attrs.edgeKind as MemoryEdgeKind | undefined;
    if (edgeKind === "membership") {
      // source = record, target = hub.
      if (!visibleRecordIds.has(source)) return;
      const dim = attrs.dimension as MemoryHubDimension | undefined;
      if (dim && !filters.hubs.has(dim)) return; // hub dimension disabled
      usedHubIds.add(target);
      recordHubDegree.set(source, (recordHubDegree.get(source) ?? 0) + 1);
      links.push({
        id: edgeId,
        source,
        target,
        relation: "membership",
        confidence: 0.5,
        color: memoryEdgeColor("membership"),
        memoryEdgeKind: "membership",
      });
    } else if (edgeKind === "supersession") {
      // Both endpoints must be visible records.
      if (!visibleRecordIds.has(source) || !visibleRecordIds.has(target)) return;
      links.push({
        id: edgeId,
        source,
        target,
        relation: "supersession",
        confidence: 1,
        color: memoryEdgeColor("supersession"),
        memoryEdgeKind: "supersession",
      });
    }
  });

  // Orphan hiding: drop records that ended up with no visible hub membership.
  let recordIds = visibleRecordIds;
  if (filters.hideOrphans) {
    recordIds = new Set([...visibleRecordIds].filter((id) => (recordHubDegree.get(id) ?? 0) > 0));
  }

  // Assemble nodes: visible records + hubs that received at least one edge.
  const nodes: RenderNode[] = [];
  for (const id of recordIds) {
    const attrs = recordAttrs.get(id);
    if (!attrs) continue;
    const record = attrs.record as MemoryRecordExport;
    nodes.push({
      id,
      label: (attrs.label as string) || id,
      kind: "record",
      workspaceId: "",
      filePath: "",
      degree: recordHubDegree.get(id) ?? 0,
      color: memoryNodeColor("record"),
      communityId: null,
      memoryKind: "record",
      record,
    });
  }
  graph.forEachNode((nodeId, attrs) => {
    if (attrs.nodeKind === "record") return;
    if (!usedHubIds.has(nodeId)) return;
    const kind = attrs.nodeKind as MemoryNodeKind;
    nodes.push({
      id: nodeId,
      label: (attrs.label as string) || nodeId,
      kind,
      workspaceId: "",
      filePath: "",
      degree: (attrs.memberCount as number) ?? 0,
      color: memoryNodeColor(kind),
      communityId: null,
      memoryKind: kind,
      memberCount: (attrs.memberCount as number) ?? 0,
    });
  });

  // Drop links whose endpoints were pruned (e.g. orphan hiding removed a record).
  const keptIds = new Set(nodes.map((n) => n.id));
  const keptLinks = links.filter((l) => keptIds.has(l.source as string) && keptIds.has(l.target as string));

  return { nodes, links: keptLinks };
}
