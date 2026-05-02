import Graph from "graphology";
import { useSigma } from "./useSigma";

interface SigmaCanvasProps {
  graph: Graph;
  onNodeClick: (nodeId: string) => void;
}

export function SigmaCanvas({ graph, onNodeClick }: SigmaCanvasProps) {
  const containerRef = useSigma(graph, onNodeClick);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: "#030712" }}
    />
  );
}
