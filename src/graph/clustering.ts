import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import type { CommunityInfo } from "../types";

/**
 * Run Louvain community detection on the graph.
 *
 * If the graph already has `communityId` attributes (server-computed),
 * those are used. Otherwise we run client-side Louvain and write the
 * `communityId` attribute onto each node.
 */
export function detectCommunities(graph: Graph): void {
  // Check if server already assigned communities.
  let hasServerCommunities = false;
  graph.forEachNode((_node, attrs) => {
    if (attrs.communityId != null) {
      hasServerCommunities = true;
      return false; // break
    }
    return undefined;
  });

  if (hasServerCommunities) {
    return;
  }

  // Client-side Louvain on an undirected copy.
  // Louvain requires an undirected or mixed graph, but our graph is directed.
  // Build a simple undirected view for the algorithm.
  const undirected = new Graph({ type: "undirected" });
  graph.forEachNode((node) => {
    if (!undirected.hasNode(node)) {
      undirected.addNode(node);
    }
  });
  graph.forEachEdge((_edge, _attrs, source, target) => {
    if (!undirected.hasNode(source)) undirected.addNode(source);
    if (!undirected.hasNode(target)) undirected.addNode(target);
    if (source !== target && !undirected.hasEdge(source, target)) {
      undirected.addEdge(source, target);
    }
  });

  if (undirected.order === 0) return;

  // Run Louvain. Returns { nodeId: communityId }.
  const communities = louvain(undirected);

  // Write back to the original directed graph.
  for (const [nodeId, communityId] of Object.entries(communities)) {
    if (graph.hasNode(nodeId)) {
      graph.setNodeAttribute(nodeId, "communityId", communityId);
    }
  }
}

/**
 * Derive the community name from the most common file path prefix
 * among its member nodes.
 */
function deriveCommunityName(
  graph: Graph,
  memberNodes: string[],
): string {
  // Collect file paths.
  const paths: string[] = [];
  for (const nodeId of memberNodes) {
    const fp = graph.getNodeAttribute(nodeId, "filePath") as string;
    if (fp) paths.push(fp);
  }

  if (paths.length === 0) return "unknown";

  // Count directory prefixes (up to second-to-last segment).
  const prefixCounts = new Map<string, number>();
  for (const p of paths) {
    const parts = p.split("/");
    // Use the directory portion (drop the filename).
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : parts[0];
    prefixCounts.set(dir, (prefixCounts.get(dir) ?? 0) + 1);
  }

  // Find the most common prefix.
  let bestPrefix = "";
  let bestCount = 0;
  for (const [prefix, count] of prefixCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestPrefix = prefix;
    }
  }

  // If the prefix is too generic (e.g. "src"), try to find a deeper one.
  if (bestPrefix === "src" && prefixCounts.size > 1) {
    let secondBest = "";
    let secondCount = 0;
    for (const [prefix, count] of prefixCounts) {
      if (prefix !== "src" && count > secondCount) {
        secondCount = count;
        secondBest = prefix;
      }
    }
    if (secondBest) return secondBest;
  }

  return bestPrefix || "root";
}

/**
 * Build community metadata (name, color, centroid, node count) from graph
 * node attributes. Must be called AFTER layout has been computed so that
 * x,y positions are meaningful.
 */
export function buildCommunityInfo(
  graph: Graph,
  communityColors: Map<number, string>,
): CommunityInfo[] {
  // Group nodes by community.
  const communityMembers = new Map<number, string[]>();
  graph.forEachNode((node, attrs) => {
    const cid = attrs.communityId as number | null;
    if (cid == null) return;
    let members = communityMembers.get(cid);
    if (!members) {
      members = [];
      communityMembers.set(cid, members);
    }
    members.push(node);
  });

  const result: CommunityInfo[] = [];
  for (const [id, members] of communityMembers) {
    // Compute centroid.
    let sumX = 0;
    let sumY = 0;
    for (const node of members) {
      sumX += (graph.getNodeAttribute(node, "x") as number) || 0;
      sumY += (graph.getNodeAttribute(node, "y") as number) || 0;
    }
    const centroidX = sumX / members.length;
    const centroidY = sumY / members.length;

    const name = deriveCommunityName(graph, members);
    const color = communityColors.get(id) ?? "#6b7280";

    result.push({
      id,
      name,
      color,
      nodeCount: members.length,
      centroidX,
      centroidY,
    });
  }

  // Sort by node count descending.
  result.sort((a, b) => b.nodeCount - a.nodeCount);
  return result;
}
