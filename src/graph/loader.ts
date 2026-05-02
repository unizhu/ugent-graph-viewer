import Graph from "graphology";
import type { ExportViewport } from "../types";

/**
 * Load an ExportViewport JSON into a Graphology graph instance.
 * Sets node/edge attributes for rendering (color, size, label).
 *
 * Uses multi-graph mode so parallel edges with different relations
 * between the same source/target pair are all retained.
 */
export function loadGraph(viewport: ExportViewport): Graph {
  const graph = new Graph({ multi: true, type: "directed" });

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
      // With multi:true, parallel edges with same source/target are allowed,
      // and the unique edgeKey prevents exact duplicates.
      if (!graph.hasEdge(edgeKey)) {
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
