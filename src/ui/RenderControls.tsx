import {
  ORBIT_INTERVAL_OPTIONS,
  type OrbitSettings,
  type RenderMode,
} from "../canvas/render-settings";

interface RenderControlsProps {
  mode: RenderMode;
  onModeChange: (mode: RenderMode) => void;
  orbit: OrbitSettings;
  onOrbitChange: (orbit: OrbitSettings) => void;
  showStats: boolean;
  onShowStatsChange: (show: boolean) => void;
  nodeShapes: boolean;
  onNodeShapesChange: (enabled: boolean) => void;
}

function intervalLabel(ms: number): string {
  return ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`;
}

/**
 * Sidebar render controls: switch between 2D and 3D (R1) and configure the
 * auto-orbit toggle + interval (R2). Orbit only applies in 3D, so its controls
 * are disabled in 2D.
 */
export function RenderControls({
  mode,
  onModeChange,
  orbit,
  onOrbitChange,
  showStats,
  onShowStatsChange,
  nodeShapes,
  onNodeShapesChange,
}: RenderControlsProps) {
  const is3d = mode === "3d";

  return (
    <div className="flex flex-col gap-2">
      {/* 2D / 3D mode switch */}
      <div>
        <div className="text-xs font-semibold mb-1" style={{ color: "var(--gv-text-secondary)" }}>
          Render Mode
        </div>
        <div
          className="inline-flex rounded-lg p-0.5"
          style={{ background: "var(--gv-surface-raised)", border: "1px solid var(--gv-border)" }}
        >
          {(["3d", "2d"] as RenderMode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: active ? "var(--gv-accent)" : "transparent",
                  color: active ? "var(--gv-accent-foreground)" : "var(--gv-text-secondary)",
                }}
              >
                {m.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-orbit toggle */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold"
          style={{ color: is3d ? "var(--gv-text-secondary)" : "var(--gv-border)" }}
          title={is3d ? "Rotate the camera automatically" : "Auto-orbit is only available in 3D"}
        >
          Auto-orbit
        </span>
        <button
          type="button"
          disabled={!is3d}
          onClick={() => onOrbitChange({ ...orbit, enabled: !orbit.enabled })}
          aria-pressed={orbit.enabled}
          aria-label="Auto-orbit"
          className="w-9 h-5 rounded-full transition-colors relative"
          style={{
            background: is3d && orbit.enabled ? "var(--gv-accent)" : "var(--gv-border)",
            border: "1px solid var(--gv-border)",
            opacity: is3d ? 1 : 0.5,
            cursor: is3d ? "pointer" : "not-allowed",
          }}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              orbit.enabled ? "left-[18px]" : "left-0.5"
            }`}
            style={{ border: "1px solid rgba(0,0,0,0.15)" }}
          />
        </button>
      </div>

      {/* Per-kind node silhouettes (3D only) */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold"
          style={{ color: is3d ? "var(--gv-text-secondary)" : "var(--gv-border)" }}
          title={
            is3d
              ? "Draw files, modules and types with distinct silhouettes instead of all spheres"
              : "Node shapes are only available in 3D"
          }
        >
          Node shapes
        </span>
        <button
          type="button"
          disabled={!is3d}
          onClick={() => onNodeShapesChange(!nodeShapes)}
          aria-pressed={nodeShapes}
          aria-label="Node shapes"
          className="w-9 h-5 rounded-full transition-colors relative"
          style={{
            background: is3d && nodeShapes ? "var(--gv-accent)" : "var(--gv-border)",
            border: "1px solid var(--gv-border)",
            opacity: is3d ? 1 : 0.5,
            cursor: is3d ? "pointer" : "not-allowed",
          }}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              nodeShapes ? "left-[18px]" : "left-0.5"
            }`}
            style={{ border: "1px solid rgba(0,0,0,0.15)" }}
          />
        </button>
      </div>

      {/* Render statistics overlay (3D only) */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold"
          style={{ color: is3d ? "var(--gv-text-secondary)" : "var(--gv-border)" }}
          title={
            is3d
              ? "Show draw calls, triangles and frame rate on the canvas"
              : "Render stats are only available in 3D"
          }
        >
          Render stats
        </span>
        <button
          type="button"
          disabled={!is3d}
          onClick={() => onShowStatsChange(!showStats)}
          aria-pressed={showStats}
          aria-label="Render stats"
          className="w-9 h-5 rounded-full transition-colors relative"
          style={{
            background: is3d && showStats ? "var(--gv-accent)" : "var(--gv-border)",
            border: "1px solid var(--gv-border)",
            opacity: is3d ? 1 : 0.5,
            cursor: is3d ? "pointer" : "not-allowed",
          }}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              showStats ? "left-[18px]" : "left-0.5"
            }`}
            style={{ border: "1px solid rgba(0,0,0,0.15)" }}
          />
        </button>
      </div>

      {/* Orbit re-render interval */}
      <div className="flex items-center justify-between">
        <label
          htmlFor="orbit-interval"
          className="text-xs font-semibold"
          style={{ color: is3d && orbit.enabled ? "var(--gv-text-secondary)" : "var(--gv-border)" }}
        >
          Orbit interval
        </label>
        <select
          id="orbit-interval"
          disabled={!is3d || !orbit.enabled}
          value={orbit.intervalMs}
          onChange={(e) => onOrbitChange({ ...orbit, intervalMs: Number(e.target.value) })}
          className="rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--gv-accent)]"
          style={{
            background: "var(--gv-surface-raised)",
            border: "1px solid var(--gv-border)",
            color: "var(--gv-text-primary)",
            opacity: is3d && orbit.enabled ? 1 : 0.5,
            cursor: is3d && orbit.enabled ? "pointer" : "not-allowed",
          }}
        >
          {ORBIT_INTERVAL_OPTIONS.map((ms) => (
            <option key={ms} value={ms}>
              {intervalLabel(ms)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
