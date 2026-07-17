import type { MemoryRecordExport, MemoryViewNode } from "../types";
import { memoryNodeColor } from "../theme/theme";

// Memory-view node inspector (R5). For a record: full content and all present
// fields. For a hub: the dimension, member count, and a member list capped at
// 50 (with an overflow note) so a huge hub doesn't blow up the panel.

const MEMBER_LIST_CAP = 50;

interface MemoryNodeDetailProps {
  node: MemoryViewNode | null;
  /** Members of the selected hub (already filtered to those in the graph). */
  hubMembers?: MemoryRecordExport[];
}

export function MemoryNodeDetail({ node, hubMembers = [] }: MemoryNodeDetailProps) {
  if (!node) {
    return (
      <div className="pt-4" style={{ borderTop: "1px solid var(--gv-border)" }}>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--gv-text-secondary)" }}>Node Detail</h2>
        <p className="text-xs" style={{ color: "var(--gv-text-secondary)", opacity: 0.7 }}>Click a node to inspect.</p>
      </div>
    );
  }

  const color = memoryNodeColor(node.nodeKind);

  if (node.nodeKind !== "record") {
    const shown = hubMembers.slice(0, MEMBER_LIST_CAP);
    const overflow = hubMembers.length - shown.length;
    return (
      <div className="pt-4" style={{ borderTop: "1px solid var(--gv-border)" }}>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--gv-text-secondary)" }}>Hub Detail</h2>
        <div className="space-y-2 text-xs">
          <div>
            <span className="inline-block px-2 py-0.5 rounded text-xs" style={{ backgroundColor: color, color: "#fff" }}>
              {node.nodeKind}
            </span>
            <span className="ml-2 font-mono" style={{ color: "var(--gv-text-primary)" }}>{node.label}</span>
          </div>
          <Field label="Members" value={String(node.memberCount ?? hubMembers.length)} mono />
          {shown.length > 0 && (
            <div>
              <div style={{ color: "var(--gv-text-secondary)" }}>Member records</div>
              <ul className="mt-1 space-y-1">
                {shown.map((r) => (
                  <li key={r.id} className="font-mono break-all" style={{ color: "var(--gv-text-primary)" }}>
                    {previewContent(r)}
                  </li>
                ))}
              </ul>
              {overflow > 0 && (
                <div className="mt-1" style={{ color: "var(--gv-text-secondary)", opacity: 0.7 }}>
                  +{overflow} more…
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const record = node.record;
  return (
    <div className="pt-4" style={{ borderTop: "1px solid var(--gv-border)" }}>
      <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--gv-text-secondary)" }}>Record Detail</h2>
      <div className="space-y-2 text-xs">
        <div>
          <span className="inline-block px-2 py-0.5 rounded text-xs" style={{ backgroundColor: color, color: "#fff" }}>
            {record?.kind || "record"}
          </span>
          {record?.superseded && (
            <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs" style={{ backgroundColor: "var(--gv-border)", color: "var(--gv-text-secondary)" }}>
              superseded
            </span>
          )}
        </div>
        {record && (
          <>
            <div>
              <div style={{ color: "var(--gv-text-secondary)" }}>Content</div>
              <div className="whitespace-pre-wrap break-words" style={{ color: "var(--gv-text-primary)" }}>{record.content}</div>
            </div>
            <Field label="ID" value={record.id} mono breakAll />
            {record.tier && <Field label="Tier" value={record.tier} mono />}
            {record.category && <Field label="Category" value={record.category} mono />}
            {record.actor_id && <Field label="Actor" value={record.actor_id} mono />}
            {record.app_id && <Field label="App" value={record.app_id} mono />}
            {record.agent_id && <Field label="Agent" value={record.agent_id} mono />}
            {record.session_id && <Field label="Session" value={record.session_id} mono />}
            {record.scope_id && <Field label="Scope" value={record.scope_id} mono />}
            {record.importance != null && <Field label="Importance" value={String(record.importance)} mono />}
            {record.access_count != null && <Field label="Access count" value={String(record.access_count)} mono />}
            {record.superseded_by && <Field label="Superseded by" value={record.superseded_by} mono breakAll />}
            {record.created_at_unix_ms != null && <Field label="Created" value={formatTime(record.created_at_unix_ms)} mono />}
            {record.updated_at_unix_ms != null && <Field label="Updated" value={formatTime(record.updated_at_unix_ms)} mono />}
          </>
        )}
      </div>
    </div>
  );
}

function previewContent(record: MemoryRecordExport): string {
  const text = record.content.replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text || record.id;
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
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
      <div className={`${mono ? "font-mono" : ""} ${breakAll ? "break-all" : ""}`} style={{ color: "var(--gv-text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
