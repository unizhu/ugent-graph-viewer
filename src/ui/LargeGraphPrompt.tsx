export type LoadChoice = "file" | "twod" | "threed";

interface LargeGraphPromptProps {
  nodeCount: number;
  edgeCount: number;
  onChoose: (choice: LoadChoice) => void;
}

interface Option {
  choice: LoadChoice;
  title: string;
  description: string;
  badge: string;
}

const OPTIONS: Option[] = [
  {
    choice: "file",
    title: "Aggregate to File View",
    description: "Collapse symbols into their files. Fewest nodes — smoothest.",
    badge: "Lightest",
  },
  {
    choice: "twod",
    title: "Full graph in 2D",
    description: "Every symbol, flat 2D canvas. Fast at large scale.",
    badge: "Fast",
  },
  {
    choice: "threed",
    title: "Full graph in 3D",
    description: "Every symbol in 3D. Richest, but heaviest to render.",
    badge: "Heaviest",
  },
];

/**
 * Shown before rendering a large export (R5). Lets the user pick how to open
 * the graph so a huge dataset doesn't drop them into the heaviest 3D path by
 * default. States the node/edge counts so the choice is informed.
 */
export function LargeGraphPrompt({ nodeCount, edgeCount, onChoose }: LargeGraphPromptProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Choose how to open this large graph"
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--gv-surface)", border: "1px solid var(--gv-border)" }}
      >
        <h2 className="text-lg font-bold mb-1" style={{ color: "var(--gv-text-primary)" }}>
          Large graph
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--gv-text-secondary)" }}>
          This export has{" "}
          <span style={{ color: "var(--gv-text-primary)", fontWeight: 600 }}>
            {nodeCount.toLocaleString()}
          </span>{" "}
          nodes and{" "}
          <span style={{ color: "var(--gv-text-primary)", fontWeight: 600 }}>
            {edgeCount.toLocaleString()}
          </span>{" "}
          edges. Choose how to open it — you can change this later.
        </p>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.choice}
              type="button"
              onClick={() => onChoose(opt.choice)}
              className="text-left rounded-xl px-4 py-3 transition-colors hover:opacity-90"
              style={{ background: "var(--gv-surface-raised)", border: "1px solid var(--gv-border)" }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-semibold" style={{ color: "var(--gv-text-primary)" }}>
                  {opt.title}
                </span>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: "var(--gv-accent)", color: "var(--gv-accent-foreground)" }}
                >
                  {opt.badge}
                </span>
              </div>
              <span className="text-xs" style={{ color: "var(--gv-text-secondary)" }}>
                {opt.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
