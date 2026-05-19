import { useEffect, useRef, useCallback, useState } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import type { FilterState, ZoomLevel } from "../types";
import { classifyZoom } from "../types";
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
 * Returns [containerRef, refresh, zoomLevel] -- call refresh() after
 * mutating graph attributes to force Sigma to re-render.
 *
 * Tracks camera zoom level and uses it for level-of-detail rendering
 * in node/edge reducers.
 */
export function useSigma(
  graph: AnyGraph,
  filters: FilterState,
  onNodeClick: (nodeId: string) => void,
): [
  ref: React.RefObject<HTMLDivElement | null>,
  refresh: () => void,
  zoomLevel: ZoomLevel,
] {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigmaRef = useRef<Sigma<any, any, any> | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("mid");

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
      nodeReducer: createNodeReducer(filters, zoomLevel),
      edgeReducer: createEdgeReducer(filters, graph, zoomLevel),
      defaultEdgeColor: "#374151",
      defaultNodeColor: "#6b7280",
      labelColor: { color: "#e5e7eb" },
      labelFont: "12px Inter, system-ui, sans-serif",
      labelSize: 12,
      labelRenderedSizeThreshold: 8,
      renderEdgeLabels: false,
      minCameraRatio: 0.05,
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

    // Track camera zoom level changes for LOD rendering.
    const camera = renderer.getCamera();
    const handleCameraUpdate = () => {
      const ratio = camera.ratio;
      const newZoom = classifyZoom(ratio);
      setZoomLevel((prev) => {
        if (prev !== newZoom) return newZoom;
        return prev;
      });
    };
    camera.on("updated", handleCameraUpdate);

    sigmaRef.current = renderer;

    return () => {
      camera.removeListener("updated", handleCameraUpdate);
      renderer.kill();
      sigmaRef.current = null;
    };
    // Only re-create Sigma when the graph instance changes.
    // Filters and zoom are handled by the separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Update reducers when filters or zoom level change.
  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;

    sigma.setSetting("nodeReducer", createNodeReducer(filters, zoomLevel));
    sigma.setSetting("edgeReducer", createEdgeReducer(filters, graph, zoomLevel));
    // skipIndexation: true because filter changes only affect visual attributes
    // (color, size, label), not spatial layout (x, y).
    sigma.refresh({ skipIndexation: true });
  }, [filters, graph, zoomLevel]);

  return [containerRef, refresh, zoomLevel];
}
