import { useCallback, useEffect, useRef, useState } from "react";
import type { RenderGraphData, RenderNode } from "./graph-data";
import { layoutAsync, type LayoutHandle } from "./layout";
import { packGraph, type PackedGraph } from "./points-geometry";
import { PointsScene } from "./points-scene";
import type { OrbitSettings } from "./render-settings";

/**
 * React wrapper around {@link PointsScene}.
 *
 * The split is deliberate: everything per-frame (rendering, picking,
 * highlighting, camera) is imperative three.js inside `PointsScene`, and React
 * only decides when the scene exists and what data it holds. Routing hover
 * through React state was what made the previous renderer stall — a state
 * change per mouse move re-created the colour accessors, and the library then
 * re-evaluated them across every node and link.
 *
 * The one thing React still owns per hover is the tooltip, which is a single
 * absolutely-positioned div rather than N objects, so it costs the same at 100
 * nodes and 26k.
 */

interface PointsCanvasProps {
  data: RenderGraphData;
  onNodeClick: (nodeId: string) => void;
  selectedNodeId: string | null;
  focusNodeId?: string | null;
  onFocusHandled?: () => void;
  orbit: OrbitSettings;
  showStats?: boolean;
  /** Tooltip HTML for a node, reusing the mesh renderer's markup. */
  nodeLabel: (node: RenderNode) => string;
  /** Draw per-kind silhouettes instead of a uniform sphere. */
  nodeShapes: boolean;
}

interface HoverState {
  node: RenderNode;
  x: number;
  y: number;
}

export function PointsCanvas({
  data,
  onNodeClick,
  selectedNodeId,
  focusNodeId,
  onFocusHandled,
  orbit,
  showStats = false,
  nodeLabel,
  nodeShapes,
}: PointsCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PointsScene | null>(null);
  const packedRef = useRef<PackedGraph | null>(null);
  const layoutRef = useRef<LayoutHandle | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [stats, setStats] = useState<{ calls: number; triangles: number; fps: number } | null>(
    null,
  );

  // Latest values for the imperative callbacks, which are installed once when
  // the scene is created and must not capture a stale render's props.
  const latest = useRef({ data, onNodeClick, nodeLabel });
  latest.current = { data, onNodeClick, nodeLabel };

  const pointerRef = useRef({ x: 0, y: 0 });
  const trackPointer = useCallback((event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  // Scene lifetime: created once for this mount, torn down on unmount. The
  // graph itself is swapped separately so changing filters does not rebuild
  // the renderer, the camera or the WebGL context.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new PointsScene(container, {
      onHover: (index) => {
        const packed = packedRef.current;
        if (!packed || index < 0) {
          setHover(null);
          scene.setHighlight(-1);
          return;
        }
        const node = latest.current.data.nodes[index];
        if (!node) return;
        setHover({ node, x: pointerRef.current.x, y: pointerRef.current.y });
        scene.setHighlight(index);
      },
      onClick: (index) => {
        const packed = packedRef.current;
        if (!packed) return;
        const id = packed.ids[index];
        if (id) {
          scene.focusOn(index);
          latest.current.onNodeClick(id);
        }
      },
    });
    sceneRef.current = scene;
    scene.start();

    const observer = new ResizeObserver(() => scene.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      layoutRef.current?.cancel();
      layoutRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Graph swap: repack, hand to the scene, and lay out. Cancelling the previous
  // layout matters because filter changes can arrive faster than a large graph
  // settles, and two workers writing the same buffers would fight.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    layoutRef.current?.cancel();
    setHover(null);

    const packed = packGraph(data);
    packedRef.current = packed;
    scene.setGraph(packed);

    let fitted = false;
    layoutRef.current = layoutAsync(
      { nodeCount: packed.ids.length, links: packed.linkPairs },
      (positions, done) => {
        scene.setPositions(positions);
        // Frame on the first positions rather than only at the end, so the
        // graph is visible while it settles instead of appearing at the end.
        if (!fitted) {
          scene.fitCamera();
          fitted = true;
        }
        if (done) scene.fitCamera();
      },
    );

    return () => {
      layoutRef.current?.cancel();
      layoutRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    sceneRef.current?.setOrbitEnabled(orbit.enabled);
  }, [orbit.enabled]);

  // A uniform change only, so it needs no geometry rebuild.
  useEffect(() => {
    sceneRef.current?.setShapesEnabled(nodeShapes);
  }, [nodeShapes]);

  // Deep-link / handoff focus: fly once the node has a position.
  useEffect(() => {
    if (!focusNodeId) return;
    const scene = sceneRef.current;
    const packed = packedRef.current;
    if (!scene || !packed) return;
    const index = packed.indexById.get(focusNodeId);
    if (index !== undefined) {
      scene.focusOn(index);
      onNodeClick(focusNodeId);
    }
    onFocusHandled?.();
  }, [focusNodeId, onFocusHandled, onNodeClick]);

  // Selection is shown the same way as hover: a highlight of that node's
  // neighbourhood, so clicking leaves the context visible after the cursor
  // moves away.
  useEffect(() => {
    const scene = sceneRef.current;
    const packed = packedRef.current;
    if (!scene || !packed || !selectedNodeId) return;
    const index = packed.indexById.get(selectedNodeId);
    if (index !== undefined) scene.setHighlight(index);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!showStats) {
      setStats(null);
      return;
    }
    let frames = 0;
    let raf = requestAnimationFrame(function tick() {
      frames += 1;
      raf = requestAnimationFrame(tick);
    });
    const sample = window.setInterval(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      const { calls, triangles } = scene.stats();
      setStats({ calls, triangles, fps: frames });
      frames = 0;
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(sample);
    };
  }, [showStats]);

  return (
    <div ref={containerRef} className="w-full h-full relative" onPointerMove={trackPointer}>
      {hover && (
        <div
          className="absolute z-10 pointer-events-none"
          // Offset from the cursor so the tooltip never sits under it and
          // steals the next pick.
          style={{ left: hover.x + 14, top: hover.y + 14 }}
          dangerouslySetInnerHTML={{ __html: nodeLabel(hover.node) }}
        />
      )}
      {stats && (
        <div
          className="absolute top-2 right-2 px-2 py-1 rounded-md font-mono text-[10px] leading-tight pointer-events-none"
          style={{
            background: "var(--gv-surface-raised)",
            border: "1px solid var(--gv-border)",
            color: "var(--gv-text-secondary)",
          }}
        >
          <div>{stats.calls.toLocaleString()} draw calls</div>
          <div>{stats.triangles.toLocaleString()} tris</div>
          <div>
            {stats.fps} fps &middot; {data.nodes.length.toLocaleString()}n{" "}
            {data.links.length.toLocaleString()}e
          </div>
        </div>
      )}
    </div>
  );
}
