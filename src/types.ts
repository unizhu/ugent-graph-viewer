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

// ---------------------------------------------------------------------------
// Memory graph view (docs/plans/2026-07-17-memory-graph-view.md)
//
// The viewer supports two graph domains. The existing one is the code graph
// (ExportViewport above). The second is the memory graph, built client-side
// from a flat memory export: one record per line (NDJSON) or a JSON array /
// `{ records: [...] }` wrapper. No engine change is required for v1 - edges
// are synthesized in the loader (identity hubs + supersession links).
// ---------------------------------------------------------------------------

/** Which graph domain the app is currently showing. Persisted in localStorage. */
export type ViewMode = "code" | "memory";

/**
 * One memory record as it appears in an export. Mirrors the engine's memory
 * record (see the console's `MemoryRecord`) minus `tenant_id`, which the
 * export omits because a single export is already one tenant. Every field
 * except `id`/`content` is optional so a partial export still loads.
 */
export interface MemoryRecordExport {
  id: string;
  content: string;
  /** Coarse type, e.g. "semantic" | "episodic" | "fact" | "preference". */
  kind?: string;
  /** Retention tier, e.g. "short" | "long". */
  tier?: string;
  /** Free-form category label under a kind. */
  category?: string;
  /** App-supplied end-user / actor identity (an identity-hub dimension). */
  actor_id?: string | null;
  /** Owning application id (an identity-hub dimension). */
  app_id?: string | null;
  /** Agent that wrote the record (an identity-hub dimension). */
  agent_id?: string | null;
  /** Session the record was written in (an identity-hub dimension). */
  session_id?: string | null;
  /** App-defined sub-scope (an identity-hub dimension). */
  scope_id?: string | null;
  /** 0..1 importance weight, if the engine assigned one. */
  importance?: number | null;
  /** How many times recall has surfaced this record; drives node size. */
  access_count?: number | null;
  /** True once a newer record replaced this one. */
  superseded?: boolean;
  /** Id of the record that replaced this one; source of a supersession edge. */
  superseded_by?: string | null;
  created_at_unix_ms?: number | null;
  updated_at_unix_ms?: number | null;
}

/** The identity dimensions that can each become a hub node. */
export type MemoryHubDimension = "actor" | "app" | "agent" | "session" | "scope";

export const MEMORY_HUB_DIMENSIONS: MemoryHubDimension[] = [
  "actor",
  "app",
  "agent",
  "session",
  "scope",
];

/** Maps a hub dimension to the record field it groups on. */
export const MEMORY_HUB_FIELD: Record<MemoryHubDimension, keyof MemoryRecordExport> = {
  actor: "actor_id",
  app: "app_id",
  agent: "agent_id",
  session: "session_id",
  scope: "scope_id",
};

/** Node kinds in the memory graph: a record, or an identity hub. */
export type MemoryNodeKind = "record" | MemoryHubDimension;

/** Edge kinds in the memory graph. */
export type MemoryEdgeKind = "membership" | "supersession";

/**
 * A node in the built memory graph. Graphology holds these as node attributes,
 * parallel to how the code loader stores `GraphNode` fields.
 */
export interface MemoryViewNode {
  id: string;
  nodeKind: MemoryNodeKind;
  /** Short label for rendering (hub value, or a content preview for records). */
  label: string;
  /** The originating record, present only for `nodeKind === "record"`. */
  record?: MemoryRecordExport;
  /** For hub nodes: how many records belong to this hub (drives hub size). */
  memberCount?: number;
}

/** An edge in the built memory graph. */
export interface MemoryViewEdge {
  source: string;
  target: string;
  edgeKind: MemoryEdgeKind;
  /** For membership edges: which hub dimension produced it. */
  dimension?: MemoryHubDimension;
}

/** Aggregate stats derived from a memory export, for the stats panel. */
export interface MemoryStats {
  totalRecords: number;
  supersededRecords: number;
  byKind: Record<string, number>;
  byTier: Record<string, number>;
  /** Hub counts per dimension, e.g. { actor: 12, app: 3, ... }. */
  hubCounts: Record<MemoryHubDimension, number>;
}

/**
 * The built memory graph plus its derived stats. `buildMemoryGraph` returns
 * this; the app stores the records and re-derives the Graphology instance when
 * hub toggles change (hubs add/remove whole dimensions without a reload).
 */
export interface MemoryGraphResult {
  records: MemoryRecordExport[];
  nodes: MemoryViewNode[];
  edges: MemoryViewEdge[];
  stats: MemoryStats;
}

/** Filter state for the memory view, parallel to `FilterState` for code. */
export interface MemoryFilterState {
  /** Record `kind` values to show; empty set = show all kinds. */
  kinds: Set<string>;
  /** Record `tier` values to show; empty set = show all tiers. */
  tiers: Set<string>;
  /** Which identity-hub dimensions are currently materialized as nodes. */
  hubs: Set<MemoryHubDimension>;
  /** When true, superseded records are shown; otherwise hidden. */
  showSuperseded: boolean;
  searchQuery: string;
  /** When true, searchQuery is a case-insensitive regex (mirrors code view). */
  searchRegex: boolean;
  /** When true, records with no hub membership are hidden. */
  hideOrphans: boolean;
}

/** The default memory filter: all kinds/tiers, actor+app hubs on. */
export function defaultMemoryFilterState(): MemoryFilterState {
  return {
    kinds: new Set(),
    tiers: new Set(),
    hubs: new Set<MemoryHubDimension>(["actor", "app"]),
    showSuperseded: true,
    searchQuery: "",
    searchRegex: false,
    hideOrphans: false,
  };
}
