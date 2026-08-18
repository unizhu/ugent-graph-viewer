/**
 * Tests for packing render data into the two buffers the points renderer draws.
 *
 * These are the invariants that turn into invisible bugs rather than crashes:
 * a link pointing past the node buffer draws a line to the origin, a pick
 * colour that collides with the cleared background makes node 0 unhoverable,
 * and a colour that fails to parse silently blacks out part of the graph.
 *
 * Same convention as `../graph/memory-loader.test.ts`: standalone tsx script,
 * throws on failure.
 */
import type { RenderGraphData, RenderLink, RenderNode } from "./graph-data.ts";
import {
  NODE_SHAPE,
  PICK_WINDOW,
  decodePickColor,
  encodePickColor,
  nearestHit,
  nodeShapeFor,
  packGraph,
  packPickColors,
  writeLinkPositions,
} from "./points-geometry.ts";

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

function node(id: string, color = "#ff0000", degree = 1): RenderNode {
  return {
    id,
    label: id,
    kind: "function",
    workspaceId: "w",
    filePath: `${id}.rs`,
    degree,
    color,
    communityId: null,
  };
}

function link(id: string, source: string, target: string, color = "#00ff00"): RenderLink {
  return { id, source, target, relation: "calls", confidence: 1, color };
}

function data(nodes: RenderNode[], links: RenderLink[]): RenderGraphData {
  return { nodes, links };
}

// --- buffer shapes ---
{
  const packed = packGraph(data([node("a"), node("b"), node("c")], [link("l1", "a", "b")]));
  eq("ids in buffer order", packed.ids.join(","), "a,b,c");
  eq("index lookup", packed.indexById.get("b"), 1);
  eq("node colour buffer length", packed.nodeColors.length, 9);
  eq("node size buffer length", packed.nodeSizes.length, 3);
  eq("one link kept", packed.linkPairs.length, 1);
  eq("link colour buffer is 2 vertices", packed.linkColors.length, 6);
  eq("link endpoints resolved to indices", packed.linkPairs[0].join(","), "0,1");
}

// --- colour parsing ---
{
  const packed = packGraph(data([node("a", "#ff0000"), node("b", "not-a-colour")], []));
  check("parsed colour is red", packed.nodeColors[0] > 0.9 && packed.nodeColors[1] < 0.1);
  // Unparseable input must land on the neutral fallback, not black: three's
  // Color.set warns and leaves the instance untouched instead of throwing.
  const r = packed.nodeColors[3];
  const g = packed.nodeColors[4];
  const b = packed.nodeColors[5];
  check("unparseable colour falls back to grey, not black", r > 0.05 && g > 0.05 && b > 0.05);
}

// --- dangling links are dropped ---
{
  // buildGraphData filters nodes by kind and by the progressive reveal cap, so
  // a link routinely outlives one of its endpoints. Keeping it would index
  // past the node buffer.
  const packed = packGraph(
    data(
      [node("a"), node("b")],
      [link("ok", "a", "b"), link("dangling", "a", "gone"), link("self", "a", "a")],
    ),
  );
  eq("only the valid link survives", packed.linkPairs.length, 1);
  eq("surviving link is the connected one", packed.links[0].id, "ok");
  eq("link colours match survivors", packed.linkColors.length, 6);
}

// --- endpoints already rewritten to node objects ---
{
  const rewritten = link("l", "a", "b");
  // A force-graph engine mutates source/target into node references in place.
  (rewritten as unknown as { source: unknown }).source = { id: "a" };
  (rewritten as unknown as { target: unknown }).target = { id: "b" };
  const packed = packGraph(data([node("a"), node("b")], [rewritten]));
  eq("object endpoints still resolve", packed.linkPairs.length, 1);
}

// --- link positions follow node positions ---
{
  const packed = packGraph(data([node("a"), node("b")], [link("l", "a", "b")]));
  const nodePositions = new Float32Array([1, 2, 3, 4, 5, 6]);
  const out = new Float32Array(packed.linkPairs.length * 6);
  writeLinkPositions(nodePositions, packed.linkPairs, out);
  eq("line vertices copied", Array.from(out).join(","), "1,2,3,4,5,6");
}

