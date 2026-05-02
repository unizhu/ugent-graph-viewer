import type { EdgeDisplayData } from "sigma/types";
import { EDGE_RELATION_COLORS } from "../types";

interface EdgeData {
  relation: string;
  confidence: number;
  hidden?: boolean;
}

/**
 * Edge reducer: hidden edges get zero size; visible edges colored by relation.
 */
export function createEdgeReducer(): null | ((
  _key: string,
  data: EdgeData,
) => Partial<EdgeDisplayData>) {
  return (_key, data) => {
    if (data.hidden) {
      return { size: 0, color: "transparent" };
    }

    const color =
      EDGE_RELATION_COLORS[
        data.relation as keyof typeof EDGE_RELATION_COLORS
      ] || "#374151";
    const size = Math.max(0.5, (data.confidence || 0.5) * 2);

    return { size, color };
  };
}
