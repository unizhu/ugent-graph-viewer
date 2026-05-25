import { useEffect, useState } from "react";
import type { GraphNode, FileSnippet, FileSnippetsResponse } from "../types";
import { NODE_KIND_COLORS } from "../types";
import {
  fetchFileSnippets,
  getEngineToken,
  setEngineToken,
} from "../api/snippets";

interface NodeDetailProps {
  node: GraphNode | null;
}

type SnippetState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; reason: string }
  | { status: "ready"; data: FileSnippetsResponse };

export function NodeDetail({ node }: NodeDetailProps) {
  const [snippetState, setSnippetState] = useState<SnippetState>({
    status: "idle",
  });
  const [tokenInput, setTokenInput] = useState<string>(getEngineToken() ?? "");
  const [tokenSaved, setTokenSaved] = useState(false);

  // Lazy-fetch chunk text whenever the selected node changes and is a
  // file-kind node. Bail for non-file nodes since the snippet endpoint is
  // keyed on (codebase_id, file_path) only.
  useEffect(() => {
    if (!node) {
      setSnippetState({ status: "idle" });
      return;
    }
    if (node.kind !== "file") {
      setSnippetState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setSnippetState({ status: "loading" });
    fetchFileSnippets(node.codebase_id, node.file_path, controller.signal)
      .then((result) => {
        if ("error" in result) {
          setSnippetState({ status: "error", reason: result.error });
        } else {
          setSnippetState({ status: "ready", data: result });
        }
      })
      .catch((err) => {
        if ((err as DOMException)?.name !== "AbortError") {
          setSnippetState({
            status: "error",
            reason: (err as Error).message,
          });
        }
      });

    return () => controller.abort();
  }, [node]);

  if (!node) {
    return (
      <div className="border-t border-gray-800 pt-4">
        <h2 className="text-sm font-semibold text-gray-400 mb-2">Node Detail</h2>
        <p className="text-xs text-gray-600">Click a node to inspect.</p>
      </div>
    );
  }

  const kindColor = NODE_KIND_COLORS[node.kind] || "#6b7280";

  return (
    <div className="border-t border-gray-800 pt-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-2">Node Detail</h2>
      <div className="space-y-2 text-xs">
        <div>
          <span
            className="inline-block px-2 py-0.5 rounded text-white text-xs"
            style={{ backgroundColor: kindColor }}
          >
            {node.kind}
          </span>
          <span className="ml-2 text-white font-mono">{node.name}</span>
        </div>
        <div>
          <div className="text-gray-500">ID</div>
          <div className="text-gray-300 font-mono break-all">{node.id}</div>
        </div>
        <div>
          <div className="text-gray-500">File</div>
          <div className="text-gray-300 font-mono break-all">
            {node.file_path}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Lines</div>
          <div className="text-gray-300 font-mono">
            {node.line_range[0]}-{node.line_range[1]}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Codebase</div>
          <div className="text-gray-300 font-mono">{node.codebase_id}</div>
        </div>
        {node.community_id != null && (
          <div>
            <div className="text-gray-500">Community</div>
            <div className="text-gray-300 font-mono">{node.community_id}</div>
          </div>
        )}
      </div>

      {node.kind === "file" && (
        <div className="mt-4 border-t border-gray-800 pt-3">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">
            File content
          </h3>
          <SnippetsView state={snippetState} />
          <details className="mt-3">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
              Engine API token
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <input
                type="password"
                value={tokenInput}
                placeholder="bearer token (leave blank if SERVICE_TOKENS empty)"
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  setTokenSaved(false);
                }}
                className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 font-mono"
              />
              <button
                onClick={() => {
                  setEngineToken(tokenInput);
                  setTokenSaved(true);
                }}
                className="self-start px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 transition-colors"
              >
                {tokenSaved ? "Saved" : "Save token"}
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function SnippetsView({ state }: { state: SnippetState }) {
  if (state.status === "idle") {
    return (
      <p className="text-xs text-gray-600">
        Select a file node to load its content.
      </p>
    );
  }
  if (state.status === "loading") {
    return <p className="text-xs text-blue-400 animate-pulse">Loading…</p>;
  }
  if (state.status === "error") {
    return (
      <p className="text-xs text-red-400 font-mono break-all">
        Failed: {state.reason}
      </p>
    );
  }
  const { data } = state;
  if (data.chunks.length === 0) {
    return (
      <p className="text-xs text-gray-600">
        No chunks indexed for this file in Qdrant.
      </p>
    );
  }
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {data.chunks.map((c) => (
        <SnippetItem key={c.chunk_index} snippet={c} />
      ))}
      {data.truncated && (
        <p className="text-xs text-amber-400">
          Truncated at {data.chunks.length} chunks. Increase max_chunks to see
          more.
        </p>
      )}
    </div>
  );
}

function SnippetItem({ snippet }: { snippet: FileSnippet }) {
  return (
    <div className="border border-gray-800 rounded">
      <div className="px-2 py-1 bg-gray-900 text-xs text-gray-500 font-mono flex items-center justify-between">
        <span>
          chunk #{snippet.chunk_index} · lines {snippet.start_line}-
          {snippet.end_line}
        </span>
        {snippet.symbol_name && (
          <span className="text-gray-400 truncate max-w-[60%]">
            {snippet.symbol_name}
          </span>
        )}
      </div>
      <pre className="px-2 py-2 text-xs text-gray-300 font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
        {snippet.text}
      </pre>
    </div>
  );
}
