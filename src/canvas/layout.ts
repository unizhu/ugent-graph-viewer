import { forceCenter, forceLink, forceManyBody, forceSimulation } from "d3-force-3d";

/**
 * 3D force layout, decoupled from rendering.
 *
 * `react-force-graph-3d` owned both the layout and the scene graph. The points
 * renderer only needs coordinates, so the layout lives here as a plain function
 * over indices: no graphology, no three, no DOM. That keeps it unit testable
 * and lets it run in a Worker (see `layout.worker.ts`).
 *
 * Positions are a flat `Float32Array` of `[x, y, z, x, y, z, ...]` in node
 * order, which is the exact layout a `BufferAttribute` wants — no per-node
 * object survives into the render path.
 */

/** Links as index pairs into the node array, avoiding a string id map. */
export type LinkIndexPair = readonly [number, number];

export interface LayoutInput {
  nodeCount: number;
  links: readonly LinkIndexPair[];
  /**
   * Simulation steps to run. The previous renderer used 60 warmup ticks and
   * then froze (`cooldownTicks={0}`), so 60 is the quality bar to match, not
   * beat.
   */
  ticks?: number;
  /** Seed positions (length `nodeCount * 3`) to resume from, e.g. a re-layout. */
  seed?: Float32Array;
}

export const DEFAULT_TICKS = 60;

/**
 * How often the worker streams intermediate positions back. The old renderer
 * pre-warmed and froze, so the graph appeared already settled; streaming lets
 * the user watch it resolve instead of staring at a spinner, which matters
 * more the larger the graph is.
 */
export const PROGRESS_EVERY_TICKS = 4;

interface SimNode {
  index: number;
  x?: number;
  y?: number;
  z?: number;
}

/**
 * Run the force layout to completion, returning final positions.
 *
 * `onProgress` is invoked with a fresh copy every `PROGRESS_EVERY_TICKS`; it is
 * a copy rather than the live buffer because the caller may post it across a
 * thread boundary while the simulation keeps mutating.
 */
export function runLayout(
  input: LayoutInput,
  onProgress?: (positions: Float32Array, tick: number) => void,
): Float32Array {
  const { nodeCount, links, seed } = input;
  const ticks = input.ticks ?? DEFAULT_TICKS;
  const out = new Float32Array(nodeCount * 3);
  if (nodeCount === 0) return out;

  const nodes: SimNode[] = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) {
    // Seeded runs keep their coordinates so a re-layout does not teleport the
    // graph; unseeded nodes are left undefined for d3 to place on a phyllotaxis
    // spiral, which converges better than random scatter.
    nodes[i] = seed
      ? { index: i, x: seed[i * 3], y: seed[i * 3 + 1], z: seed[i * 3 + 2] }
      : { index: i };
  }

  // d3-force mutates the link objects it is given (source/target become node
  // references), so hand it throwaway objects rather than the caller's pairs.
  const simLinks = links
    .filter(([s, t]) => s >= 0 && s < nodeCount && t >= 0 && t < nodeCount && s !== t)
    .map(([source, target]) => ({ source, target }));

  const simulation = forceSimulation(nodes, 3)
    .force(
      "link",
      forceLink(simLinks).id((d: SimNode) => d.index),
    )
    .force("charge", forceManyBody())
    .force("center", forceCenter());

  // forceSimulation starts its own timer on construction. We drive the steps
  // ourselves so the run is deterministic and finishes rather than decaying in
  // the background -- and because a Worker has no requestAnimationFrame, the
  // timer would fall back to setTimeout and interleave with our ticks.
  simulation.stop();

  for (let step = 1; step <= ticks; step += 1) {
    simulation.tick();
    if (onProgress && step % PROGRESS_EVERY_TICKS === 0 && step < ticks) {
      writePositions(nodes, out);
      onProgress(out.slice(), step);
    }
  }

  writePositions(nodes, out);
  return out;
}

/** Cancels an in-flight layout; safe to call after completion. */
export interface LayoutHandle {
  cancel(): void;
}

/**
 * Run the layout off the main thread, streaming intermediate positions.
 *
 * Mirrors `graph/clustering.ts:detectCommunitiesAsync`: try a Worker, fall back
 * to running synchronously when Workers are unavailable or construction fails,
 * so behaviour is preserved everywhere and only the smoothness differs.
 *
 * The synchronous fallback deliberately skips progress callbacks — on the main
 * thread they would repaint mid-freeze and cost more than they show.
 */
export function layoutAsync(
  input: LayoutInput,
  onPositions: (positions: Float32Array, done: boolean) => void,
): LayoutHandle {
  let cancelled = false;

  if (typeof Worker === "undefined") {
    const positions = runLayout(input);
    if (!cancelled) onPositions(positions, true);
    return { cancel: () => { cancelled = true; } };
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
  } catch {
    const positions = runLayout(input);
    if (!cancelled) onPositions(positions, true);
    return { cancel: () => { cancelled = true; } };
  }

  worker.onmessage = (event: MessageEvent<{ positions: Float32Array; done: boolean }>) => {
    if (cancelled) return;
    onPositions(event.data.positions, event.data.done);
    if (event.data.done) worker.terminate();
  };
  worker.onerror = () => {
    if (cancelled) return;
    worker.terminate();
    // A worker that fails to start would otherwise leave the graph at the
    // origin forever, which reads as "the viewer is broken" rather than
    // "layout is unavailable".
    onPositions(runLayout(input), true);
  };
  worker.postMessage(input);

  return {
    cancel: () => {
      cancelled = true;
      worker.terminate();
    },
  };
}

/**
 * Copy simulation coordinates into the flat buffer.
 *
 * Coordinates are coerced through `Number.isFinite`: a node that ends up
 * detached from every force can pick up NaN, and a single NaN in a
 * BufferAttribute makes the GPU discard the whole draw, so the entire graph
 * would vanish because of one stray node.
 */
function writePositions(nodes: readonly SimNode[], out: Float32Array): void {
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    out[i * 3] = Number.isFinite(n.x) ? (n.x as number) : 0;
    out[i * 3 + 1] = Number.isFinite(n.y) ? (n.y as number) : 0;
    out[i * 3 + 2] = Number.isFinite(n.z) ? (n.z as number) : 0;
  }
}
