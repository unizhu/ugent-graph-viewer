import { useEffect } from "react";
import Graph from "graphology";
import type { FilterState } from "../types";
import { useSigma } from "./useSigma";

interface SigmaCanvasProps {
  graph: Graph;
  filters: FilterState;
  onNodeClick: (nodeId: string) => void;
  onRefreshReady: (refresh: () => void) => void;
}

export function SigmaCanvas({ graph, filters, onNodeClick, onRefreshReady }: SigmaCanvasProps) {
  const [containerRef, refresh] = useSigma(graph, filters, onNodeClick);

  useEffect(() => {
    onRefreshReady(refresh);
  }, [refresh, onRefreshReady]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: "#030712" }}
    />
  );
}
