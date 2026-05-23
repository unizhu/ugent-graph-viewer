// TypeScript types matching the Rust ExportViewport JSON schema.
// Must stay in sync with src/graph/types.rs.

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  codebase_id: string;
  file_path: string;
  line_range: [number, number];
  community_id: number | null;
}

export type NodeKind =
  | "file"
  | "module"
  | "struct"
  | "enum"
  | "function"
  | "trait"
  | "type_alias"
  | "constant"
  | "impl"
  | "block";

export interface GraphEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
  confidence: number;
  source_type: EdgeSource;
}

export type EdgeRelation =
  | "imports"
  | "calls"
  | "defines"
  | "contains"
  | "references"
  | "implements"
  | "depends_on"
  | "documented_by"
  | "tested_by";

export type EdgeSource = "deterministic" | "inferred" | "semantic";

export interface CodebaseSummary {
  codebase_id: string;
  node_count: number;
  edge_count: number;
  nodes_by_kind: Record<string, number>;
}

export interface ExportStats {
  total_nodes: number;
  total_edges: number;
  nodes_by_kind: Record<string, number>;
  edges_by_relation: Record<string, number>;
  communities: number;
}

export interface ExportViewport {
  codebases: CodebaseSummary[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: ExportStats;
}

// Computed community metadata for the UI sidebar and cluster labels.
export interface CommunityInfo {
  id: number;
  name: string;
  color: string;
  nodeCount: number;
  centroidX: number;
  centroidY: number;
}

// Zoom level buckets for level-of-detail rendering.
export type ZoomLevel = "far" | "mid" | "close";

export function classifyZoom(ratio: number): ZoomLevel {
  if (ratio < 0.3) return "far";
  if (ratio > 1.0) return "close";
  return "mid";
}

// Filter state for the UI.
export interface FilterState {
  codebaseId: string | null;
  nodeKinds: Set<NodeKind>;
  edgeRelations: Set<EdgeRelation>;
  searchQuery: string;
  showIsolated: boolean;
  selectedCommunities: Set<number>;
  // When true, ForceGraph3D collapses symbol-level nodes into their parent
  // file node and dedupes edges by (source_file, target_file, relation).
  // Useful for seeing the macro topology without re-exporting the dataset.
  aggregateMode: boolean;
}

// Breakdown of why nodes/edges are not visible. Returned from countVisible.
export interface VisibilityCounts {
  visibleNodes: number;
  visibleEdges: number;
  hiddenByKind: number;
  hiddenByCommunity: number;
  hiddenBySearch: number;
  hiddenByCodebase: number;
}

// Color palettes for node kinds and edge relations.
export const NODE_KIND_COLORS: Record<NodeKind, string> = {
  file: "#6b7280",
  module: "#8b5cf6",
  struct: "#3b82f6",
  enum: "#06b6d4",
  function: "#10b981",
  trait: "#f59e0b",
  type_alias: "#ec4899",
  constant: "#f97316",
  impl: "#14b8a6",
  block: "#4b5563",
};

export const EDGE_RELATION_COLORS: Record<EdgeRelation, string> = {
  imports: "#8b5cf6",
  calls: "#10b981",
  defines: "#3b82f6",
  contains: "#6b7280",
  references: "#f59e0b",
  implements: "#14b8a6",
  depends_on: "#ec4899",
  documented_by: "#06b6d4",
  tested_by: "#f97316",
};
