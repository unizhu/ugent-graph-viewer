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
