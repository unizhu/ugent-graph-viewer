import { Color } from "three";
import type { RenderGraphData, RenderLink, RenderNode } from "./graph-data";
import { memoryNodeSize, nodeSize } from "./graph-data";
import type { LinkIndexPair } from "./layout";

/**
 * Turn render nodes/links into the flat typed arrays a single `Points` and a
 * single `LineSegments` need.
 *
 * This is the heart of the draw-call fix. The previous renderer built one
 * `Mesh` per node and one `Mesh` or `Line` per link, so a 10k-node workspace
 * issued ~30k draw calls. Packing everything into two buffers issues two, at
 * the cost of giving up per-node objects — which is why colour, size and
 * highlight all become attribute writes from here on.
 *
 * Kept free of three's scene graph and of React so it can be unit tested.
 */

/** Column count in the packed colour buffers. */
const RGB = 3;

export interface PackedGraph {
  /** Node ids in buffer order; index i owns slots [3i, 3i+3) everywhere. */
  ids: string[];
  /** id -> index, for turning a hover/selection back into a buffer slot. */
  indexById: Map<string, number>;
  /** Per-node base colours, RGB in 0..1, `nodeCount * 3`. */
  nodeColors: Float32Array;
  /** Per-node draw size in world units, `nodeCount`. */
  nodeSizes: Float32Array;
  /** Per-node silhouette index (see {@link NODE_SHAPE}), `nodeCount`. */
  nodeShapes: Float32Array;
  /** Links as index pairs, for the layout and for rebuilding line positions. */
  linkPairs: LinkIndexPair[];
  /** Per-link-vertex colours, RGB in 0..1, `linkCount * 2 * 3`. */
  linkColors: Float32Array;
  /** Render links in buffer order, parallel to `linkPairs`. */
  links: RenderLink[];
}

/** Resolve a CSS colour string to linear-ish RGB floats once, at pack time. */
function writeColor(target: Float32Array, offset: number, css: string, cache: Map<string, Color>) {
  let color = cache.get(css);
  if (!color) {
    // Seeded with the fallback on purpose: three's Color.set warns and returns
    // the instance *unchanged* for an unparseable string rather than throwing
    // or zeroing, so pre-seeding is what turns a bad theme token into neutral
    // grey instead of black.
    color = new Color("#6b7280");
    color.set(css);
    cache.set(css, color);
  }
  target[offset] = color.r;
  target[offset + 1] = color.g;
  target[offset + 2] = color.b;
}

/**
 * Silhouettes a node can be drawn with. Values are shader branch indices, so
 * they are part of the contract with `points-material.ts` and must not be
 * renumbered casually.
 *
 * Shape carries the node's kind the way colour already does, giving a second,
 * colour-blind-safe channel. It is deliberately a small set: past about five
 * silhouettes they stop being distinguishable at the sizes nodes actually
 * render at.
 */
export const NODE_SHAPE = {
  sphere: 0,
  roundedSquare: 1,
  diamond: 2,
  triangle: 3,
  hexagon: 4,
} as const;

export type NodeShape = (typeof NODE_SHAPE)[keyof typeof NODE_SHAPE];

/**
 * Silhouette for a node kind.
 *
 * Files and modules — the containers — get the angular shapes, so structure
 * reads at a glance from silhouette alone; callable and type symbols stay
 * round. Unknown kinds fall back to a sphere rather than an arbitrary shape,
 * so a new node kind from the engine degrades quietly.
 */
export function nodeShapeFor(kind: string): NodeShape {
  switch (kind) {
    case "file":
      return NODE_SHAPE.roundedSquare;
    case "module":
      return NODE_SHAPE.diamond;
    case "struct":
    case "enum":
      return NODE_SHAPE.hexagon;
    case "trait":
    case "interface":
      return NODE_SHAPE.triangle;
    default:
      return NODE_SHAPE.sphere;
  }
}

/** A link endpoint as an id, whether it is still an id or already a node. */
function endpointId(endpoint: RenderLink["source"]): string {
  if (typeof endpoint === "string") return endpoint;
  const asNode = endpoint as unknown as { id?: unknown };
  return typeof asNode?.id === "string" ? asNode.id : String(endpoint);
}

/** Node draw size, matching the sizing the mesh renderer used. */
export function packedNodeSize(node: RenderNode): number {
  return node.memoryKind ? memoryNodeSize(node) : nodeSize(node.degree);
}

