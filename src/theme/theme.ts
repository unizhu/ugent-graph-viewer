// Theme received from the console handoff. Mirrors the payload built by
// the console's `src/lib/graph/theme-payload.ts`: a resolved theme name,
// core chrome tokens, and the per-node-kind palette. The viewer applies
// the tokens to CSS variables (see `applyTheme`) and reads the kind hues
// through `nodeKindColor`, so light/dark rendering matches the console the
// user launched from.

import type { NodeKind, MemoryNodeKind, MemoryEdgeKind } from "../types";

export type GraphTheme = "light" | "dark";

export interface GraphThemeTokens {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentForeground: string;
}

export interface GraphKindPalette {
  file: string;
  module: string;
  struct: string;
  enum: string;
  function: string;
  trait: string;
  type_alias: string;
  constant: string;
  impl: string;
  block: string;
}

export interface GraphThemePayload {
  theme: GraphTheme;
  tokens: GraphThemeTokens;
  kinds: GraphKindPalette;
}

// Fallback dark theme used when the viewer is opened directly (file load
// or ?data=) with no console handoff. Values mirror the console's dark
// tokens so a standalone open still looks intentional rather than raw.
const FALLBACK_DARK: GraphThemePayload = {
  theme: "dark",
  tokens: {
    background: "#09090b",
    surface: "#18181b",
    surfaceRaised: "#27272a",
    border: "#27272a",
    textPrimary: "#fafafa",
    textSecondary: "#a1a1aa",
    accent: "#16b981",
    accentForeground: "#062017",
  },
  kinds: {
    file: "#6b7280",
    module: "#8b5cf6",
    struct: "#3b82f6",
    enum: "#06b6d4",
    function: "#10b981",
    trait: "#f59e0b",
    type_alias: "#ec4899",
    constant: "#f97316",
    impl: "#14b8a6",
    block: "#4b5563",
  },
};

// Light fallback, used only if a handoff sends theme:"light" without a
// full token set (defensive; the console always sends complete tokens).
const FALLBACK_LIGHT_TOKENS: GraphThemeTokens = {
  background: "#fafafa",
  surface: "#ffffff",
  surfaceRaised: "#ffffff",
  border: "#e4e4e7",
  textPrimary: "#18181b",
  textSecondary: "#52525b",
  accent: "#0f9b6c",
  accentForeground: "#fcfcfc",
};

let current: GraphThemePayload = FALLBACK_DARK;

/** The theme currently applied (defaults to dark until a handoff arrives). */
export function currentTheme(): GraphThemePayload {
  return current;
}

// Theme-change subscribers. The canvas reads `currentTheme()` at render, so a
// runtime theme swap (console handoff or the sidebar toggle) must re-render the
// React tree. Components subscribe and bump local state; `applyTheme` notifies.
type ThemeListener = (theme: GraphThemePayload) => void;
const listeners = new Set<ThemeListener>();

/** Subscribe to theme changes. Returns an unsubscribe function. */
export function subscribeTheme(listener: ThemeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A CSS colour we are willing to accept from a postMessage payload.
//
// Deliberately narrow: hex, rgb()/rgba(), hsl()/hsla(), and the plain
// keyword forms. Anything else -- a url(), a var(), a string carrying
// quotes or angle brackets -- is not a colour we need to support and is
// exactly what an injected value looks like.
//
// This matters beyond CSS. Token values are interpolated into the tooltip
// markup in `canvas/GraphCanvas.tsx`, which is assigned with
// `dangerouslySetInnerHTML`, so a token was a script-execution vector in
// the viewer's own origin, not just a way to make the chrome ugly.
const COLOR_PATTERN =
  /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9a-z.,%/\s+-]*\)|[a-z]{3,20})$/i;

function isColorValue(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && COLOR_PATTERN.test(value.trim());
}

/**
 * Keep only the entries of `value` whose values are colours we accept.
 *
 * Dropping a bad entry rather than rejecting the whole payload keeps a
 * console that adds a token ahead of the viewer working, which is the
 * reason the merge onto a fallback exists in the first place.
 */
function colorEntriesOf(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (isColorValue(raw)) out[key] = raw.trim();
  }
  return out;
}

/**
 * A colour safe to interpolate into markup, or a neutral fallback.
 *
 * `applyTheme` already filters what it stores, so this is the second
 * line rather than the first. It exists because the tooltip builders in
 * `canvas/GraphCanvas.tsx` interpolate colours into an HTML string that
 * `react-force-graph` and `PointsCanvas` inject as raw HTML -- the
 * library takes a string, so there is no JSX form to fall back on. Any
 * colour reaching markup goes through here, including node colours that
 * come from graph data rather than the theme.
 */
export function safeColor(value: unknown): string {
  return isColorValue(value) ? value.trim() : "transparent";
}

/**
 * Narrow-validate an untrusted `theme` field from a postMessage payload.
 *
 * Shape only. `applyTheme` is what filters the individual token values,
 * because a payload with one bad token is still worth applying.
 */
