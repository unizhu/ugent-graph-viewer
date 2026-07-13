import Graph from "graphology";
import louvain from "graphology-communities-louvain";

// Web Worker (R3): runs Louvain community detection off the main thread. This
// is the expensive, iterative part of load-time preprocessing; the rest
// (graph construction, color assignment, community-info) is linear and stays on
// the main thread where the graphology Graph instance lives.
//
// Protocol:
//   in : { nodes: string[], edges: [source, target][] }
//   out: { communities: Record<string, number> }  (nodeId -> communityId)

interface WorkerInput {
  nodes: string[];
  edges: Array<[string, string]>;
}

interface WorkerOutput {
  communities: Record<string, number>;
}

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const { nodes, edges } = event.data;

  // Louvain needs an undirected simple graph; build one from the edge list.
  const undirected = new Graph({ type: "undirected" });
  for (const id of nodes) {
    if (!undirected.hasNode(id)) undirected.addNode(id);
  }
  for (const [source, target] of edges) {
    if (!undirected.hasNode(source)) undirected.addNode(source);
    if (!undirected.hasNode(target)) undirected.addNode(target);
    if (source !== target && !undirected.hasEdge(source, target)) {
      undirected.addEdge(source, target);
    }
  }

  const communities: Record<string, number> = undirected.order === 0 ? {} : louvain(undirected);
  const out: WorkerOutput = { communities };
  (self as unknown as Worker).postMessage(out);
};
