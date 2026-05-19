import type { NodeDisplayData } from "sigma/types";
import type { FilterState, NodeKind, ZoomLevel } from "../types";
import { NODE_KIND_COLORS } from "../types";

interface NodeData {
  label: string;
  kind: string;
  codebaseId: string;
  filePath: string;
  degree: number;
  color: string;
  communityId: number | null;
  x: number;
  y: number;
  hidden?: boolean;
  highlighted?: boolean;
}

/**
 * Check if a node should be hidden based on filter state.
 * Pure function -- no graph mutation.
 */
function shouldHideNode(filters: FilterState, data: NodeData): boolean {
  if (filters.codebaseId && data.codebaseId !== filters.codebaseId) {
    return true;
  }
  if (filters.nodeKinds.size > 0 && !filters.nodeKinds.has(data.kind as NodeKind)) {
    return true;
  }
  if (
    filters.selectedCommunities.size > 0 &&
    data.communityId != null &&
    !filters.selectedCommunities.has(data.communityId)
  ) {
    return true;
  }
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    if (
      !data.label.toLowerCase().includes(q) &&
      !(data.filePath || "").toLowerCase().includes(q)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Determine whether a node should be visible at the current zoom level.
 * This implements zoom-based Level of Detail (LOD):
 *
 *  - far (zoomed out): only show high-degree nodes (top ~15%)
 *  - mid: show nodes with degree >= 2
 *  - close (zoomed in): show all nodes
 */
function passesLOD(zoom: ZoomLevel, degree: number): boolean {
  switch (zoom) {
    case "far":
      return degree >= 5;
    case "mid":
      return degree >= 2;
    case "close":
      return true;
  }
}

/**
 * Determine if label should be shown at the current zoom level.
 */
function shouldShowLabel(zoom: ZoomLevel, degree: number): boolean {
  switch (zoom) {
    case "far":
      return degree >= 10;
    case "mid":
      return degree >= 4;
    case "close":
      return degree >= 1;
  }
}

/**
 * Log-scale node size for better visual differentiation.
 * Hub nodes are visually distinct; leaf nodes stay small.
 */
function nodeSize(degree: number): number {
  if (degree === 0) return 2;
  return Math.min(25, 2 + Math.log2(degree + 1) * 4);
}

/**
 * Create a nodeReducer that uses filter state and zoom level for LOD.
 *
 * IMPORTANT: Sigma.js v3 nodeReducer output REPLACES node attributes,
 * it is NOT merged. The reducer MUST return x and y for every node.
 */
export function createNodeReducer(
  filters: FilterState,
  zoom: ZoomLevel = "mid",
): (_key: string, data: NodeData) => Partial<NodeDisplayData> {
  return (_key, data) => {
    const degree = data.degree || 0;

    // Filter-based hiding.
    if (shouldHideNode(filters, data)) {
      return { x: data.x, y: data.y, size: 0, color: "transparent" };
    }

    // Zoom-based LOD hiding.
    if (!data.highlighted && !passesLOD(zoom, degree)) {
      return { x: data.x, y: data.y, size: 0, color: "transparent" };
    }

    const size = nodeSize(degree);
    const color =
      data.color ||
      NODE_KIND_COLORS[data.kind as keyof typeof NODE_KIND_COLORS] ||
      "#6b7280";

    // Highlighted nodes always show labels.
    const showLabel = data.highlighted || shouldShowLabel(zoom, degree);
    const label = showLabel ? data.label : "";

    // Must include x, y -- Sigma replaces attributes with reducer output.
    return { x: data.x, y: data.y, size, color, label };
  };
}
