import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import ForceGraph3D from "react-force-graph-3d";
import Graph from "graphology";
import type { FilterState, NodeKind } from "../types";
import { nodeKindColor, edgeRelationColor, currentTheme } from "../theme/theme";

interface ForceGraph3DProps {
  graph: Graph;
  filters: FilterState;
  onNodeClick: (nodeId: string) => void;
  selectedNodeId: string | null;
  /** Deep-link / handoff focus target; the camera flies to it once (R13). */
  focusNodeId?: string | null;
  /** Called after a focus request has been handled so it fires only once. */
  onFocusHandled?: () => void;
  /**
   * Progressive loading cap (R18). When set, only the top-`revealLimit`
   * nodes by degree are rendered; the parent ramps this up so large graphs
   * appear incrementally into the same ForceGraph3D instance rather than
   * blocking on the full set. `undefined`/`Infinity` renders everything.
   */
  revealLimit?: number;
}

/**
 * Check if a node should be hidden based on filter state.
 */
function shouldHideNode(filters: FilterState, data: {
  label: string;
  kind: string;
  codebaseId: string;
  filePath: string;
  degree: number;
  communityId: number | null;
}): boolean {
  if (filters.codebaseId && data.codebaseId !== filters.codebaseId) {
    return true;
  }
  if (filters.nodeKinds.size > 0 && !filters.nodeKinds.has(data.kind as NodeKind)) {
    return true;
  }
  if (
    filters.selectedCommunities.size > 0 &&
    data.communityId != null &&
    !filters.selectedCommunities.has(data.communityId)
  ) {
    return true;
  }
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    if (
      !data.label.toLowerCase().includes(q) &&
      !(data.filePath || "").toLowerCase().includes(q)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Cap a built {nodes, links} set to the top-`limit` nodes by degree,
 * dropping links whose endpoints fall outside the kept set. Used for
 * progressive loading (R18): the highest-degree nodes are the structural
 * backbone, so revealing them first keeps early frames meaningful.
 */
function capByDegree(
  data: { nodes: any[]; links: any[] },
  limit: number,
): { nodes: any[]; links: any[] } {
  if (!Number.isFinite(limit) || data.nodes.length <= limit) return data;
  const kept = [...data.nodes]
    .sort((a, b) => (b.degree || 0) - (a.degree || 0))
    .slice(0, limit);
  const keptIds = new Set(kept.map((n) => n.id));
  const links = data.links.filter((l) => {
    const src = typeof l.source === "object" ? l.source.id : l.source;
    const tgt = typeof l.target === "object" ? l.target.id : l.target;
    return keptIds.has(src) && keptIds.has(tgt);
  });
  return { nodes: kept, links };
}

/**
 * Build node and link arrays at the symbol level (default mode).
 */
function buildSymbolGraphData(graph: Graph, filters: FilterState) {
  const nodes: any[] = [];
  const nodeMap = new Map<string, any>();

  graph.forEachNode((nodeId, attrs) => {
    const isHidden = shouldHideNode(filters, {
      label: attrs.label || nodeId,
      kind: attrs.kind,
      codebaseId: attrs.codebaseId,
      filePath: attrs.filePath,
      degree: attrs.degree || 0,
      communityId: attrs.communityId,
    });
    if (isHidden) return;

    const color = attrs.color || nodeKindColor(attrs.kind as NodeKind);
    const nodeObj = {
      id: nodeId,
      label: attrs.label || nodeId,
      kind: attrs.kind,
      codebaseId: attrs.codebaseId,
      filePath: attrs.filePath,
      degree: attrs.degree || 0,
      color: color,
      communityId: attrs.communityId,
    };
    nodes.push(nodeObj);
    nodeMap.set(nodeId, nodeObj);
  });

  const links: any[] = [];
  graph.forEachEdge((edgeId, attrs, source, target) => {
    if (!nodeMap.has(source) || !nodeMap.has(target)) return;
    if (filters.edgeRelations.size > 0 && !filters.edgeRelations.has(attrs.relation)) return;
    links.push({
      id: edgeId,
      source: source,
      target: target,
      relation: attrs.relation,
      confidence: attrs.confidence ?? 0.5,
      color: edgeRelationColor(attrs.relation),
    });
  });

  return { nodes, links };
}

/**
 * Build a file-level macro view: collapse symbol-level nodes onto their parent
 * file node (keyed by codebaseId::filePath) and dedupe edges by
 * (source_file, target_file, relation). Edges where source and target share
 * the same file are dropped (intra-file noise).
 */
function buildAggregatedGraphData(graph: Graph, filters: FilterState) {
  const fileKey = (codebaseId: string, filePath: string) =>
    `${codebaseId || ""}::${filePath || ""}`;

  // Build a map of file-key -> aggregated node, summing degrees of children.
  const fileNodes = new Map<string, any>();
  // Map from any visible original node id -> its file-key, used during edge
  // collapsing.
  const idToFileKey = new Map<string, string>();

  graph.forEachNode((nodeId, attrs) => {
    const isHidden = shouldHideNode(filters, {
      label: attrs.label || nodeId,
      kind: attrs.kind,
      codebaseId: attrs.codebaseId,
      filePath: attrs.filePath,
      degree: attrs.degree || 0,
      communityId: attrs.communityId,
    });
    if (isHidden) return;
    const filePath: string = attrs.filePath || "";
    if (!filePath) return;
    const codebaseId: string = attrs.codebaseId || "";
    const key = fileKey(codebaseId, filePath);
    idToFileKey.set(nodeId, key);

    const existing = fileNodes.get(key);
    if (existing) {
      existing.degree += attrs.degree || 0;
      existing.childCount += 1;
    } else {
      const fileLabel = filePath.split("/").pop() || filePath;
      fileNodes.set(key, {
        id: key,
        label: fileLabel,
        kind: "file",
        codebaseId,
        filePath,
        degree: attrs.degree || 0,
        color: nodeKindColor("file"),
        communityId: attrs.communityId,
        childCount: 1,
      });
    }
  });

  const links: any[] = [];
  const seenEdge = new Set<string>();
  graph.forEachEdge((_edgeId, attrs, source, target) => {
    const srcKey = idToFileKey.get(source);
    const tgtKey = idToFileKey.get(target);
    if (!srcKey || !tgtKey) return;
    if (srcKey === tgtKey) return;
    if (filters.edgeRelations.size > 0 && !filters.edgeRelations.has(attrs.relation)) return;

    const dedupeKey = `${srcKey}|${tgtKey}|${attrs.relation}`;
    if (seenEdge.has(dedupeKey)) return;
    seenEdge.add(dedupeKey);

    links.push({
      id: dedupeKey,
      source: srcKey,
      target: tgtKey,
      relation: attrs.relation,
      confidence: attrs.confidence ?? 0.5,
      color: edgeRelationColor(attrs.relation),
    });
  });

  return { nodes: Array.from(fileNodes.values()), links };
}

export function ForceGraph3DCanvas({ graph, filters, onNodeClick, selectedNodeId, focusNodeId, onFocusHandled, revealLimit }: ForceGraph3DProps) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [hoveredNode, setHoveredNode] = useState<any | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [userInteracted, setUserInteracted] = useState(false);
  const interactionTimeoutRef = useRef<any>(null);

  // ResizeObserver to dynamically track container size (accounting for the 288px sidebar)
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    setDimensions({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Handle manual user camera drag/pan/zoom to pause auto-orbit for 15s
  const handleUserInteraction = useCallback(() => {
    setUserInteracted(true);
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    interactionTimeoutRef.current = setTimeout(() => {
      setUserInteracted(false);
    }, 15000); // Resume auto-orbit after 15s of idle time
  }, []);

  useEffect(() => {
    return () => {
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }
    };
  }, []);

  // Convert Graphology structure to react-force-graph-3d nodes/links format.
  // A finite revealLimit caps the rendered set for progressive loading (R18).
  const graphData = useMemo(() => {
    const full = filters.aggregateMode
      ? buildAggregatedGraphData(graph, filters)
      : buildSymbolGraphData(graph, filters);
    if (revealLimit === undefined || !Number.isFinite(revealLimit)) return full;
    return capByDegree(full, revealLimit);
  }, [graph, filters, revealLimit]);

  // Handle node hover to highlight first-hop neighbors and links
  const handleNodeHover = useCallback((node: any) => {
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
      // node.id is a synthetic file-key not present in the underlying graphology
      // graph, so highlight first-hop neighbors via the rendered links instead.
      for (const link of graphData.links) {
        const src = typeof link.source === "object" ? link.source.id : link.source;
        const tgt = typeof link.target === "object" ? link.target.id : link.target;
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
  }, [graph, hoveredNode, filters.aggregateMode, graphData]);

  // Zoom-to-focus on clicked node
  const handleNodeClick = useCallback((node: any) => {
    if (!node) return;

    // Smooth fly-to camera translation
    const distance = 80;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);

    fgRef.current?.cameraPosition(
      { 
        x: (node.x || 0) * distRatio, 
        y: (node.y || 0) * distRatio, 
        z: (node.z || 0) * distRatio 
      },
      node, // lookAt target
      1500  // transition duration in ms
    );

    onNodeClick(node.id);
  }, [onNodeClick]);

  // Deep-link / handoff focus (R13): when a focusNodeId is provided, fly the
  // camera to that node once the force layout has settled enough to give it
  // coordinates, select it, then clear the request so it fires only once.
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
      const positioned = node && (node.x !== undefined || node.z !== undefined);
      if (positioned) {
        const distance = 80;
        const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
        fgRef.current?.cameraPosition(
          { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
          node,
          1500,
        );
        onNodeClick(node.id);
        onFocusHandled?.();
        return;
      }
      // The layout may not have positioned nodes yet; retry briefly, then
      // give up (unknown id or filtered-out node) without erroring.
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
  }, [focusNodeId, onNodeClick, onFocusHandled]);

  // Auto-orbit camera when user is idle, recovering smoothly from user interactions
  useEffect(() => {
    if (!fgRef.current) return;
    
    let angle = 0;
    let initialized = false;

    const interval = setInterval(() => {
      if (hoveredNode || selectedNodeId || userInteracted) {
        initialized = false; // Reset to recalculate angle when idle resumes
        return; 
      }
      
      if (!initialized) {
        const currentPos = fgRef.current.cameraPosition();
        if (currentPos) {
          angle = Math.atan2(currentPos.x, currentPos.z);
          initialized = true;
        }
      }
      
      angle += 0.001;
      const distance = 350;
      
      fgRef.current.cameraPosition({
        x: distance * Math.sin(angle),
        z: distance * Math.cos(angle),
      });
    }, 25);

    return () => clearInterval(interval);
  }, [hoveredNode, selectedNodeId, userInteracted]);

  // Theme-derived canvas chrome. The graph loads after the handoff has
  // applied the theme, so reading the active tokens at render is correct.
  const theme = currentTheme();
  const canvasBg =
    theme.theme === "light"
      ? `radial-gradient(circle, ${theme.tokens.surface} 0%, ${theme.tokens.background} 100%)`
      : `radial-gradient(circle, ${theme.tokens.surfaceRaised} 0%, ${theme.tokens.background} 100%)`;

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative"
      style={{
        background: canvasBg,
      }}
      onMouseDown={handleUserInteraction}
      onTouchStart={handleUserInteraction}
      onPointerDown={handleUserInteraction}
      onWheel={handleUserInteraction}
    >
      {dimensions.width > 0 && dimensions.height > 0 && (
        <ForceGraph3D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          backgroundColor="rgba(0, 0, 0, 0)" // Let container gradient show through
          
          // Node styling
          nodeColor={node => {
            if (highlightNodes.size > 0) {
              return highlightNodes.has(node.id) ? node.color : "rgba(107, 114, 128, 0.15)";
            }
            return node.color;
          }}
          nodeVal={node => Math.min(18, 2 + Math.log2(node.degree + 1) * 3)}
          nodeResolution={6} // Lower resolution = faster WebGL performance
          
          // HTML tooltips, themed from the active token set so they match
          // the console's light/dark choice.
          nodeLabel={node => `
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
              ${node.filePath ? `
                <div style="font-size: 10px; color: ${theme.tokens.textSecondary}; font-family: monospace; word-break: break-all; border-top: 1px solid ${theme.tokens.border}; padding-top: 4px; margin-top: 4px;">
                  ${node.filePath}
                </div>
              ` : ""}
            </div>
          `}
          
          // Link styling
          linkColor={link => {
            if (highlightNodes.size > 0) {
              return highlightLinks.has(link.id) ? link.color : "rgba(55, 65, 81, 0.05)";
            }
            return link.color;
          }}
          linkWidth={link => {
            const baseWidth = Math.max(0.5, link.confidence * 1.5);
            if (highlightNodes.size > 0) {
              return highlightLinks.has(link.id) ? baseWidth * 1.5 : 0.2;
            }
            return baseWidth;
          }}
          
          // Directional arrows for relationship flow
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1} // Arrows at target end
          linkDirectionalArrowColor={link => {
            if (highlightNodes.size > 0) {
              return highlightLinks.has(link.id) ? link.color : "rgba(55, 65, 81, 0.05)";
            }
            return link.color;
          }}
          
          // Interaction callbacks
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          
          // Performance optimizations
          warmupTicks={120}  // Pre-calculate positions off-screen to avoid initial layout lag
          cooldownTicks={0}  // Stop layout calculation immediately once rendered
        />
      )}
    </div>
  );
}
