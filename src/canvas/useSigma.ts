import { useEffect, useRef, useCallback } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import type { FilterState } from "../types";
import { createNodeReducer } from "./nodeReducers";
import { createEdgeReducer } from "./edgeReducers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGraph = Graph;

/**
 * Ensure every node in the graph has valid numeric x, y positions.
 * This is a safety net in case the loader or any intermediate step
 * failed to set positions.
 */
function ensurePositions(graph: AnyGraph): void {
  let fixed = 0;
  graph.forEachNode((node) => {
    const x = graph.getNodeAttribute(node, "x");
    const y = graph.getNodeAttribute(node, "y");
    if (typeof x !== "number" || !isFinite(x)) {
      graph.setNodeAttribute(node, "x", Math.random() * 1000);
      fixed++;
    }
    if (typeof y !== "number" || !isFinite(y)) {
      graph.setNodeAttribute(node, "y", Math.random() * 1000);
      fixed++;
    }
  });
  if (fixed > 0) {
    console.warn(
      `[useSigma] Fixed ${fixed} missing position(s) before Sigma init.`,
    );
  }
}

/**
 * Hook to manage a Sigma.js renderer instance bound to a container div.
 * Returns [containerRef, refresh] — call refresh() after mutating graph
 * attributes to force Sigma to re-render.
 *
 * When filters change, the nodeReducer/edgeReducer are updated via
 * sigma.setSetting() which triggers an efficient re-render without
 * modifying the graphology instance.
 */
export function useSigma(
  graph: AnyGraph,
  filters: FilterState,
  onNodeClick: (nodeId: string) => void,
): [ref: React.RefObject<HTMLDivElement | null>, refresh: () => void] {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigmaRef = useRef<Sigma<any, any, any> | null>(null);

  const refresh = useCallback(() => {
    sigmaRef.current?.refresh();
  }, []);

  // Create Sigma instance when graph changes.
  useEffect(() => {
    if (!containerRef.current) return;

    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    // Safety net: ensure all nodes have valid positions before Sigma init.
    ensurePositions(graph);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer = new Sigma<any, any, any>(graph, containerRef.current, {
      nodeReducer: createNodeReducer(filters),
      edgeReducer: createEdgeReducer(filters, graph),
      defaultEdgeColor: "#374151",
      defaultNodeColor: "#6b7280",
      labelColor: { color: "#e5e7eb" },
      labelFont: "12px Inter, system-ui, sans-serif",
      labelSize: 12,
      labelRenderedSizeThreshold: 12,
      renderEdgeLabels: false,
      minCameraRatio: 0.1,
      maxCameraRatio: 10,
    });

    renderer.on("clickNode", ({ node }) => {
      onNodeClick(node);
    });

    let hoveredNode: string | null = null;
    const prevHighlighted: Set<string> = new Set();

    renderer.on("enterNode", ({ node }) => {
      // Clear only previously highlighted nodes (O(degree) not O(N)).
      for (const n of prevHighlighted) {
        if (graph.hasNode(n)) graph.setNodeAttribute(n, "highlighted", false);
      }
      prevHighlighted.clear();

      hoveredNode = node;
      graph.setNodeAttribute(node, "highlighted", true);
      prevHighlighted.add(node);
      graph.forEachNeighbor(node, (neighbor) => {
        graph.setNodeAttribute(neighbor, "highlighted", true);
        prevHighlighted.add(neighbor);
      });
    });
    renderer.on("leaveNode", () => {
      if (hoveredNode) {
        for (const n of prevHighlighted) {
          if (graph.hasNode(n)) graph.setNodeAttribute(n, "highlighted", false);
        }
        prevHighlighted.clear();
        hoveredNode = null;
      }
    });

    sigmaRef.current = renderer;

    return () => {
      renderer.kill();
      sigmaRef.current = null;
    };
    // Only re-create Sigma when the graph instance changes.
    // Filters are handled by the separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Update reducers when filters change (no graph mutation, no Sigma re-creation).
  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;

    sigma.setSetting("nodeReducer", createNodeReducer(filters));
    sigma.setSetting("edgeReducer", createEdgeReducer(filters, graph));
    // skipIndexation: true because filter changes only affect visual attributes
    // (color, size, label), not spatial layout (x, y).
    sigma.refresh({ skipIndexation: true });
  }, [filters, graph]);

  return [containerRef, refresh];
}
