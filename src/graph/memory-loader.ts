import Graph from "graphology";
import type {
  MemoryRecordExport,
  MemoryHubDimension,
  MemoryViewNode,
  MemoryViewEdge,
  MemoryStats,
  MemoryGraphResult,
} from "../types";
import { MEMORY_HUB_DIMENSIONS, MEMORY_HUB_FIELD } from "../types";

/**
 * Memory export parser + graph builder.
 *
 * The export is a flat list of records; edges are synthesized here (no engine
 * change for v1). Two synthesized edge kinds:
 *   - membership: record -> identity-hub node (actor/app/agent/session/scope),
 *     one per non-null identity field that has an enabled hub dimension.
 *   - supersession: record -> record, from `superseded_by`, drawn only when
 *     the target id also exists in the export (orphan targets are tolerated
 *     by dropping the edge, not the node).
 */

const HUB_PREFIX: Record<MemoryHubDimension, string> = {
  actor: "hub:actor:",
  app: "hub:app:",
  agent: "hub:agent:",
  session: "hub:session:",
  scope: "hub:scope:",
};

/** Result of parsing: the records plus a count of lines that failed to parse. */
export interface MemoryParseResult {
  records: MemoryRecordExport[];
  /** Number of non-empty NDJSON lines that were not valid JSON objects. */
  skipped: number;
}

/**
 * Parse a memory export from raw text. Accepts, in order of detection:
 *   1. A single JSON document that is an array of records.
 *   2. A single JSON document `{ "records": [...] }`.
 *   3. NDJSON: one JSON object per line (blank lines ignored, bad lines
 *      skipped and counted).
 *
 * Detection is by shape, so a `.json` array and a `.ndjson` stream both work.
 * A record must be an object with a string `id` and string `content`; anything
 * else is skipped so a partially corrupt export still loads what it can.
 */
export function parseMemoryExport(text: string): MemoryParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { records: [], skipped: 0 };

  // Try a single JSON document first (array or {records:[]}).
  try {
    const doc = JSON.parse(trimmed) as unknown;
    const arr = extractRecordArray(doc);
    if (arr) {
      const records: MemoryRecordExport[] = [];
      let skipped = 0;
      for (const item of arr) {
        if (isRecord(item)) records.push(item);
        else skipped += 1;
      }
      return { records, skipped };
    }
    // A single bare record object is valid too.
    if (isRecord(doc)) return { records: [doc], skipped: 0 };
    // Parsed as JSON but not a recognized shape: fall through to NDJSON, which
    // will also fail per line and report skips.
  } catch {
    // Not a single JSON document; treat as NDJSON below.
  }

  // NDJSON: one object per line.
  const records: MemoryRecordExport[] = [];
  let skipped = 0;
  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as unknown;
      if (isRecord(obj)) records.push(obj);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { records, skipped };
}

/** Returns the record array from an array doc or a `{records:[]}` wrapper. */
function extractRecordArray(doc: unknown): unknown[] | null {
  if (Array.isArray(doc)) return doc;
  if (
    doc !== null &&
    typeof doc === "object" &&
    Array.isArray((doc as { records?: unknown }).records)
  ) {
    return (doc as { records: unknown[] }).records;
  }
  return null;
}

/** A value is a usable record when it has string `id` and string `content`. */
function isRecord(value: unknown): value is MemoryRecordExport {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.content === "string";
}

/**
 * Heuristic used by the app to decide whether a parsed JSON document is a
 * memory export (vs the code ExportViewport). True when the doc is a record
 * array / `{records:[]}` / bare record, or NDJSON whose first non-empty line
 * is a record object. The code export is a single object with a `nodes` array,
 * so it never matches here.
 */
