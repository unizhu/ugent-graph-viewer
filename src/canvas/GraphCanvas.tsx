import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import ForceGraph3D from "react-force-graph-3d";
import ForceGraph2D from "react-force-graph-2d";
import Graph from "graphology";
import type { FilterState } from "../types";
import { currentTheme } from "../theme/theme";
import { buildGraphData, nodeSize, type RenderLink, type RenderNode } from "./graph-data";
import type { OrbitSettings, RenderMode } from "./render-settings";

// Above these counts the 3D path sheds geometry (arrow cones off, lower sphere
// resolution) to keep large graphs interactive. 2D has no such geometry cost.
const ARROWS_OFF_ABOVE_LINKS = 2500;
const LOW_RES_ABOVE_NODES = 2000;

interface GraphCanvasProps {
  graph: Graph;
  filters: FilterState;
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
}

const DIM_NODE = "rgba(107, 114, 128, 0.15)";
const DIM_LINK = "rgba(55, 65, 81, 0.05)";

export function GraphCanvas({
  graph,
  filters,
  onNodeClick,
  selectedNodeId,
  focusNodeId,
  onFocusHandled,
  revealLimit,
  mode,
  orbit,
}: GraphCanvasProps) {
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
    () => buildGraphData(graph, filters, revealLimit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      graph,
      revealLimit,
      filters.aggregateMode,
      filters.codebaseId,
      filters.searchQuery,
      filters.searchRegex,
      filters.nodeKinds,
      filters.edgeRelations,
      filters.selectedCommunities,
    ],
  );

  // Hover highlights the node's first-hop neighbors and links.
  const handleNodeHover = useCallback(
    (node: RenderNode | null) => {
      if (node === hoveredNode) return;
      if (!node) {
        setHighlightNodes(new Set());
        setHighlightLinks(new Set());
        setHoveredNode(null);
        return;
      }

      const nextNodes = new Set<string>([node.id]);
      const nextLinks = new Set<string>();

      if (filters.aggregateMode) {
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
    [graph, hoveredNode, filters.aggregateMode, graphData],
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
      if (highlightNodes.size > 0) {
        return highlightLinks.has(link.id) ? baseWidth * 1.5 : 0.2;
      }
      return baseWidth;
    },
    [highlightNodes, highlightLinks],
  );

  const nodeLabel = useCallback(
    (node: RenderNode) => `
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
    `,
    [theme],
  );

  // Geometry shedding for large 3D graphs.
  const arrowsOn = graphData.links.length <= ARROWS_OFF_ABOVE_LINKS;
  const nodeRes = graphData.nodes.length > LOW_RES_ABOVE_NODES ? 4 : 6;

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
          nodeVal={(node: RenderNode) => nodeSize(node.degree)}
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
          nodeVal={(node: RenderNode) => nodeSize(node.degree)}
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
    </div>
  );
}
