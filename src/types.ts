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
  | "tested_by"
  | "similar_to"
  | "related_to";

export type EdgeSource =
  | "deterministic"
  | "inferred"
  | "semantic"
  | "lifted"
  | "embedding_sim"
  | "cross_doc_llm";

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

// One chunk of file content returned by GET /v1/files/snippets. Mirrors
// the Rust QdrantFileChunk struct.
export interface FileSnippet {
  chunk_index: number;
  start_line: number;
  end_line: number;
  text: string;
  symbol_name: string | null;
}

export interface FileSnippetsResponse {
  codebase_id: string;
  file_path: string;
  chunks: FileSnippet[];
  truncated: boolean;
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
  workspaceId: string | null;
  nodeKinds: Set<NodeKind>;
  edgeRelations: Set<EdgeRelation>;
  searchQuery: string;
  // When true, searchQuery is treated as a case-insensitive regular expression;
  // otherwise it uses plain multi-term matching (| = OR, space = AND).
  searchRegex: boolean;
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
  hiddenByWorkspace: number;
}

// Node-kind and edge-relation colors now live in the theme module
// (src/theme/theme.ts), driven by the console handoff payload so the
// viewer matches the console's light/dark theme (R12). Use
// `nodeKindColor` / `edgeRelationColor` from there instead of static maps.