export function looksLikeMemoryExport(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    const doc = JSON.parse(trimmed) as unknown;
    // A code ExportViewport is an object with `nodes`; never treat it as memory.
    if (
      doc !== null &&
      typeof doc === "object" &&
      !Array.isArray(doc) &&
      Array.isArray((doc as { nodes?: unknown }).nodes)
    ) {
      return false;
    }
    const arr = extractRecordArray(doc);
    if (arr) return arr.length === 0 || isRecord(arr[0]);
    return isRecord(doc);
  } catch {
    // NDJSON: sniff the first non-empty line.
    for (const raw of trimmed.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      try {
        return isRecord(JSON.parse(line));
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Build the memory graph from records, materializing only the hub dimensions
 * in `enabledHubs`. Hubs can be toggled without re-parsing: the app keeps the
 * records and calls this again with a different set.
 *
 * Node ids: records use their own id; hubs use `hub:<dim>:<value>` so a record
 * and a hub can never collide and the same actor across records maps to one hub.
 */
export function buildMemoryGraph(
  records: MemoryRecordExport[],
  enabledHubs: Set<MemoryHubDimension>,
): MemoryGraphResult {
  const nodes: MemoryViewNode[] = [];
  const edges: MemoryViewEdge[] = [];

  const recordIds = new Set(records.map((r) => r.id));
  // Hub id -> member count, accumulated as we walk records.
  const hubMembers = new Map<string, number>();
  // Hub id -> its node (created lazily on first member).
  const hubNodes = new Map<string, MemoryViewNode>();

  const stats: MemoryStats = {
    totalRecords: records.length,
    supersededRecords: 0,
    byKind: {},
    byTier: {},
    hubCounts: { actor: 0, app: 0, agent: 0, session: 0, scope: 0 },
  };

  for (const record of records) {
    nodes.push({
      id: record.id,
      nodeKind: "record",
      label: recordLabel(record),
      record,
    });

    if (record.superseded) stats.supersededRecords += 1;
    const kind = record.kind || "unknown";
    stats.byKind[kind] = (stats.byKind[kind] ?? 0) + 1;
    const tier = record.tier || "unknown";
    stats.byTier[tier] = (stats.byTier[tier] ?? 0) + 1;

    // Membership edges to each enabled identity hub with a non-null value.
    for (const dim of MEMORY_HUB_DIMENSIONS) {
      if (!enabledHubs.has(dim)) continue;
      const raw = record[MEMORY_HUB_FIELD[dim]];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) continue;
      const hubId = `${HUB_PREFIX[dim]}${value}`;
      if (!hubNodes.has(hubId)) {
        const node: MemoryViewNode = {
          id: hubId,
          nodeKind: dim,
          label: value,
          memberCount: 0,
        };
        hubNodes.set(hubId, node);
      }
      hubMembers.set(hubId, (hubMembers.get(hubId) ?? 0) + 1);
      edges.push({ source: record.id, target: hubId, edgeKind: "membership", dimension: dim });
    }

    // Supersession edge, drawn only when the target record is present.
    if (record.superseded_by && recordIds.has(record.superseded_by)) {
      edges.push({
        source: record.id,
        target: record.superseded_by,
        edgeKind: "supersession",
      });
    }
  }

  // Finalize hub nodes with their member counts and tally hub stats.
  for (const [hubId, node] of hubNodes) {
    node.memberCount = hubMembers.get(hubId) ?? 0;
    nodes.push(node);
    stats.hubCounts[node.nodeKind as MemoryHubDimension] += 1;
  }

  return { records, nodes, edges, stats };
}

/** A compact, single-line label for a record node. */
function recordLabel(record: MemoryRecordExport): string {
  const text = record.content.replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text || record.id;
}

/**
 * Materialize a `MemoryGraphResult` into a Graphology instance, parallel to the
 * code loader's `loadGraph`. Node/edge attributes carry the view fields so the
 * render builder can read them without a side lookup.
 */
export function memoryGraphToGraphology(result: MemoryGraphResult): Graph {
  const graph = new Graph({ multi: true, type: "directed" });
  for (const node of result.nodes) {
    graph.addNode(node.id, { ...node });
  }
  for (const edge of result.edges) {
    // Guard against duplicate identical edges (multi-graph tolerates parallel
    // edges, but a repeated exact membership would be redundant).
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    graph.addEdge(edge.source, edge.target, { ...edge });
  }
  return graph;
}