/**
 * Pack render data into buffers.
 *
 * Links whose endpoints are not both present are dropped: `buildGraphData`
 * already filters nodes by kind and by the progressive reveal cap, so a link
 * can outlive one of its endpoints. Keeping it would index past the node
 * buffer and draw a line to the origin.
 */
export function packGraph(data: RenderGraphData): PackedGraph {
  const { nodes, links } = data;
  const ids: string[] = new Array(nodes.length);
  const indexById = new Map<string, number>();
  const nodeColors = new Float32Array(nodes.length * RGB);
  const nodeSizes = new Float32Array(nodes.length);
  const nodeShapes = new Float32Array(nodes.length);
  const cache = new Map<string, Color>();

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    ids[i] = node.id;
    indexById.set(node.id, i);
    writeColor(nodeColors, i * RGB, node.color, cache);
    nodeSizes[i] = packedNodeSize(node);
    // Memory records keep the uniform sphere: their kinds are a different
    // vocabulary from code kinds, and mixing the two silhouette schemes in one
    // legend would mislead rather than inform.
    nodeShapes[i] = node.memoryKind ? NODE_SHAPE.sphere : nodeShapeFor(node.kind);
  }

  const linkPairs: LinkIndexPair[] = [];
  const kept: RenderLink[] = [];
  for (const link of links) {
    // Endpoints are ids as built, but a force-graph engine rewrites them to
    // node objects in place if the same data ever passes through one. Accept
    // both so a shared RenderGraphData cannot silently drop every link.
    const s = indexById.get(endpointId(link.source));
    const t = indexById.get(endpointId(link.target));
    if (s === undefined || t === undefined || s === t) continue;
    linkPairs.push([s, t]);
    kept.push(link);
  }

  // Both endpoints of a link carry the link's colour, so a line is flat-shaded
  // without needing a second material.
  const linkColors = new Float32Array(kept.length * 2 * RGB);
  for (let i = 0; i < kept.length; i += 1) {
    writeColor(linkColors, i * 2 * RGB, kept[i].color, cache);
    writeColor(linkColors, (i * 2 + 1) * RGB, kept[i].color, cache);
  }

  return { ids, indexById, nodeColors, nodeSizes, nodeShapes, linkPairs, linkColors, links: kept };
}

/**
 * Write link endpoint positions from node positions.
 *
 * Called on every layout frame, so it takes the destination buffer rather than
 * allocating: at 18k links this runs several times a second and would
 * otherwise churn ~430KB per call.
 */
export function writeLinkPositions(
  nodePositions: Float32Array,
  linkPairs: readonly LinkIndexPair[],
  out: Float32Array,
): void {
  for (let i = 0; i < linkPairs.length; i += 1) {
    const [s, t] = linkPairs[i];
    const a = i * 6;
    out[a] = nodePositions[s * 3];
    out[a + 1] = nodePositions[s * 3 + 1];
    out[a + 2] = nodePositions[s * 3 + 2];
    out[a + 3] = nodePositions[t * 3];
    out[a + 4] = nodePositions[t * 3 + 1];
    out[a + 5] = nodePositions[t * 3 + 2];
  }
}

/**
 * Encode a node index as an RGB triple for GPU picking.
 *
 * Index 0 must not encode to black: the picking target is cleared to black, so
 * a miss and node 0 would be indistinguishable. Indices are therefore stored
 * off by one, and `decodePickColor` reverses it.
 */
export function encodePickColor(index: number, out: Float32Array, offset: number): void {
  const id = index + 1;
  out[offset] = ((id >> 16) & 0xff) / 255;
  out[offset + 1] = ((id >> 8) & 0xff) / 255;
  out[offset + 2] = (id & 0xff) / 255;
}

/** Reverse `encodePickColor` from an 8-bit RGB readback. Returns -1 for a miss. */
export function decodePickColor(r: number, g: number, b: number): number {
  const id = (r << 16) | (g << 8) | b;
  return id === 0 ? -1 : id - 1;
}

/** Per-node pick colours for the whole graph, `nodeCount * 3`. */
export function packPickColors(nodeCount: number): Float32Array {
  const out = new Float32Array(nodeCount * RGB);
  for (let i = 0; i < nodeCount; i += 1) encodePickColor(i, out, i * RGB);
  return out;
}
