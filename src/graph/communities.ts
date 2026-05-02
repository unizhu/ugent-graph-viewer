import Graph from "graphology";
import { NODE_KIND_COLORS } from "../types";

/**
 * Assign colors to nodes based on community_id or node kind.
 * Returns a map of community_id -> color for legend rendering.
 */
export function assignCommunityColors(
  graph: Graph,
): Map<number, string> {
  const communityColors = new Map<number, string>();
  let hue = 0;
  const hueStep = 137.508; // Golden angle for max spread.

  graph.forEachNode((_node, attrs) => {
    if (attrs.communityId != null && !communityColors.has(attrs.communityId)) {
      const color = `hsl(${hue % 360}, 60%, 55%)`;
      communityColors.set(attrs.communityId, color);
      hue += hueStep;
    }
  });

  graph.forEachNode((node, attrs) => {
    let color: string;
    if (attrs.communityId != null && communityColors.has(attrs.communityId)) {
      color = communityColors.get(attrs.communityId)!;
    } else {
      color = NODE_KIND_COLORS[attrs.kind as keyof typeof NODE_KIND_COLORS] || "#6b7280";
    }
    graph.setNodeAttribute(node, "color", color);
  });

  return communityColors;
}
