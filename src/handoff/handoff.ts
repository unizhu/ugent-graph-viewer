// Console handoff client (viewer side).
//
// The viewer is opened in a new tab by the tenant console. Authority is
// handed off over an origin-checked `postMessage` handshake, never in the
// URL:
//
//   1. On load, if opened with an opener, the viewer posts
//      `graph-viewer:ready` to `window.opener`.
//   2. The console replies with `graph-viewer:handoff` carrying a
//      single-use token, the console origin, the codebase id, the resolved
//      theme, and an optional focus node.
//   3. The viewer redeems the token once at
//      `{consoleOrigin}/api/graph/redeem` for a short-lived HMAC-signed
//      data URL, then fetches it to obtain the ExportViewport.
//   4. On tab close the viewer beacons `{consoleOrigin}/api/graph/close`
//      (a `text/plain` body, so no preflight the beacon cannot perform) to
//      revoke the session.
//
// The viewer never holds an engine credential; the console proxies the
// engine export with its sealed key. See the console's
// `docs/plans/phase-5-graph-viewer-handoff.md`.

import type { ExportViewport } from "../types";
import { applyTheme, isThemePayload } from "../theme/theme";

const READY_TYPE = "graph-viewer:ready";
const HANDOFF_TYPE = "graph-viewer:handoff";

// How long to wait for the console to answer a `ready` before treating the
// handshake as failed (console tab closed, or opener unreachable).
const HANDSHAKE_TIMEOUT_MS = 8000;

// Bounded automatic recovery attempts (R17): on a redeem/fetch expiry we
// re-post `ready` so the console re-mints, up to this many times before
// falling back to the explicit "reopen from the console" state (R14).
const MAX_RECOVERY_ATTEMPTS = 1;

/**
 * What the console handed off. "graph" is the Phase-5 code-graph viewport;
 * "memory" (R7) is the tenant's memory export NDJSON, which the viewer parses
 * with `parseMemoryExport` and shows in the memory view.
 */
export type HandoffDataType = "graph" | "memory";

export type HandoffState =
  | { status: "waiting" } // handshake in flight, awaiting the console
  | { status: "loading" } // redeeming / fetching the data
  // Ready is discriminated by data type: a code graph carries the viewport
  // (and optional focus node); a memory graph carries the raw NDJSON text.
  | { status: "ready"; dataType: "graph"; viewport: ExportViewport; focusNode: string | null }
  | { status: "ready"; dataType: "memory"; memoryText: string }
  | { status: "expired" } // token expired / opener gone -> reopen from console
  | { status: "forbidden" } // engine 403 (ownership)
  | { status: "error"; reason: string };

interface HandoffMessage {
  type: typeof HANDOFF_TYPE;
  token: string;
  consoleOrigin: string;
  codebaseId?: string;
  // Absent means "graph" (Phase-5 consoles predate this field).
  dataType?: HandoffDataType;
  theme?: unknown;
  node?: string | null;
}

/**
 * The `error` codes the console's data route emits for a session that is
 * genuinely unusable, as opposed to an engine error it passes through.
 *
 * Mirrors the console's `src/app/api/graph/data/route.ts`; the two files have
 * to agree. A code absent from this list is treated as an engine/console
 * refusal, which is the safer default: re-minting cannot fix authorization,
 * so retrying it would only hide the real reason behind an expiry message.
 */
const SESSION_GONE_CODES = new Set(["session_gone", "expired"]);

/**
 * The `error` code from a JSON error body, or `null` when the body is absent
 * or unparseable.
 */
export async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as unknown;
    if (!body || typeof body !== "object") return null;
    const code = (body as Record<string, unknown>).error;
    return typeof code === "string" && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/**
 * Whether a 401 means "this session is dead, re-mint" rather than "the
 * request was refused".
 *
 * `null` (no readable code) counts as session-gone: that is the behaviour
 * every 401 had before codes were consulted, so an unreadable body degrades
 * to the old path rather than to a new one.
 */
export function isSessionGoneCode(code: string | null): boolean {
  return code === null || SESSION_GONE_CODES.has(code);
}

function isHandoffMessage(data: unknown): data is HandoffMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === HANDOFF_TYPE &&
    typeof d.token === "string" &&
    typeof d.consoleOrigin === "string"
  );
}

/** True when this tab was opened by another window (i.e. the console). */
export function hasConsoleOpener(): boolean {
  try {
    return typeof window !== "undefined" && !!window.opener && window.opener !== window;
  } catch {
    // Cross-origin opener access can throw under some COOP configs; treat
    // an inaccessible-but-present opener as usable and let postMessage try.
    return typeof window !== "undefined" && !!window.opener;
  }
}

export interface HandoffController {
  /** Begin the handshake. Idempotent; a second call is a no-op. */
  start(): void;
  /** Detach listeners and the close beacon. */
  dispose(): void;
}

/**
 * Drive the full handoff for the viewer. `onState` is called on every
 * transition; `onFocusNode` is a convenience for the deep-link focus.
 */
