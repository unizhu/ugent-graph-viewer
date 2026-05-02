import { useEffect, useRef } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import { createNodeReducer } from "./nodeReducers";
import { createEdgeReducer } from "./edgeReducers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGraph = Graph;

/**
 * Hook to manage a Sigma.js renderer instance bound to a container div.
 */
export function useSigma(
  graph: AnyGraph,
  onNodeClick: (nodeId: string) => void,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigmaRef = useRef<Sigma<any, any, any> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer = new Sigma<any, any, any>(graph, containerRef.current, {
      nodeReducer: createNodeReducer(),
      edgeReducer: createEdgeReducer(),
      defaultEdgeColor: "#374151",
      defaultNodeColor: "#6b7280",
      labelColor: { color: "#e5e7eb" },
      labelFont: "12px Inter, system-ui, sans-serif",
      labelSize: 12,
      labelRenderedSizeThreshold: 6,
      renderEdgeLabels: false,
      minCameraRatio: 0.1,
      maxCameraRatio: 10,
    });

    renderer.on("clickNode", ({ node }) => {
      onNodeClick(node);
    });

    let hoveredNode: string | null = null;
    renderer.on("enterNode", ({ node }) => {
      hoveredNode = node;
      graph.forEachNode((n) => graph.setNodeAttribute(n, "highlighted", false));
      graph.setNodeAttribute(node, "highlighted", true);
      graph.forEachNeighbor(node, (neighbor) => {
        graph.setNodeAttribute(neighbor, "highlighted", true);
      });
    });
    renderer.on("leaveNode", () => {
      if (hoveredNode) {
        graph.forEachNode((n) => graph.setNodeAttribute(n, "highlighted", false));
        hoveredNode = null;
      }
    });

    sigmaRef.current = renderer;

    return () => {
      renderer.kill();
      sigmaRef.current = null;
    };
  }, [graph, onNodeClick]);

  return containerRef;
}