export function isThemePayload(value: unknown): value is GraphThemePayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.theme !== "light" && v.theme !== "dark") return false;
  if (!v.tokens || typeof v.tokens !== "object") return false;
  if (!v.kinds || typeof v.kinds !== "object") return false;
  return true;
}

/**
 * Apply a theme: store it and write the core tokens onto CSS variables on
 * `:root` (`--gv-bg`, `--gv-surface`, ...). Components read these vars via
 * Tailwind arbitrary values / inline styles so a theme change re-tints the
 * whole chrome without prop drilling. Also toggles a `light`/`dark` class
 * for any class-based styling.
 */
export function applyTheme(payload: GraphThemePayload): void {
  // Merge onto the matching fallback so a partial payload never leaves a
  // token undefined (which would blank a surface).
  const base = payload.theme === "light" ? { ...FALLBACK_DARK.tokens, ...FALLBACK_LIGHT_TOKENS } : FALLBACK_DARK.tokens;
  // Only colour-shaped values are merged in; anything else falls back.
  // The payload arrives by postMessage from a window we do not control,
  // and these values reach both CSS variables and tooltip markup.
  const tokens: GraphThemeTokens = { ...base, ...colorEntriesOf(payload.tokens) };
  const kinds: GraphKindPalette = { ...FALLBACK_DARK.kinds, ...colorEntriesOf(payload.kinds) };
  current = { theme: payload.theme, tokens, kinds };

  const root = document.documentElement;
  const map: Record<string, string> = {
    "--gv-bg": tokens.background,
    "--gv-surface": tokens.surface,
    "--gv-surface-raised": tokens.surfaceRaised,
    "--gv-border": tokens.border,
    "--gv-text-primary": tokens.textPrimary,
    "--gv-text-secondary": tokens.textSecondary,
    "--gv-accent": tokens.accent,
    "--gv-accent-foreground": tokens.accentForeground,
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v);
  root.classList.toggle("dark", current.theme === "dark");
  root.classList.toggle("light", current.theme === "light");

  for (const listener of listeners) listener(current);
}

/**
 * Switch to `next` (light/dark) at runtime, e.g. from the sidebar toggle.
 * Keeps the current node-kind palette (hues read well on both canvases) and
 * uses the built-in token set for the target theme so the swap works even for
 * a standalone open that never received a console handoff.
 */
export function setTheme(next: GraphTheme): void {
  if (next === current.theme) return;
  const tokens = next === "light" ? FALLBACK_LIGHT_TOKENS : FALLBACK_DARK.tokens;
  applyTheme({ theme: next, tokens, kinds: current.kinds });
}

/** Flip between light and dark. Convenience wrapper over `setTheme`. */
export function toggleTheme(): GraphTheme {
  const next: GraphTheme = current.theme === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** Per-kind node color from the active theme palette. */
export function nodeKindColor(kind: NodeKind): string {
  return current.kinds[kind as keyof GraphKindPalette] ?? current.kinds.file;
}

/**
 * Edge relation color. The console payload carries node-kind hues only;
 * edges reuse those same hues by a stable relation->kind-slot mapping so
 * edge colors track the theme without a second palette in the payload.
 */
const EDGE_HUE_SLOT: Record<string, keyof GraphKindPalette> = {
  imports: "module",
  calls: "function",
  defines: "struct",
  contains: "file",
  references: "trait",
  implements: "impl",
  depends_on: "type_alias",
  documented_by: "enum",
  tested_by: "constant",
  similar_to: "impl",
  related_to: "trait",
};

export function edgeRelationColor(relation: string): string {
  const slot = EDGE_HUE_SLOT[relation];
  return slot ? current.kinds[slot] : current.tokens.border;
}

/**
 * Memory-view palettes. The console handoff carries code node-kind hues only,
 * so the memory graph uses its own fixed palette (like code hues, these read
 * well on both the light and dark canvas and stay constant across a theme
 * swap). Records are neutral so the colored identity hubs stand out; each hub
 * dimension gets a distinct hue.
 */
const MEMORY_NODE_PALETTE: Record<MemoryNodeKind, string> = {
  record: "#94a3b8", // slate — neutral, so hubs pop against a field of records
  actor: "#3b82f6", // blue
  app: "#8b5cf6", // violet
  agent: "#10b981", // emerald
  session: "#f59e0b", // amber
  scope: "#ec4899", // pink
};

const MEMORY_EDGE_PALETTE: Record<MemoryEdgeKind, string> = {
  membership: "#64748b", // muted slate — structural, recedes
  supersession: "#f97316", // orange — draws the eye to replacement chains
};

/** Per-kind memory node color (record or identity hub). */
export function memoryNodeColor(kind: MemoryNodeKind): string {
  return MEMORY_NODE_PALETTE[kind] ?? MEMORY_NODE_PALETTE.record;
}

/** Per-kind memory edge color (membership or supersession). */
export function memoryEdgeColor(kind: MemoryEdgeKind): string {
  return MEMORY_EDGE_PALETTE[kind] ?? current.tokens.border;
}