// --- pick colour round trip ---
{
  // The picking target is cleared to black, so index 0 must not encode to
  // black or node 0 would be indistinguishable from empty space.
  const buf = new Float32Array(3);
  encodePickColor(0, buf, 0);
  check("index 0 is not black", buf[0] + buf[1] + buf[2] > 0);
  eq("black decodes to a miss", decodePickColor(0, 0, 0), -1);

  for (const index of [0, 1, 255, 256, 65535, 65536, 250000]) {
    const f = new Float32Array(3);
    encodePickColor(index, f, 0);
    const r = Math.round(f[0] * 255);
    const g = Math.round(f[1] * 255);
    const b = Math.round(f[2] * 255);
    eq(`round trip index ${index}`, decodePickColor(r, g, b), index);
  }
}

// --- pick colour buffer ---
{
  const colors = packPickColors(4);
  eq("pick buffer length", colors.length, 12);
  const r = Math.round(colors[9] * 255);
  const g = Math.round(colors[10] * 255);
  const b = Math.round(colors[11] * 255);
  eq("last slot decodes to its index", decodePickColor(r, g, b), 3);
}

// --- per-kind silhouettes ---
{
  eq("file is a rounded square", nodeShapeFor("file"), NODE_SHAPE.roundedSquare);
  eq("module is a diamond", nodeShapeFor("module"), NODE_SHAPE.diamond);
  eq("struct is a hexagon", nodeShapeFor("struct"), NODE_SHAPE.hexagon);
  eq("trait is a triangle", nodeShapeFor("trait"), NODE_SHAPE.triangle);
  eq("function stays a sphere", nodeShapeFor("function"), NODE_SHAPE.sphere);
  // A kind the engine adds later must degrade quietly rather than picking an
  // arbitrary silhouette that implies a meaning it does not have.
  eq("unknown kind falls back to sphere", nodeShapeFor("quantum_widget"), NODE_SHAPE.sphere);

  const packed = packGraph(
    data([node("f"), { ...node("m"), kind: "module" }, { ...node("s"), kind: "struct" }], []),
  );
  eq("shape buffer length", packed.nodeShapes.length, 3);
  eq("shapes packed in node order", packed.nodeShapes[1], NODE_SHAPE.diamond);
}

// --- memory nodes keep the uniform sphere ---
{
  // Memory kinds are a different vocabulary from code kinds; mixing both
  // silhouette schemes in one view would imply a shared legend.
  const memoryNode: RenderNode = { ...node("rec"), kind: "file", memoryKind: "record" };
  const packed = packGraph(data([memoryNode], []));
  eq("memory node is a sphere despite kind=file", packed.nodeShapes[0], NODE_SHAPE.sphere);
}

// --- nearestHit: the forgiving hover target ---
{
  const W = PICK_WINDOW;
  const centre = (W - 1) / 2;
  const blank = () => new Uint8Array(W * W * 4);
  const put = (buf: Uint8Array, col: number, row: number, index: number) => {
    const rgb = new Float32Array(3);
    encodePickColor(index, rgb, 0);
    const i = (row * W + col) * 4;
    buf[i] = Math.round(rgb[0] * 255);
    buf[i + 1] = Math.round(rgb[1] * 255);
    buf[i + 2] = Math.round(rgb[2] * 255);
    buf[i + 3] = 255;
  };

  eq("empty window is a miss", nearestHit(blank()), -1);

  {
    const buf = blank();
    put(buf, centre, centre, 42);
    eq("dead centre hit", nearestHit(buf), 42);
  }
  {
    // The whole point of the window: an off-centre node is still pickable.
    // A 1x1 read returned -1 here, which is why hovering felt dead.
    const buf = blank();
    put(buf, centre + 4, centre - 3, 7);
    eq("off-centre hit is found", nearestHit(buf), 7);
  }
  {
    // Two candidates: the nearer one wins, so overlapping nodes resolve to the
    // one the cursor is actually closest to rather than to buffer order.
    const buf = blank();
    put(buf, 0, 0, 100); // far corner
    put(buf, centre + 1, centre, 200); // adjacent to centre
    eq("nearest of two wins", nearestHit(buf), 200);
  }
  {
    // Index 0 must survive the round trip here too: it encodes off-by-one
    // precisely so it is not confused with the cleared background.
    const buf = blank();
    put(buf, centre, centre + 2, 0);
    eq("node index 0 is pickable", nearestHit(buf), 0);
  }
  check("window is odd so a centre pixel exists", PICK_WINDOW % 2 === 1);
}

// --- empty graph ---
{
  const packed = packGraph(data([], []));
  eq("no ids", packed.ids.length, 0);
  eq("no link pairs", packed.linkPairs.length, 0);
  eq("empty colour buffer", packed.nodeColors.length, 0);
}

// --- summary ---
console.log(`points-geometry: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} points-geometry assertion(s) failed`);
