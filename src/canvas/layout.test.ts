/**
 * Tests for the 3D force layout core.
 *
 * The layout is separated from rendering so it can be checked here without a
 * GPU, a DOM, or three.js. The properties that matter to the renderer are
 * narrow but unforgiving: the buffer must be exactly `nodeCount * 3` long and
 * every value must be finite, because one NaN in a BufferAttribute makes the
 * GPU discard the entire draw — the whole graph disappears over a single
 * detached node.
 *
 * Same convention as `../graph/memory-loader.test.ts`: standalone tsx script,
 * throws on failure.
 */
import { DEFAULT_TICKS, PROGRESS_EVERY_TICKS, runLayout, type LinkIndexPair } from "./layout.ts";

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

function allFinite(a: Float32Array): boolean {
  for (let i = 0; i < a.length; i += 1) if (!Number.isFinite(a[i])) return false;
  return true;
}

/** A connected chain 0-1-2-...-(n-1). */
function chain(n: number): LinkIndexPair[] {
  const links: LinkIndexPair[] = [];
  for (let i = 0; i + 1 < n; i += 1) links.push([i, i + 1]);
  return links;
}

// --- shape and finiteness ---
{
  const pos = runLayout({ nodeCount: 25, links: chain(25), ticks: 12 });
  eq("buffer length is 3 per node", pos.length, 25 * 3);
  check("all coordinates finite", allFinite(pos));
  // A layout that leaves everything stacked at the origin is not a layout.
  check(
    "nodes are spread out",
    pos.some((v) => Math.abs(v) > 0.5),
  );
}

// --- empty and single-node graphs must not throw ---
{
  const empty = runLayout({ nodeCount: 0, links: [], ticks: 5 });
  eq("empty graph yields empty buffer", empty.length, 0);

  const single = runLayout({ nodeCount: 1, links: [], ticks: 5 });
  eq("single node buffer length", single.length, 3);
  check("single node is finite", allFinite(single));
}

// --- isolated nodes: the NaN case the renderer cannot survive ---
{
  // Nodes 3 and 4 touch no link at all, which is exactly where a force
  // simulation can produce non-finite coordinates.
  const pos = runLayout({ nodeCount: 5, links: [[0, 1], [1, 2]], ticks: 20 });
  check("isolated nodes stay finite", allFinite(pos));
}

// --- malformed links are dropped, not crashed on ---
{
  // Out-of-range indices and a self-loop. A stale filter or an off-by-one in
  // the caller should degrade to a missing edge, never to a broken buffer.
  const links: LinkIndexPair[] = [
    [0, 1],
    [0, 99],
    [-1, 2],
    [2, 2],
  ];
  const pos = runLayout({ nodeCount: 4, links, ticks: 10 });
  eq("buffer length unaffected by bad links", pos.length, 12);
  check("bad links do not poison the buffer", allFinite(pos));
}

// --- seeding resumes rather than teleporting ---
{
  const first = runLayout({ nodeCount: 12, links: chain(12), ticks: 20 });
  // Zero further ticks: the output must be the seed back, proving the seed is
  // read rather than ignored and re-randomised.
  const resumed = runLayout({ nodeCount: 12, links: chain(12), ticks: 0, seed: first });
  let same = true;
  for (let i = 0; i < first.length; i += 1) {
    if (Math.abs(first[i] - resumed[i]) > 1e-4) same = false;
  }
  check("zero-tick seeded run returns the seed", same);
}

// --- progress streaming ---
{
  const seen: number[] = [];
  const ticks = PROGRESS_EVERY_TICKS * 3;
  const final = runLayout({ nodeCount: 10, links: chain(10), ticks }, (positions, tick) => {
    seen.push(tick);
    check(`progress buffer ${tick} is the right length`, positions.length === 30);
  });
  // Fires on each interval strictly before the last tick; the final tick is
  // delivered as the return value instead, so the caller never renders the
  // same positions twice.
  check("progress fired", seen.length > 0);
  check(
    "progress ticks are on the interval",
    seen.every((t) => t % PROGRESS_EVERY_TICKS === 0),
  );
  check("progress never reports the final tick", !seen.includes(ticks));
  check("final positions finite", allFinite(final));
}

// --- progress copies, so a caller may retain a buffer safely ---
{
  const snapshots: Float32Array[] = [];
  // Three intervals, not two: the final tick reports through the return value
  // rather than a callback, so `n * PROGRESS_EVERY_TICKS` ticks yield n-1
  // snapshots.
  runLayout({ nodeCount: 8, links: chain(8), ticks: PROGRESS_EVERY_TICKS * 3 }, (p) =>
    snapshots.push(p),
  );
  if (snapshots.length >= 2) {
    // Distinct objects: the worker posts these across a thread boundary while
    // the simulation keeps mutating its own buffer.
    check("snapshots are distinct buffers", snapshots[0] !== snapshots[1]);
  } else {
    check("expected at least two snapshots", false);
  }
}

// --- the documented default matches the previous renderer's warmup ---
eq("default ticks match the old warmupTicks", DEFAULT_TICKS, 60);

// --- summary ---
console.log(`layout: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} layout assertion(s) failed`);
