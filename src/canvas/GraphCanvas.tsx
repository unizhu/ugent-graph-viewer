import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import ForceGraph3D from "react-force-graph-3d";
import ForceGraph2D from "react-force-graph-2d";
import Graph from "graphology";
import type { FilterState, MemoryFilterState, ViewMode } from "../types";
import { currentTheme } from "../theme/theme";
import {
  buildGraphData,
  buildMemoryGraphData,
  nodeSize,
  memoryNodeSize,
  type RenderLink,
  type RenderNode,
} from "./graph-data";
import {
  arrowsEnabledFor,
  cylinderLinksFor,
  hoverHighlightFor,
  nodeResolutionFor,
  type OrbitSettings,
  type RenderMode,
} from "./render-settings";

interface GraphCanvasProps {
  graph: Graph;
  filters: FilterState;
  /** Active view. Memory mode uses `memoryFilters` and memory accessors. */
  viewMode?: ViewMode;
  /** Filters for the memory view; required when viewMode === "memory". */
  memoryFilters?: MemoryFilterState;
  onNodeClick: (nodeId: string) => void;
  selectedNodeId: string | null;
  /** Deep-link / handoff focus target; the camera flies to it once (R13). */
  focusNodeId?: string | null;
  /** Called after a focus request has been handled so it fires only once. */
  onFocusHandled?: () => void;
  /** Progressive loading cap (R18); undefined/Infinity renders everything. */
  revealLimit?: number;
  /** 2D or 3D render mode (R1). */
  mode: RenderMode;
  /** Auto-orbit toggle + interval (R2). Orbit is 3D-only. */
  orbit: OrbitSettings;
  /** Show the 3D render statistics overlay (draw calls / triangles / fps). */
  showStats?: boolean;
}

const DIM_NODE = "rgba(107, 114, 128, 0.15)";
const DIM_LINK = "rgba(55, 65, 81, 0.05)";

