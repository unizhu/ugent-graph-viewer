import type { CommunityInfo } from "../types";

interface CommunityPanelProps {
  communities: CommunityInfo[];
  selectedCommunities: Set<number>;
  onToggleCommunity: (id: number) => void;
  onClearSelection: () => void;
}

/**
 * Sidebar panel that lists detected communities with color swatches,
 * node counts, and click-to-filter capability.
 */
export function CommunityPanel({
  communities,
  selectedCommunities,
  onToggleCommunity,
  onClearSelection,
}: CommunityPanelProps) {
  if (communities.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-400">
          Communities ({communities.length})
        </span>
        {selectedCommunities.size > 0 && (
          <button
            onClick={onClearSelection}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Show All
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {communities.map((c) => {
          const active =
            selectedCommunities.size === 0 ||
            selectedCommunities.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => onToggleCommunity(c.id)}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all hover:bg-gray-800"
              style={{
                opacity: active ? 1 : 0.35,
              }}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: c.color }}
              />
              <span className="text-gray-300 truncate text-left flex-1">
                {c.name}
              </span>
              <span className="text-gray-500 tabular-nums shrink-0">
                {c.nodeCount}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
