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

// ---------------------------------------------------------------------------
// Render quality tiers
//
// The 3D path sheds work as the graph grows. These live here rather than in
// GraphCanvas so they can be unit tested without importing React and
// react-force-graph, and so every threshold is visible in one place.
//
// The cost they control is per object: three-forcegraph builds one Mesh per
// node and one Mesh or Line per link, with no instancing, so a 10k-node
// workspace is ~30k draw calls. Shedding geometry does not reduce that count --
// only a different renderer does -- but it removes most of the triangles and
// shading behind it.

/** Above this many links, directional arrow cones are dropped. */
export const ARROWS_OFF_ABOVE_LINKS = 2500;

/** Above this many nodes, sphere resolution drops from 6 to 4. */
export const LOW_RES_ABOVE_NODES = 2000;

/**
 * Above this many links, non-highlighted links render as flat lines.
 *
 * three-forcegraph picks its link object with `useCylinder =
 * !!widthAccessor(link)`: any non-zero width builds a CylinderGeometry mesh
 * with a lit MeshLambertMaterial, while zero builds a 2-vertex Line with an
 * unlit material. A width accessor that never returns zero therefore pays for
 * ~24 triangles and a lighting calculation on every link in the graph.
 */
export const FLAT_LINKS_ABOVE_LINKS = 4000;

/**
 * Above this many nodes, hover stops highlighting neighbors.
 *
 * Highlighting changes React state, which gives the color/width accessors new
 * identities, which makes react-force-graph re-evaluate them across every node
 * and link. That is O(N) work on each mouse move; past this size it costs more
 * than the highlight is worth. The tooltip still follows the cursor.
 */
export const HOVER_HIGHLIGHT_MAX_NODES = 6000;

/** Sphere segments for the given node count. */
export function nodeResolutionFor(nodeCount: number): number {
  return nodeCount > LOW_RES_ABOVE_NODES ? 4 : 6;
}

/** Whether directional arrow cones are affordable at this link count. */
export function arrowsEnabledFor(linkCount: number): boolean {
  return linkCount <= ARROWS_OFF_ABOVE_LINKS;
}

/**
 * Whether links should render as cylinders (true) or flat lines (false).
 * Callers must return a width of exactly 0 when this is false; any other
 * value silently keeps the cylinder path.
 */
export function cylinderLinksFor(linkCount: number): boolean {
  return linkCount <= FLAT_LINKS_ABOVE_LINKS;
}

/** Whether hover should highlight first-hop neighbors at this node count. */
export function hoverHighlightFor(nodeCount: number): boolean {
  return nodeCount <= HOVER_HIGHLIGHT_MAX_NODES;
}
