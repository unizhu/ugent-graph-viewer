import type { NodeDisplayData } from "sigma/types";
import { NODE_KIND_COLORS } from "../types";

interface NodeData {
  label: string;
  kind: string;
  degree: number;
  color: string;
  hidden?: boolean;
  highlighted?: boolean;
}

/**
 * Node reducer: hidden nodes get zero size; visible nodes sized by degree.
 */
export function createNodeReducer(): null | ((
  _key: string,
  data: NodeData,
) => Partial<NodeDisplayData>) {
  return (_key, data) => {
    if (data.hidden) {
      return { size: 0, color: "transparent" };
    }

    const degree = data.degree || 0;
    const size = Math.min(20, Math.max(3, 3 + degree * 1.5));
    const color =
      data.color ||
      NODE_KIND_COLORS[data.kind as keyof typeof NODE_KIND_COLORS] ||
      "#6b7280";
    const showLabel = degree >= 2;
    const label = showLabel ? data.label : "";

    return { size, color, label };
  };
}
