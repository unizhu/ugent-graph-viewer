import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

interface ForceAtlas2Settings {
  iterations: number;
  linLogMode: boolean;
  adjustSizes: boolean;
  gravity: number;
  slowDown: number;
  barnesHutOptimize: boolean;
}

/**
 * Run ForceAtlas2 layout on the graph in-place.
 */
export function runLayout(
  graph: Graph,
  iterations: number = 100,
): void {
  graph.forEachNode((node) => {
    if (graph.getNodeAttribute(node, "x") === undefined) {
      graph.setNodeAttribute(node, "x", Math.random() * 1000);
    }
    if (graph.getNodeAttribute(node, "y") === undefined) {
      graph.setNodeAttribute(node, "y", Math.random() * 1000);
    }
  });

  const settings: ForceAtlas2Settings = {
    iterations,
    linLogMode: false,
    adjustSizes: true,
    gravity: 1,
    slowDown: 1,
    barnesHutOptimize: graph.order > 1000,
  };

  forceAtlas2.assign(graph, settings);
}
