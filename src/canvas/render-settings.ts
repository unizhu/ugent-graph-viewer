// Session-persisted render settings shared across the app: 2D/3D mode and the
// auto-orbit toggle + interval. Persisted in localStorage so a reload keeps the
// user's choice within the session; falls back to defaults when unavailable.

export type RenderMode = "2d" | "3d";

export interface OrbitSettings {
  /** When false, no orbit timer runs; camera only moves on interaction/focus. */
  enabled: boolean;
  /** Re-render interval in ms. Lower = smoother orbit but more re-renders. */
  intervalMs: number;
}

/** Selectable orbit intervals surfaced in the UI. Default is 1000ms. */
export const ORBIT_INTERVAL_OPTIONS = [25, 250, 500, 1000, 2000] as const;

export const DEFAULT_ORBIT: OrbitSettings = { enabled: true, intervalMs: 1000 };
export const DEFAULT_RENDER_MODE: RenderMode = "3d";

const MODE_KEY = "gv:render-mode";
const ORBIT_KEY = "gv:orbit";
const VIEW_MODE_KEY = "gv:view-mode";
const STATS_KEY = "gv:show-stats";
const SHAPES_KEY = "gv:node-shapes";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore (private mode / storage disabled): settings are session-only.
  }
}

export function loadRenderMode(): RenderMode {
  return safeGet(MODE_KEY) === "2d" ? "2d" : safeGet(MODE_KEY) === "3d" ? "3d" : DEFAULT_RENDER_MODE;
}

export function saveRenderMode(mode: RenderMode): void {
  safeSet(MODE_KEY, mode);
}

export function loadOrbit(): OrbitSettings {
  const raw = safeGet(ORBIT_KEY);
  if (!raw) return DEFAULT_ORBIT;
  try {
    const parsed = JSON.parse(raw) as Partial<OrbitSettings>;
    const enabled = typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_ORBIT.enabled;
    const intervalMs =
      typeof parsed.intervalMs === "number" && parsed.intervalMs > 0
        ? parsed.intervalMs
        : DEFAULT_ORBIT.intervalMs;
    return { enabled, intervalMs };
  } catch {
    return DEFAULT_ORBIT;
  }
}

export function saveOrbit(orbit: OrbitSettings): void {
  safeSet(ORBIT_KEY, JSON.stringify(orbit));
}

/** Persisted code/memory view toggle (R3). Defaults to "code". */
export function loadViewMode(): import("../types").ViewMode {
  return safeGet(VIEW_MODE_KEY) === "memory" ? "memory" : "code";
}

export function saveViewMode(mode: import("../types").ViewMode): void {
  safeSet(VIEW_MODE_KEY, mode);
}

/**
 * Persisted toggle for the 3D render statistics overlay. Off by default.
 *
 * Draw calls are the number that decides whether this viewer needs a different
 * renderer, and it cannot be inferred from the node count alone, so it is worth
 * being able to read it on a real deployment rather than only in a local
 * profiler.
 */
export function loadShowStats(): boolean {
  return safeGet(STATS_KEY) === "true";
}

export function saveShowStats(show: boolean): void {
  safeSet(STATS_KEY, String(show));
}

/**
 * Persisted toggle for per-kind node silhouettes (3D). On by default.
 *
 * Shape is a second encoding channel alongside colour and, unlike colour, it
 * survives colour-blindness and a dark background. Off falls back to a uniform
 * sphere for every node.
 */
export function loadNodeShapes(): boolean {
  return safeGet(SHAPES_KEY) !== "false";
}

export function saveNodeShapes(enabled: boolean): void {
  safeSet(SHAPES_KEY, String(enabled));
}

// ---------------------------------------------------------------------------
// Render quality tiers
//
// Kept here rather than in GraphCanvas so they can be unit tested without
// importing React and react-force-graph, and so every threshold is visible in
// one place.
//
// The 3D path no longer sheds geometry: PointsCanvas draws the whole graph as
// one Points and one LineSegments, so its cost barely moves with node count.
// What remains is the 2D arrow tier, and the hover tier, which is about CPU
// work per mouse move rather than geometry and so applies to both canvases.

/** Above this many links, directional arrow cones are dropped (2D only). */
export const ARROWS_OFF_ABOVE_LINKS = 2500;

/**
 * Above this many nodes, hover stops highlighting neighbors.
 *
 * Highlighting changes React state, which gives the color/width accessors new
 * identities, which makes react-force-graph re-evaluate them across every node
 * and link. That is O(N) work on each mouse move; past this size it costs more
 * than the highlight is worth. The tooltip still follows the cursor.
 */
export const HOVER_HIGHLIGHT_MAX_NODES = 6000;

/** Whether directional arrow cones are affordable at this link count. */
export function arrowsEnabledFor(linkCount: number): boolean {
  return linkCount <= ARROWS_OFF_ABOVE_LINKS;
}

/** Whether hover should highlight first-hop neighbors at this node count. */
export function hoverHighlightFor(nodeCount: number): boolean {
  return nodeCount <= HOVER_HIGHLIGHT_MAX_NODES;
}
