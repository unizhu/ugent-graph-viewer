import { useSyncExternalStore } from "react";
import { currentTheme, subscribeTheme, toggleTheme, type GraphTheme } from "../theme/theme";

// Subscribe React to the module-level theme store so the whole tree (sidebar
// chrome and the canvas, which read `currentTheme()` at render) re-renders on
// a theme change - whether it comes from the console handoff or this toggle.
export function useThemeName(): GraphTheme {
  return useSyncExternalStore(
    (onChange) => subscribeTheme(() => onChange()),
    () => currentTheme().theme,
    () => currentTheme().theme,
  );
}

/**
 * Light/dark switch for the sidebar. The viewer's theme normally arrives from
 * the console handoff; this lets a user override it, and gives standalone opens
 * (file load / ?data=) a way to switch away from the dark fallback.
 */
export function ThemeToggle() {
  const theme = useThemeName();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors hover:opacity-80"
      style={{
        background: "var(--gv-surface-raised)",
        border: "1px solid var(--gv-border)",
        color: "var(--gv-text-secondary)",
      }}
    >
      <span aria-hidden="true">{isDark ? "🌙" : "☀️"}</span>
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
