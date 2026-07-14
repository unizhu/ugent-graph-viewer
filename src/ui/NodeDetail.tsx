import type { GraphNode } from "../types";
import { nodeKindColor } from "../theme/theme";

// Node inspector. File-snippet fetching and the engine-token input were
// removed for the console-handoff model (R11): the viewer holds no engine
// credential, and there is no console proxy for `/v1/files/snippets` in v1
// (out of scope, see the console plan). Colors come from the active theme
// palette; chrome uses the theme CSS vars so it tracks light/dark.

interface NodeDetailProps {
  node: GraphNode | null;
}

export function NodeDetail({ node }: NodeDetailProps) {
  if (!node) {
    return (
      <div className="pt-4" style={{ borderTop: "1px solid var(--gv-border)" }}>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--gv-text-secondary)" }}>
          Node Detail
        </h2>
        <p className="text-xs" style={{ color: "var(--gv-text-secondary)", opacity: 0.7 }}>
          Click a node to inspect.
        </p>
      </div>
    );
  }

  const kindColor = nodeKindColor(node.kind);

  return (
    <div className="pt-4" style={{ borderTop: "1px solid var(--gv-border)" }}>
      <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--gv-text-secondary)" }}>
        Node Detail
      </h2>
      <div className="space-y-2 text-xs">
        <div>
          <span
            className="inline-block px-2 py-0.5 rounded text-xs"
            style={{ backgroundColor: kindColor, color: "#ffffff" }}
          >
            {node.kind}
          </span>
          <span className="ml-2 font-mono" style={{ color: "var(--gv-text-primary)" }}>
            {node.name}
          </span>
        </div>
        <Field label="ID" value={node.id} mono breakAll />
        <Field label="File" value={node.file_path} mono breakAll />
        <Field label="Lines" value={`${node.line_range[0]}-${node.line_range[1]}`} mono />
        <Field label="Workspace" value={node.codebase_id} mono />
        {node.community_id != null && (
          <Field label="Community" value={String(node.community_id)} mono />
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  breakAll,
}: {
  label: string;
  value: string;
  mono?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div>
      <div style={{ color: "var(--gv-text-secondary)" }}>{label}</div>
      <div
        className={`${mono ? "font-mono" : ""} ${breakAll ? "break-all" : ""}`}
        style={{ color: "var(--gv-text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}
