import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import type { CommunityInfo } from "../types";

/** True when the graph already carries server-computed community ids. */
export function hasServerCommunities(graph: Graph): boolean {
  let found = false;
  graph.forEachNode((_node, attrs) => {
    if (attrs.communityId != null) {
      found = true;
      return false; // break
    }
    return undefined;
  });
  return found;
}

/** Write a {nodeId: communityId} map back onto the graph's node attributes. */
export function applyCommunities(graph: Graph, communities: Record<string, number>): void {
  for (const [nodeId, communityId] of Object.entries(communities)) {
    if (graph.hasNode(nodeId)) {
      graph.setNodeAttribute(nodeId, "communityId", communityId);
    }
  }
}

/**
 * Run Louvain community detection on the graph (synchronous, main-thread).
 *
 * If the graph already has `communityId` attributes (server-computed),
 * those are used. Otherwise we run client-side Louvain and write the
 * `communityId` attribute onto each node. Prefer `detectCommunitiesAsync`
 * for large graphs so the heavy Louvain pass runs off the main thread (R3);
 * this remains the fallback when a Worker is unavailable.
 */
export function detectCommunities(graph: Graph): void {
  if (hasServerCommunities(graph)) return;

  // Client-side Louvain on an undirected copy.
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

  const communities = louvain(undirected);
  applyCommunities(graph, communities);
}

/**
 * Off-main-thread community detection (R3). Ships the edge list to a Web
 * Worker running Louvain, then applies the result. Falls back to the
 * synchronous `detectCommunities` if Workers are unavailable or the worker
 * errors, so behavior is preserved everywhere.
 */
export function detectCommunitiesAsync(graph: Graph): Promise<void> {
  return new Promise((resolve) => {
    if (hasServerCommunities(graph)) {
      resolve();
      return;
    }

    if (typeof Worker === "undefined") {
      detectCommunities(graph);
      resolve();
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL("./community.worker.ts", import.meta.url), { type: "module" });
    } catch {
      detectCommunities(graph);
      resolve();
      return;
    }

    const nodes: string[] = [];
    graph.forEachNode((node) => nodes.push(node));
    const edges: Array<[string, string]> = [];
    graph.forEachEdge((_edge, _attrs, source, target) => {
      edges.push([source, target]);
    });

    const finish = (communities: Record<string, number> | null) => {
      worker.terminate();
      if (communities) {
        applyCommunities(graph, communities);
        resolve();
      } else {
        // Worker failed: fall back to the synchronous pass so we still cluster.
        detectCommunities(graph);
        resolve();
      }
    };

    worker.onmessage = (event: MessageEvent<{ communities: Record<string, number> }>) => {
      finish(event.data?.communities ?? {});
    };
    worker.onerror = () => finish(null);

    worker.postMessage({ nodes, edges });
  });
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
