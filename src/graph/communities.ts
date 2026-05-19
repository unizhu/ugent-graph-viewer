import Graph from "graphology";

/**
 * Curated color palette for communities.
 *
 * Inspired by Atomic's soft warm palette -- these are muted,
 * aesthetically pleasing HSL colors that work well on dark backgrounds.
 */
const COMMUNITY_PALETTE = [
  "hsl(250, 55%, 62%)", // lavender
  "hsl(170, 50%, 48%)", // teal
  "hsl(330, 55%, 58%)", // rose
  "hsl(35, 70%, 55%)",  // amber
  "hsl(200, 60%, 52%)", // azure
  "hsl(280, 50%, 58%)", // violet
  "hsl(100, 45%, 50%)", // sage
  "hsl(15, 65%, 55%)",  // terracotta
  "hsl(220, 55%, 60%)", // steel blue
  "hsl(350, 60%, 55%)", // coral
  "hsl(145, 45%, 48%)", // emerald
  "hsl(50, 60%, 52%)",  // goldenrod
  "hsl(310, 45%, 55%)", // orchid
  "hsl(185, 55%, 50%)", // cyan
  "hsl(0, 50%, 58%)",   // brick red
  "hsl(75, 50%, 48%)",  // olive
  "hsl(260, 45%, 55%)", // indigo
  "hsl(25, 60%, 52%)",  // pumpkin
  "hsl(160, 50%, 45%)", // pine
  "hsl(340, 50%, 60%)", // pink
];

/**
 * Assign community colors to all nodes based on their `communityId` attribute.
 * Returns a map from communityId to its color.
 */
export function assignCommunityColors(graph: Graph): Map<number, string> {
  const communityColors = new Map<number, string>();
  let colorIndex = 0;

  graph.forEachNode((_node, attrs) => {
    const cid = attrs.communityId as number | null;
    if (cid == null) return;

    if (!communityColors.has(cid)) {
      communityColors.set(
        cid,
        COMMUNITY_PALETTE[colorIndex % COMMUNITY_PALETTE.length],
      );
      colorIndex++;
    }

    // Write the resolved color onto the node attribute for the renderer.
    graph.setNodeAttribute(
      _node,
      "color",
      communityColors.get(cid),
    );
  });

  return communityColors;
}