export function GraphCanvas({
  graph,
  filters,
  viewMode = "code",
  memoryFilters,
  onNodeClick,
  selectedNodeId,
  focusNodeId,
  onFocusHandled,
  revealLimit,
  mode,
  orbit,
  showStats = false,
}: GraphCanvasProps) {
  const isMemory = viewMode === "memory";
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [hoveredNode, setHoveredNode] = useState<RenderNode | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [userInteracted, setUserInteracted] = useState(false);
  const interactionTimeoutRef = useRef<any>(null);

  // Track container size (accounts for the sidebar) for both canvases.
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    setDimensions({ width: container.clientWidth, height: container.clientHeight });
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Pause auto-orbit for 15s after any manual camera interaction.
  const handleUserInteraction = useCallback(() => {
    setUserInteracted(true);
    if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = setTimeout(() => setUserInteracted(false), 15000);
  }, []);

  useEffect(() => {
    return () => {
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    };
  }, []);

  // Build render nodes/links from the graphology graph, capped for progressive
  // loading. Shared by both render modes (see graph-data.ts). Memo keys on the
  // primitive filter values (not the filters object identity) so a new object
  // reference alone doesn't force a rebuild + re-layout; only real changes do.
  const graphData = useMemo(
    () =>
      isMemory && memoryFilters
        ? buildMemoryGraphData(graph, memoryFilters)
        : buildGraphData(graph, filters, revealLimit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      graph,
      revealLimit,
      isMemory,
      // Code filters:
      filters.aggregateMode,
      filters.workspaceId,
      filters.searchQuery,
      filters.searchRegex,
      filters.nodeKinds,
      filters.edgeRelations,
      filters.selectedCommunities,
      // Memory filters:
      memoryFilters?.kinds,
      memoryFilters?.tiers,
      memoryFilters?.hubs,
      memoryFilters?.showSuperseded,
      memoryFilters?.searchQuery,
      memoryFilters?.searchRegex,
      memoryFilters?.hideOrphans,
    ],
  );

  // Quality tiers for this graph size (see render-settings for the reasoning).
  const cylinderLinks = cylinderLinksFor(graphData.links.length);
  const highlightOnHover = hoverHighlightFor(graphData.nodes.length);

  // Hover highlights the node's first-hop neighbors and links.
  const handleNodeHover = useCallback(
    (node: RenderNode | null) => {
      if (node === hoveredNode) return;
      // Past the tier, skip the highlight sets entirely: populating them
      // re-renders, which changes the color/width accessor identities, which
      // makes react-force-graph re-evaluate them over every node and link.
      // The tooltip still tracks the cursor.
      if (!highlightOnHover) {
        setHoveredNode(node);
        return;
      }
      if (!node) {
        setHighlightNodes(new Set());
        setHighlightLinks(new Set());
        setHoveredNode(null);
        return;
      }

      const nextNodes = new Set<string>([node.id]);
      const nextLinks = new Set<string>();

      // Aggregate and memory views derive links in the builder (not 1:1 with
      // the graphology edges), so highlight from the rendered links; the code
      // symbol view can walk graphology directly.
      if (filters.aggregateMode || isMemory) {
        for (const link of graphData.links) {
          const src = typeof link.source === "object" ? (link.source as { id: string }).id : link.source;
          const tgt = typeof link.target === "object" ? (link.target as { id: string }).id : link.target;
          if (src === node.id || tgt === node.id) {
            nextLinks.add(link.id);
            nextNodes.add(src);
            nextNodes.add(tgt);
          }
        }
      } else if (graph.hasNode(node.id)) {
        graph.forEachEdge(node.id, (edgeId, _attrs, source, target) => {
          nextLinks.add(edgeId);
          nextNodes.add(source);
          nextNodes.add(target);
        });
      }

      setHighlightNodes(nextNodes);
      setHighlightLinks(nextLinks);
      setHoveredNode(node);
    },
    [graph, hoveredNode, filters.aggregateMode, isMemory, graphData, highlightOnHover],
  );

  // Click flies the camera to the node (3D uses cameraPosition; 2D centers).
  const handleNodeClick = useCallback(
    (node: any) => {
      if (!node) return;
      if (mode === "3d") {
        const distance = 80;
        const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
        fgRef.current?.cameraPosition(
          { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
          node,
          1500,
        );
      } else {
        fgRef.current?.centerAt(node.x || 0, node.y || 0, 1000);
        fgRef.current?.zoom(4, 1000);
      }
      onNodeClick(node.id);
    },
    [onNodeClick, mode],
  );

  // Deep-link / handoff focus (R13): fly to the node once layout positions it.
  useEffect(() => {
    if (!focusNodeId) return;
    let cancelled = false;
    let attempts = 0;

    const tryFocus = () => {
      if (cancelled) return;
      attempts += 1;
      const node = fgRef.current
        ?.graphData?.()
        ?.nodes?.find((n: any) => n.id === focusNodeId);
      const positioned = node && (node.x !== undefined || node.y !== undefined || node.z !== undefined);
      if (positioned) {
        if (mode === "3d") {
          const distance = 80;
          const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
          fgRef.current?.cameraPosition(
            { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
            node,
            1500,
          );
        } else {
          fgRef.current?.centerAt(node.x || 0, node.y || 0, 1000);
          fgRef.current?.zoom(4, 1000);
        }
        onNodeClick(node.id);
        onFocusHandled?.();
        return;
      }
      if (attempts < 40) {
        window.setTimeout(tryFocus, 100);
      } else {
        onFocusHandled?.();
      }
    };

    const start = window.setTimeout(tryFocus, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [focusNodeId, onNodeClick, onFocusHandled, mode]);

  // Auto-orbit (3D only, R2): runs only when enabled, at the configured
  // interval, and pauses while hovering / a node is selected / after manual
  // interaction. When disabled no timer runs, so there is no idle re-render.
  useEffect(() => {
    if (mode !== "3d" || !orbit.enabled) return;
    if (!fgRef.current) return;

    let angle = 0;
    let initialized = false;

    const interval = setInterval(() => {
      if (hoveredNode || selectedNodeId || userInteracted) {
        initialized = false;
        return;
      }
      if (!initialized) {
        const currentPos = fgRef.current?.cameraPosition?.();
        if (currentPos) {
          angle = Math.atan2(currentPos.x, currentPos.z);
          initialized = true;
        }
      }
      angle += 0.001;
      const distance = 350;
      fgRef.current?.cameraPosition({
        x: distance * Math.sin(angle),
        z: distance * Math.cos(angle),
      });
    }, orbit.intervalMs);

    return () => clearInterval(interval);
  }, [mode, orbit.enabled, orbit.intervalMs, hoveredNode, selectedNodeId, userInteracted]);

  // Render statistics for the 3D path. Draw calls are the figure that decides
  // whether this renderer can carry a graph this size: three-forcegraph makes
  // one object per node and per link, so the count tracks node+link count
  // rather than anything about the scene's complexity.
  //
  // `renderer.info.render.calls` is per-frame and reset by three each frame, so
  // sampling it on an interval reads the most recent frame. The rate shown is
  // requestAnimationFrame callbacks per second, which tracks the render loop
  // but is not identical to it -- it is a health indicator, not a benchmark.
  const [renderStats, setRenderStats] = useState<{
    calls: number;
    triangles: number;
    fps: number;
  } | null>(null);

  useEffect(() => {
    if (!showStats || mode !== "3d") {
      setRenderStats(null);
      return;
    }
    let frames = 0;
    let raf = requestAnimationFrame(function tick() {
      frames += 1;
      raf = requestAnimationFrame(tick);
    });
    const sample = window.setInterval(() => {
      const info = fgRef.current?.renderer?.()?.info?.render;
      setRenderStats({
        calls: info?.calls ?? 0,
        triangles: info?.triangles ?? 0,
        fps: frames,
      });
      frames = 0;
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(sample);
    };
  }, [showStats, mode]);

  // Theme-derived canvas chrome, read at render (theme is applied before load).
  const theme = currentTheme();
  const canvasBg =
    theme.theme === "light"
      ? `radial-gradient(circle, ${theme.tokens.surface} 0%, ${theme.tokens.background} 100%)`
      : `radial-gradient(circle, ${theme.tokens.surfaceRaised} 0%, ${theme.tokens.background} 100%)`;

  // Shared accessors so both modes color/size identically.
  const nodeColor = useCallback(
    (node: any) => {
      if (highlightNodes.size > 0) {
        return highlightNodes.has(node.id) ? node.color : DIM_NODE;
      }
      return node.color;
    },
    [highlightNodes],
  );

  const linkColor = useCallback(
    (link: any) => {
      if (highlightNodes.size > 0) {
        return highlightLinks.has(link.id) ? link.color : DIM_LINK;
      }
      return link.color;
    },
    [highlightNodes, highlightLinks],
  );

  const linkWidth = useCallback(
    (link: RenderLink) => {
      const baseWidth = Math.max(0.5, link.confidence * 1.5);
      // Past the tier, everything unhighlighted must be EXACTLY 0: that is what
      // makes three-forcegraph build a 2-vertex unlit Line rather than a
      // CylinderGeometry mesh with a lit material. A small non-zero "dimmed"
      // width looks thinner but costs the same as a full cylinder.
      if (!cylinderLinks) {
        return highlightLinks.has(link.id) ? baseWidth * 1.5 : 0;
      }
      if (highlightNodes.size > 0) {
        return highlightLinks.has(link.id) ? baseWidth * 1.5 : 0.2;
      }
      return baseWidth;
    },
    [highlightNodes, highlightLinks, cylinderLinks],
  );

  const nodeLabel = useCallback(
    (node: RenderNode) => {
      if (node.memoryKind) return memoryNodeTooltip(node, theme);
      return `
      <div style="
        background: ${theme.tokens.surfaceRaised};
        border: 1px solid ${theme.tokens.border};
        border-radius: 8px;
        padding: 8px 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        backdrop-filter: blur(12px);
        min-width: 180px;
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${node.color};"></span>
          <span style="font-weight: 700; color: ${theme.tokens.textPrimary}; font-size: 13px;">${node.label}</span>
        </div>
        <div style="font-size: 11px; color: ${theme.tokens.textSecondary}; margin-bottom: 4px;">
          <span style="color: ${theme.tokens.textSecondary}; font-weight: 500;">Kind:</span>
          <span style="font-family: monospace; background: ${theme.tokens.surface}; padding: 1px 4px; border-radius: 4px; color: ${theme.tokens.accent};">${node.kind}</span>
        </div>
        ${
          node.filePath
            ? `<div style="font-size: 10px; color: ${theme.tokens.textSecondary}; font-family: monospace; word-break: break-all; border-top: 1px solid ${theme.tokens.border}; padding-top: 4px; margin-top: 4px;">${node.filePath}</div>`
            : ""
        }
      </div>
    `;
    },
    [theme],
  );

  // Node draw size: memory view sizes records by importance/access and hubs by
  // member count; code view sizes by degree.
  const nodeVal = useCallback(
    (node: RenderNode) => (node.memoryKind ? memoryNodeSize(node) : nodeSize(node.degree)),
    [],
  );

  // Geometry shedding for large 3D graphs; thresholds live in render-settings.
  const arrowsOn = arrowsEnabledFor(graphData.links.length);
  const nodeRes = nodeResolutionFor(graphData.nodes.length);

  const ready = dimensions.width > 0 && dimensions.height > 0;

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ background: canvasBg }}
      onMouseDown={handleUserInteraction}
      onTouchStart={handleUserInteraction}
      onPointerDown={handleUserInteraction}
      onWheel={handleUserInteraction}
    >
      {ready && mode === "3d" && (
        <ForceGraph3D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          backgroundColor="rgba(0, 0, 0, 0)"
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeResolution={nodeRes}
          nodeLabel={nodeLabel}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={arrowsOn ? 3.5 : 0}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={linkColor}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          warmupTicks={60}
          cooldownTicks={0}
          // Ask for the discrete GPU on dual-GPU machines. antialias is
          // already true by default in three-render-objects, so it is not
          // repeated here.
          rendererConfig={{ powerPreference: "high-performance" }}
        />
      )}
      {ready && mode === "2d" && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          backgroundColor="rgba(0, 0, 0, 0)"
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeLabel={nodeLabel}
          nodeRelSize={4}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={arrowsOn ? 3.5 : 0}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={linkColor}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          warmupTicks={60}
          cooldownTicks={80}
        />
      )}
      {renderStats && (
        <div
          className="absolute top-2 right-2 px-2 py-1 rounded-md font-mono text-[10px] leading-tight pointer-events-none"
          style={{
            background: "var(--gv-surface-raised)",
            border: "1px solid var(--gv-border)",
            color: "var(--gv-text-secondary)",
          }}
        >
          <div>{renderStats.calls.toLocaleString()} draw calls</div>
          <div>{renderStats.triangles.toLocaleString()} tris</div>
          <div>
            {renderStats.fps} fps &middot; {graphData.nodes.length.toLocaleString()}n{" "}
            {graphData.links.length.toLocaleString()}e
          </div>
        </div>
      )}
    </div>
  );
}

// Escape user-supplied strings before interpolating into the tooltip HTML.
// Record content and hub values are untrusted (they come from the export), and
// react-force-graph injects nodeLabel as raw HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tooltip for a memory node. Records show a content preview plus kind/tier and
// key identity fields; hubs show the dimension and member count.
function memoryNodeTooltip(
  node: RenderNode,
  theme: ReturnType<typeof currentTheme>,
): string {
  const shell = (inner: string) => `
    <div style="
      background: ${theme.tokens.surfaceRaised};
      border: 1px solid ${theme.tokens.border};
      border-radius: 8px;
      padding: 8px 12px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5);
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      backdrop-filter: blur(12px);
      max-width: 320px;
    ">${inner}</div>`;

  const header = (title: string) => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${node.color};"></span>
      <span style="font-weight:700; color:${theme.tokens.textPrimary}; font-size:13px;">${title}</span>
    </div>`;

  const chip = (label: string, value: string) => `
    <div style="font-size:11px; color:${theme.tokens.textSecondary}; margin-bottom:3px;">
      <span style="font-weight:500;">${label}:</span>
      <span style="font-family:monospace; background:${theme.tokens.surface}; padding:1px 4px; border-radius:4px; color:${theme.tokens.accent};">${value}</span>
    </div>`;

  if (node.memoryKind && node.memoryKind !== "record") {
    return shell(
      header(escapeHtml(node.label)) +
        chip("Hub", escapeHtml(node.memoryKind)) +
        chip("Members", String(node.memberCount ?? 0)),
    );
  }

  const record = node.record;
  const content = record ? escapeHtml(record.content.replace(/\s+/g, " ").trim()) : "";
  const preview = content.length > 200 ? `${content.slice(0, 197)}...` : content;
  const parts = [header("Memory record")];
  parts.push(`
    <div style="font-size:12px; color:${theme.tokens.textPrimary}; line-height:1.4; margin-bottom:6px; border-top:1px solid ${theme.tokens.border}; padding-top:6px;">${preview}</div>`);
  if (record?.kind) parts.push(chip("Kind", escapeHtml(record.kind)));
  if (record?.tier) parts.push(chip("Tier", escapeHtml(record.tier)));
  if (record?.category) parts.push(chip("Category", escapeHtml(record.category)));
  if (record?.superseded) parts.push(chip("Status", "superseded"));
  return shell(parts.join(""));
}
