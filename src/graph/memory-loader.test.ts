/**
 * Tests for the memory export parser and graph builder.
 *
 * No test framework is present in this repo, so this file is a standalone
 * script run via `pnpm test` (tsx). It exits non-zero on the first failure so
 * `tsc && vite build && pnpm test` fails loudly in CI or pre-commit.
 */
import {
  parseMemoryExport,
  buildMemoryGraph,
  looksLikeMemoryExport,
  memoryGraphToGraphology,
} from "./memory-loader.ts";
import type { MemoryHubDimension } from "../types.ts";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  FAIL: ${name}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  const ok = actual === expected;
  if (!ok) console.error(`  (${name}) expected ${String(expected)}, got ${String(actual)}`);
  check(name, ok);
}

const allHubs = new Set<MemoryHubDimension>(["actor", "app", "agent", "session", "scope"]);

// --- parse: array JSON document ---
{
  const text = JSON.stringify([
    { id: "a", content: "first" },
    { id: "b", content: "second" },
  ]);
  const r = parseMemoryExport(text);
  eq("array parse count", r.records.length, 2);
  eq("array parse skipped", r.skipped, 0);
}

// --- parse: {records:[]} wrapper ---
{
  const text = JSON.stringify({ records: [{ id: "a", content: "x" }] });
  const r = parseMemoryExport(text);
  eq("wrapper parse count", r.records.length, 1);
}

// --- parse: bare single record ---
{
  const r = parseMemoryExport(JSON.stringify({ id: "solo", content: "hi" }));
  eq("bare record count", r.records.length, 1);
}

// --- parse: NDJSON with a blank line and a malformed line ---
{
  const text = [
    JSON.stringify({ id: "a", content: "one" }),
    "",
    "{ this is not json }",
    JSON.stringify({ id: "b", content: "two" }),
    JSON.stringify({ nope: true }), // valid JSON, not a record (no id/content)
  ].join("\n");
  const r = parseMemoryExport(text);
  eq("ndjson valid count", r.records.length, 2);
  eq("ndjson skipped count", r.skipped, 2);
}

// --- parse: empty text ---
{
  const r = parseMemoryExport("   \n  ");
  eq("empty parse count", r.records.length, 0);
  eq("empty parse skipped", r.skipped, 0);
}

// --- looksLikeMemoryExport: memory vs code export ---
{
  check("looks: array", looksLikeMemoryExport(JSON.stringify([{ id: "a", content: "x" }])));
  check("looks: wrapper", looksLikeMemoryExport(JSON.stringify({ records: [] })));
  check("looks: ndjson", looksLikeMemoryExport('{"id":"a","content":"x"}\n{"id":"b","content":"y"}'));
  check(
    "looks: code export is not memory",
    !looksLikeMemoryExport(JSON.stringify({ nodes: [{ id: "n1" }], edges: [] })),
  );
  check("looks: empty is not memory", !looksLikeMemoryExport(""));
}

// --- buildMemoryGraph: hub synthesis + membership edges ---
{
  const records = [
    { id: "r1", content: "a", actor_id: "alice", app_id: "chat" },
    { id: "r2", content: "b", actor_id: "alice", app_id: "chat" },
    { id: "r3", content: "c", actor_id: "bob", app_id: "chat" },
  ];
  const g = buildMemoryGraph(records, allHubs);
  // 3 record nodes + hubs: actor:alice, actor:bob, app:chat = 3 hubs => 6 nodes.
  eq("hub graph node count", g.nodes.length, 6);
  // membership edges: r1->2 hubs, r2->2, r3->2 = 6 edges.
  eq("hub graph edge count", g.edges.length, 6);
  eq("stats totalRecords", g.stats.totalRecords, 3);
  eq("stats hubCounts.actor", g.stats.hubCounts.actor, 2);
  eq("stats hubCounts.app", g.stats.hubCounts.app, 1);
  const aliceHub = g.nodes.find((n) => n.id === "hub:actor:alice");
  eq("alice member count", aliceHub?.memberCount, 2);
}

// --- buildMemoryGraph: disabled hubs are not materialized ---
{
  const records = [{ id: "r1", content: "a", actor_id: "alice", app_id: "chat" }];
  const g = buildMemoryGraph(records, new Set<MemoryHubDimension>(["actor"]));
  eq("only-actor node count", g.nodes.length, 2); // record + actor hub
  eq("only-actor edge count", g.edges.length, 1);
}

// --- buildMemoryGraph: supersession edge only when target present (AC4) ---
{
  const records = [
    { id: "old", content: "outdated", superseded: true, superseded_by: "new" },
    { id: "new", content: "current" },
    { id: "dangling", content: "points nowhere", superseded_by: "missing" },
  ];
  const g = buildMemoryGraph(records, new Set());
  const sup = g.edges.filter((e) => e.edgeKind === "supersession");
  eq("supersession edge count", sup.length, 1);
  eq("supersession source", sup[0]?.source, "old");
  eq("supersession target", sup[0]?.target, "new");
  eq("stats supersededRecords", g.stats.supersededRecords, 1);
  // Orphan target tolerated: node kept, edge dropped, no crash.
  check("dangling node kept", g.nodes.some((n) => n.id === "dangling"));
}

// --- buildMemoryGraph: empty/null hub values are skipped ---
{
  const records = [
    { id: "r1", content: "a", actor_id: "", app_id: null },
    { id: "r2", content: "b", actor_id: "   " },
  ];
  const g = buildMemoryGraph(records, allHubs);
  eq("blank-hub node count", g.nodes.length, 2); // just the 2 records, no hubs
  eq("blank-hub edge count", g.edges.length, 0);
}

// --- memoryGraphToGraphology: node/edge counts round-trip ---
{
  const records = [
    { id: "r1", content: "a", actor_id: "alice" },
    { id: "r2", content: "b", actor_id: "alice", superseded_by: "r1" },
  ];
  const result = buildMemoryGraph(records, new Set<MemoryHubDimension>(["actor"]));
  const graph = memoryGraphToGraphology(result);
  eq("graphology order", graph.order, result.nodes.length);
  eq("graphology size", graph.size, result.edges.length);
  eq("graphology node attr", graph.getNodeAttribute("hub:actor:alice", "nodeKind"), "actor");
}

// --- summary ---
console.log(`memory-loader: ${passed} passed, ${failed} failed`);
// No @types/node here, and this file is compiled by `pnpm build`. Throw instead
// of process.exit: tsx surfaces an uncaught throw as a non-zero exit, so the
// test still fails loudly without pulling in node type definitions.
if (failed > 0) throw new Error(`${failed} memory-loader assertion(s) failed`);