export function createHandoff(onState: (state: HandoffState) => void): HandoffController {
  let started = false;
  let settled = false; // a viewport was delivered; ignore further handshakes
  let consoleOrigin: string | null = null;
  let token: string | null = null;
  let focusNode: string | null = null;
  let dataType: HandoffDataType = "graph";
  let recoveryAttempts = 0;
  let handshakeTimer: number | null = null;

  function clearTimer() {
    if (handshakeTimer !== null) {
      window.clearTimeout(handshakeTimer);
      handshakeTimer = null;
    }
  }

  function postReady() {
    onState({ status: "waiting" });
    clearTimer();
    // The `ready` signal carries no secret, so it is safe to broadcast; the
    // console validates `event.origin === viewerOrigin` before replying.
    try {
      window.opener?.postMessage({ type: READY_TYPE }, "*");
    } catch {
      // fall through to the timeout -> expired path
    }
    handshakeTimer = window.setTimeout(() => {
      if (!settled) onState({ status: "expired" });
    }, HANDSHAKE_TIMEOUT_MS);
  }

  async function redeemAndFetch(): Promise<void> {
    if (!consoleOrigin || !token) return;
    onState({ status: "loading" });
    try {
      const redeemRes = await fetch(`${consoleOrigin}/api/graph/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (redeemRes.status === 401 || redeemRes.status === 409) {
        return recoverOrExpire();
      }
      if (!redeemRes.ok) {
        onState({ status: "error", reason: `redeem failed (HTTP ${redeemRes.status})` });
        return;
      }
      const { dataUrl } = (await redeemRes.json()) as { dataUrl: string };

      const dataRes = await fetch(`${consoleOrigin}${dataUrl}`, { method: "GET" });
      if (dataRes.status === 401) {
        // 401 from the data route is two different failures wearing one
        // status: the session really is gone, or the console passed through
        // an engine refusal. Retrying only helps the first. Treating both as
        // expiry re-ran the whole handshake and then blamed the session for
        // an authorization error -- which is exactly how an engine
        // `require_actor` rejection surfaced as "Session expired".
        const code = await readErrorCode(dataRes);
        if (isSessionGoneCode(code)) return recoverOrExpire();
        onState({ status: "error", reason: `the console refused the data request (${code})` });
        return;
      }
      if (dataRes.status === 403) {
        onState({ status: "forbidden" });
        return;
      }
      if (!dataRes.ok) {
        onState({ status: "error", reason: `data fetch failed (HTTP ${dataRes.status})` });
        return;
      }
      settled = true;
      clearTimer();
      if (dataType === "memory") {
        // Memory is streamed as NDJSON; hand the raw text to the memory view,
        // which parses it with `parseMemoryExport`.
        const memoryText = await dataRes.text();
        onState({ status: "ready", dataType: "memory", memoryText });
      } else {
        const viewport = (await dataRes.json()) as ExportViewport;
        onState({ status: "ready", dataType: "graph", viewport, focusNode });
      }
    } catch (err) {
      onState({ status: "error", reason: (err as Error).message || "network error" });
    }
  }

  /**
   * Expiry recovery (R17): if the opener is still open, re-request a fresh
   * handoff by re-posting `ready` (the console re-mints while the tenant
   * session is valid). Only when the opener is gone/unresponsive do we
   * surface the explicit "reopen from the console" state.
   */
  function recoverOrExpire(): void {
    const openerAlive = (() => {
      try {
        return !!window.opener && !window.opener.closed;
      } catch {
        return !!window.opener;
      }
    })();
    if (openerAlive && recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
      recoveryAttempts += 1;
      token = null;
      postReady();
      return;
    }
    onState({ status: "expired" });
  }

  function onMessage(event: MessageEvent) {
    if (!isHandoffMessage(event.data)) return;
    // Defense: the origin the message actually came from must match the
    // consoleOrigin it claims, and we bind all later calls to that origin.
    if (event.data.consoleOrigin !== event.origin) return;
    if (settled) return; // already have a viewport; ignore duplicates

    consoleOrigin = event.origin;
    token = event.data.token;
    dataType = event.data.dataType === "memory" ? "memory" : "graph";
    focusNode =
      typeof event.data.node === "string" && event.data.node.length > 0
        ? event.data.node
        : focusNode;

    if (isThemePayload(event.data.theme)) applyTheme(event.data.theme);

    clearTimer();
    void redeemAndFetch();
  }

  function onPageHide() {
    // Best-effort revoke. Must be a CORS-safelisted content type so the
    // beacon is not dropped for lack of a preflight - a bare string is sent
    // as text/plain, which the console's close route parses as the token.
    if (consoleOrigin && token) {
      try {
        navigator.sendBeacon(`${consoleOrigin}/api/graph/close`, token);
      } catch {
        // best-effort only
      }
    }
  }

  return {
    start() {
      if (started) return;
      started = true;
      window.addEventListener("message", onMessage);
      window.addEventListener("pagehide", onPageHide);
      postReady();
    },
    dispose() {
      clearTimer();
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onPageHide);
    },
  };
}
