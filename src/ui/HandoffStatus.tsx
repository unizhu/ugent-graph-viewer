import type { HandoffState } from "../handoff/handoff";

// Full-screen status surfaces for the console handoff lifecycle (R14):
// waiting for the handshake, loading the viewport, and the terminal
// expired / forbidden / error states. Never a blank canvas or a silent
// failure. All chrome is driven by the theme CSS vars so these screens
// match the console's light/dark choice.

interface HandoffStatusProps {
  state: HandoffState;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-screen w-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "var(--gv-bg)", color: "var(--gv-text-primary)" }}
    >
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="h-8 w-8 rounded-full border-2 border-transparent animate-spin"
      style={{ borderTopColor: "var(--gv-accent)", borderRightColor: "var(--gv-accent)" }}
      aria-hidden="true"
    />
  );
}

export function HandoffStatus({ state }: HandoffStatusProps) {
  if (state.status === "waiting" || state.status === "loading") {
    return (
      <Shell>
        <Spinner />
        <h1 className="text-lg font-semibold">
          {state.status === "waiting" ? "Connecting to the console…" : "Loading graph…"}
        </h1>
        <p className="text-sm max-w-sm" style={{ color: "var(--gv-text-secondary)" }}>
          {state.status === "waiting"
            ? "Waiting for the tenant console to hand off your graph. This tab was opened from the console's Workspaces page."
            : "Fetching the graph export for this workspace."}
        </p>
      </Shell>
    );
  }

  if (state.status === "expired") {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Session expired</h1>
        <p className="text-sm max-w-sm" style={{ color: "var(--gv-text-secondary)" }}>
          This graph link is single-use and short-lived. Reopen the viewer from the
          <span className="font-medium"> View graph </span>
          button on the console's Workspaces page to start a fresh session.
        </p>
      </Shell>
    );
  }

  if (state.status === "forbidden") {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Not authorized</h1>
        <p className="text-sm max-w-sm" style={{ color: "var(--gv-text-secondary)" }}>
          Your tenant does not own this workspace, or access was revoked. Reopen from the
          console if you believe this is an error.
        </p>
      </Shell>
    );
  }

  // "ready" is handled by the caller (the explorer renders); nothing to show
  // here for it. Any remaining state is the error case.
  if (state.status !== "error") return null;

  return (
    <Shell>
      <h1 className="text-lg font-semibold">Could not load the graph</h1>
      <p
        className="text-sm max-w-sm font-mono break-all"
        style={{ color: "var(--gv-text-secondary)" }}
      >
        {state.reason}
      </p>
      <p className="text-sm max-w-sm" style={{ color: "var(--gv-text-secondary)" }}>
        Try reopening the viewer from the console.
      </p>
    </Shell>
  );
}
