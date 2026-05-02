import { useEffect } from "react";
import Graph from "graphology";
import { useSigma } from "./useSigma";

interface SigmaCanvasProps {
  graph: Graph;
  onNodeClick: (nodeId: string) => void;
  onRefreshReady: (refresh: () => void) => void;
}

export function SigmaCanvas({ graph, onNodeClick, onRefreshReady }: SigmaCanvasProps) {
  const [containerRef, refresh] = useSigma(graph, onNodeClick);

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
