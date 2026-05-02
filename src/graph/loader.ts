import Graph from "graphology";
import type { ExportViewport } from "../types";

/**
 * Load an ExportViewport JSON into a Graphology graph instance.
 * Sets node/edge attributes for rendering (color, size, label).
 */
export function loadGraph(viewport: ExportViewport): Graph {
  const graph = new Graph({ multi: false, type: "directed" });

  const nodeIds = new Set(viewport.nodes.map((n) => n.id));

  for (const node of viewport.nodes) {
    graph.addNode(node.id, {
      label: node.name,
      kind: node.kind,
      codebaseId: node.codebase_id,
      filePath: node.file_path,
      lineRange: node.line_range,
      communityId: node.community_id,
      degree: 0,
    });
  }

  for (const edge of viewport.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      const edgeKey = `${edge.source}|${edge.target}|${edge.relation}`;
      if (!graph.hasDirectedEdge(edge.source, edge.target)) {
        graph.addDirectedEdgeWithKey(edgeKey, edge.source, edge.target, {
          relation: edge.relation,
          confidence: edge.confidence,
          sourceType: edge.source_type,
        });
      }
    }
  }

  // Compute degree for node sizing.
  graph.forEachNode((node) => {
    const inDeg = graph.inDegree(node);
    const outDeg = graph.outDegree(node);
    graph.setNodeAttribute(node, "degree", inDeg + outDeg);
  });

  return graph;
}

/**
 * Parse a JSON string into an ExportViewport.
 */
export function parseViewport(json: string): ExportViewport {
  return JSON.parse(json) as ExportViewport;
}
