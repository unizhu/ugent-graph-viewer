import Graph from "graphology";
import FA2LayoutSupervisor from "graphology-layout-forceatlas2/worker";
import forceAtlas2 from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";

const SMALL_GRAPH_THRESHOLD = 1000;
const LAYOUT_TIMEOUT_MS = 8000;

/**
 * Run ForceAtlas2 layout with community-aware settings, followed by
 * a Noverlap pass to prevent node overlap.
 *
 * Uses linLogMode for tighter clusters, higher gravity to pull
 * disconnected components inward, and stronger scaling to separate
 * communities visually.
 */
export function runLayout(
  graph: Graph,
  iterations: number = 300,
  onDone?: () => void,
): { cleanup: () => void } {
  // Initialize random positions for all nodes.
  graph.forEachNode((node) => {
    if (graph.getNodeAttribute(node, "x") === undefined) {
      graph.setNodeAttribute(node, "x", Math.random() * 1000);
    }
    if (graph.getNodeAttribute(node, "y") === undefined) {
      graph.setNodeAttribute(node, "y", Math.random() * 1000);
    }
  });

  const isLarge = graph.order > 1000;

  const settings = {
    linLogMode: true,
    adjustSizes: true,
    gravity: isLarge ? 5 : 3,
    scalingRatio: isLarge ? 10 : 5,
    strongGravityMode: true,
    barnesHutOptimize: isLarge,
    slowDown: isLarge ? 2 : 1,
  };

  // Small graphs: synchronous (fast enough, no worker overhead).
  if (graph.order < SMALL_GRAPH_THRESHOLD) {
    forceAtlas2.assign(graph, { iterations, settings });
    applyNoverlap(graph);
    onDone?.();
    return { cleanup() {} };
  }

  // Large graphs: use Web Worker supervisor.
  const supervisor = new FA2LayoutSupervisor(graph, { settings });

  const timer = setTimeout(() => {
    supervisor.stop();
    applyNoverlap(graph);
    onDone?.();
  }, LAYOUT_TIMEOUT_MS);

  return {
    cleanup() {
      clearTimeout(timer);
      supervisor.kill();
    },
  };
}

/**
 * Post-layout overlap prevention. Pushes overlapping nodes apart
 * so labels remain readable.
 */
function applyNoverlap(graph: Graph): void {
  if (graph.order === 0) return;

  noverlap.assign(graph, {
    maxIterations: 200,
    settings: {
      margin: 2,
      ratio: 1.2,
      gridSize: graph.order > 2000 ? 20 : 10,
    },
  });
}
