import Graph from "graphology";
import FA2LayoutSupervisor from "graphology-layout-forceatlas2/worker";
import forceAtlas2 from "graphology-layout-forceatlas2";

const SMALL_GRAPH_THRESHOLD = 1000;
const LAYOUT_TIMEOUT_MS = 4000;

/**
 * Run ForceAtlas2 layout. Uses a Web Worker for graphs > 1000 nodes
 * to avoid blocking the main thread.
 *
 * For large graphs, returns a cleanup function the caller must invoke
 * to stop the worker when done.
 */
export function runLayout(
  graph: Graph,
  iterations: number = 100,
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

  const settings = {
    linLogMode: false,
    adjustSizes: true,
    gravity: 1,
    slowDown: 1,
    barnesHutOptimize: graph.order > 1000,
  };

  // Small graphs: synchronous (fast enough, no worker overhead).
  if (graph.order < SMALL_GRAPH_THRESHOLD) {
    forceAtlas2.assign(graph, { iterations, settings });
    onDone?.();
    return { cleanup() {} };
  }

  // Large graphs: use Web Worker supervisor.
  const supervisor = new FA2LayoutSupervisor(graph, { settings });

  const timer = setTimeout(() => {
    supervisor.stop();
    onDone?.();
  }, LAYOUT_TIMEOUT_MS);

  return {
    cleanup() {
      clearTimeout(timer);
      supervisor.kill();
    },
  };
}
