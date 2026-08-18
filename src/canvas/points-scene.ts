import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  decodePickColor,
  packPickColors,
  writeLinkPositions,
  type PackedGraph,
} from "./points-geometry";
import { createPointsMaterials, pixelsPerUnitFor, type PointsMaterials } from "./points-material";

/**
 * The whole graph as two draw calls: one `Points` for every node, one
 * `LineSegments` for every link.
 *
 * Replaces `react-force-graph-3d`, which built one `Mesh` per node and one
 * `Mesh` or `Line` per link with no instancing, so a 10k-node workspace issued
 * ~30k draw calls against a desktop budget of a few thousand.
 *
 * Framework-free on purpose: React owns when this exists and what data it
 * holds, nothing more. Everything here is imperative three.js driven by an
 * animation loop, because per-frame work must not go through a reconciler.
 */

const FOV_DEGREES = 60;
const NEAR = 0.1;
const FAR = 100_000;

/** How much a highlighted node/link brightens. */
const HIGHLIGHT_BOOST = 0.55;

/** Radians per second of auto-orbit. */
const ORBIT_RADIANS_PER_SECOND = 0.08;

/** Camera distance as a multiple of the graph's bounding radius. */
const FIT_DISTANCE_FACTOR = 2.2;

export interface PointsSceneStats {
  calls: number;
  triangles: number;
}

export interface PointsSceneOptions {
  /** Called with the node index under the cursor, or -1, after each pick. */
  onHover?: (nodeIndex: number) => void;
  onClick?: (nodeIndex: number) => void;
}

export class PointsScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly pickScene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly materials: PointsMaterials;
  private readonly linkMaterial: LineBasicMaterial;
  private readonly pickTarget = new WebGLRenderTarget(1, 1);
  private readonly pickBuffer = new Uint8Array(4);

  private packed: PackedGraph | null = null;
  private nodePositions: Float32Array = new Float32Array(0);
  private baseNodeColors: Float32Array = new Float32Array(0);
  private baseLinkColors: Float32Array = new Float32Array(0);

  private positionAttr: BufferAttribute | null = null;
  private nodeColorAttr: BufferAttribute | null = null;
  private linkPositionAttr: BufferAttribute | null = null;
  private linkColorAttr: BufferAttribute | null = null;
  private points: Points | null = null;
  private pickPoints: Points | null = null;
  private lines: LineSegments | null = null;

  /** Adjacency, built lazily on first hover: node index -> incident links. */
  private adjacency: Map<number, number[]> | null = null;
  private highlighted: { nodes: number[]; links: number[] } | null = null;

  private orbitEnabled = false;
  private orbitPausedUntil = 0;
  private frame = 0;
  private running = false;
  private lastTime = 0;
  private pointerPx: { x: number; y: number } | null = null;
  private pickPending = false;
  private flight: { target: Vector3; from: Vector3; start: number; ms: number } | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: PointsSceneOptions = {},
  ) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.camera = new PerspectiveCamera(FOV_DEGREES, 1, NEAR, FAR);
    this.camera.position.set(0, 0, 500);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;

    this.materials = createPointsMaterials();
    // Unlit and vertex-coloured: links carry no shading in either renderer, and
    // a lit material here would cost a normal per vertex for no visual gain.
    this.linkMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 });

    this.resize();
    this.attachPointerHandlers();
  }

  /** Replace the graph. Safe to call repeatedly; previous buffers are freed. */
  setGraph(packed: PackedGraph): void {
    this.disposeGraphObjects();
    this.packed = packed;
    this.adjacency = null;
    this.highlighted = null;

    const nodeCount = packed.ids.length;
    this.nodePositions = new Float32Array(nodeCount * 3);
    this.baseNodeColors = packed.nodeColors;
    this.baseLinkColors = packed.linkColors;

    // Position and size are shared by the display and picking geometries: one
    // buffer, two views, so a position update cannot leave picking stale.
    this.positionAttr = new BufferAttribute(this.nodePositions, 3);
    this.positionAttr.setUsage(DynamicDrawUsage);
    const sizeAttr = new BufferAttribute(packed.nodeSizes, 1);
    const shapeAttr = new BufferAttribute(packed.nodeShapes, 1);

    const displayGeometry = new BufferGeometry();
    this.nodeColorAttr = new BufferAttribute(Float32Array.from(packed.nodeColors), 3);
    this.nodeColorAttr.setUsage(DynamicDrawUsage);
    displayGeometry.setAttribute("position", this.positionAttr);
    displayGeometry.setAttribute("size", sizeAttr);
    displayGeometry.setAttribute("shape", shapeAttr);
    displayGeometry.setAttribute("nodeColor", this.nodeColorAttr);
    // The bounding sphere three would compute is meaningless while the layout
    // is still moving, and a stale one frustum-culls the entire cloud away.
    displayGeometry.boundingSphere = null;
    this.points = new Points(displayGeometry, this.materials.display);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    const pickGeometry = new BufferGeometry();
    pickGeometry.setAttribute("position", this.positionAttr);
    pickGeometry.setAttribute("size", sizeAttr);
    pickGeometry.setAttribute("shape", shapeAttr);
    pickGeometry.setAttribute("nodeColor", new BufferAttribute(packPickColors(nodeCount), 3));
    this.pickPoints = new Points(pickGeometry, this.materials.picking);
    this.pickPoints.frustumCulled = false;
    this.pickScene.add(this.pickPoints);

    const linkGeometry = new BufferGeometry();
    this.linkPositionAttr = new BufferAttribute(new Float32Array(packed.linkPairs.length * 6), 3);
    this.linkPositionAttr.setUsage(DynamicDrawUsage);
    this.linkColorAttr = new BufferAttribute(Float32Array.from(packed.linkColors), 3);
    this.linkColorAttr.setUsage(DynamicDrawUsage);
    linkGeometry.setAttribute("position", this.linkPositionAttr);
    linkGeometry.setAttribute("color", this.linkColorAttr);
    linkGeometry.boundingSphere = null;
    this.lines = new LineSegments(linkGeometry, this.linkMaterial);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
  }

  /** Push new node positions; link endpoints follow automatically. */
  setPositions(positions: Float32Array): void {
    if (!this.packed || !this.positionAttr || !this.linkPositionAttr) return;
    this.nodePositions.set(positions.subarray(0, this.nodePositions.length));
    this.positionAttr.needsUpdate = true;
    writeLinkPositions(
      this.nodePositions,
      this.packed.linkPairs,
      this.linkPositionAttr.array as Float32Array,
    );
    this.linkPositionAttr.needsUpdate = true;
  }

  /** Frame the whole graph. Call once the layout has settled. */
  fitCamera(): void {
    const radius = this.boundingRadius();
    const distance = Math.max(radius * FIT_DISTANCE_FACTOR, 50);
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, 0, distance);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private boundingRadius(): number {
    let maxSq = 0;
    for (let i = 0; i < this.nodePositions.length; i += 3) {
      const x = this.nodePositions[i];
      const y = this.nodePositions[i + 1];
      const z = this.nodePositions[i + 2];
      const d = x * x + y * y + z * z;
      if (d > maxSq) maxSq = d;
    }
    return Math.sqrt(maxSq);
  }

  /**
   * Highlight a node and its first-hop neighbourhood, or clear with -1.
   *
   * Only the affected slots are rewritten, and the previous highlight is
   * restored from the base colours, so a hover costs O(degree) rather than the
   * O(N) accessor sweep the mesh renderer performed on every mouse move.
   *
   * Highlighting brightens instead of dimming everything else on purpose:
   * dimming is inherently O(N) and would reintroduce exactly the cost this
   * renderer exists to remove.
   */
  setHighlight(nodeIndex: number): void {
    if (!this.packed || !this.nodeColorAttr || !this.linkColorAttr) return;
    const nodeColors = this.nodeColorAttr.array as Float32Array;
    const linkColors = this.linkColorAttr.array as Float32Array;

    if (this.highlighted) {
      for (const n of this.highlighted.nodes) {
        nodeColors.set(this.baseNodeColors.subarray(n * 3, n * 3 + 3), n * 3);
      }
      for (const l of this.highlighted.links) {
        linkColors.set(this.baseLinkColors.subarray(l * 6, l * 6 + 6), l * 6);
      }
      this.highlighted = null;
      this.nodeColorAttr.needsUpdate = true;
      this.linkColorAttr.needsUpdate = true;
    }

    if (nodeIndex < 0 || nodeIndex >= this.packed.ids.length) return;

    const incident = this.adjacencyFor(nodeIndex);
    const nodes = new Set<number>([nodeIndex]);
    for (const l of incident) {
      const [s, t] = this.packed.linkPairs[l];
      nodes.add(s);
      nodes.add(t);
    }

    for (const n of nodes) brighten(nodeColors, n * 3, this.baseNodeColors, n * 3);
    for (const l of incident) {
      brighten(linkColors, l * 6, this.baseLinkColors, l * 6);
      brighten(linkColors, l * 6 + 3, this.baseLinkColors, l * 6 + 3);
    }

    this.highlighted = { nodes: [...nodes], links: incident };
    this.nodeColorAttr.needsUpdate = true;
    this.linkColorAttr.needsUpdate = true;
  }

  /**
   * Incident link indices for a node, building the adjacency index on first
   * use. Built lazily because a graph that is only ever looked at, never
   * hovered, should not pay to index every link.
   */
  private adjacencyFor(nodeIndex: number): number[] {
    if (!this.packed) return [];
    if (!this.adjacency) {
      this.adjacency = new Map();
      for (let i = 0; i < this.packed.linkPairs.length; i += 1) {
        const [s, t] = this.packed.linkPairs[i];
        pushInto(this.adjacency, s, i);
        pushInto(this.adjacency, t, i);
      }
    }
    return this.adjacency.get(nodeIndex) ?? [];
  }

  /** Fly the camera to a node index over `ms`. */
  focusOn(nodeIndex: number, ms = 1200): void {
    if (!this.packed || nodeIndex < 0) return;
    const i = nodeIndex * 3;
    this.flight = {
      from: this.controls.target.clone(),
      target: new Vector3(
        this.nodePositions[i],
        this.nodePositions[i + 1],
        this.nodePositions[i + 2],
      ),
      start: performance.now(),
      ms,
    };
  }

  setOrbitEnabled(enabled: boolean): void {
    this.orbitEnabled = enabled;
  }

  /** Per-kind silhouettes, or a uniform sphere for every node. */
  setShapesEnabled(enabled: boolean): void {
    this.materials.setShapesEnabled(enabled);
  }

  resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.materials.setPixelsPerUnit(
      pixelsPerUnitFor(height, FOV_DEGREES, this.renderer.getPixelRatio()),
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.frame = requestAnimationFrame(loop);
      this.tick();
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  stats(): PointsSceneStats {
    const info = this.renderer.info.render;
    return { calls: info.calls, triangles: info.triangles };
  }

  private tick(): void {
    const now = performance.now();
    const deltaSeconds = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (this.flight) {
      // Ease-out so the arrival is soft; the mesh renderer's cameraPosition
      // transition did the same, and a linear fly-to reads as a jump-cut.
      const t = Math.min((now - this.flight.start) / this.flight.ms, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.controls.target.lerpVectors(this.flight.from, this.flight.target, eased);
      if (t >= 1) this.flight = null;
    }

    if (this.orbitEnabled && now >= this.orbitPausedUntil && !this.flight) {
      // Continuous rotation rather than the old interval-stepped camera moves:
      // the loop is already running every frame, so smooth costs nothing extra.
      const angle = ORBIT_RADIANS_PER_SECOND * deltaSeconds;
      const offset = this.camera.position.clone().sub(this.controls.target);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = offset.x * cos - offset.z * sin;
      const z = offset.x * sin + offset.z * cos;
      this.camera.position.set(
        this.controls.target.x + x,
        this.camera.position.y,
        this.controls.target.z + z,
      );
    }

    this.controls.update();
    if (this.pickPending) {
      this.pickPending = false;
      this.options.onHover?.(this.pickAtPointer());
    }
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Read the node index under the cursor.
   *
   * Renders the picking scene into a 1x1 target using `setViewOffset` to
   * select just the cursor's pixel, so the cost is one pixel regardless of
   * graph size. A CPU alternative would have to project every node each move,
   * and would not agree with the shader about point size.
   */
  private pickAtPointer(): number {
    if (!this.pointerPx || !this.pickPoints) return -1;
    const { x, y } = this.pointerPx;
    const ratio = this.renderer.getPixelRatio();
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.camera.setViewOffset(
      width * ratio,
      height * ratio,
      Math.floor(x * ratio),
      Math.floor(y * ratio),
      1,
      1,
    );
    this.renderer.setRenderTarget(this.pickTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.pickScene, this.camera);
    this.renderer.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pickBuffer);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, 0);
    this.camera.clearViewOffset();

    return decodePickColor(this.pickBuffer[0], this.pickBuffer[1], this.pickBuffer[2]);
  }

  private attachPointerHandlers(): void {
    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerleave", this.onPointerLeave);
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerPx = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    // Coalesced to one pick per frame: pointermove fires far more often than
    // the display refreshes, and each pick is a GPU readback that stalls the
    // pipeline.
    this.pickPending = true;
    // Any manual camera interaction pauses auto-orbit, matching the previous
    // renderer's 15s grace period.
    if (event.buttons !== 0) this.orbitPausedUntil = performance.now() + 15_000;
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    this.orbitPausedUntil = performance.now() + 15_000;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerPx = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    // Pick immediately rather than deferring to the next frame: a click that
    // waited a frame could resolve against a camera the drag had already moved.
    this.pickPending = false;
    const index = this.pickAtPointer();
    if (index >= 0) this.options.onClick?.(index);
  };

  private readonly onPointerLeave = () => {
    this.pointerPx = null;
    this.options.onHover?.(-1);
  };

  private disposeGraphObjects(): void {
    for (const object of [this.points, this.pickPoints, this.lines]) {
      if (!object) continue;
      object.parent?.remove(object);
      object.geometry.dispose();
    }
    this.points = null;
    this.pickPoints = null;
    this.lines = null;
  }

  dispose(): void {
    this.stop();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    this.disposeGraphObjects();
    this.controls.dispose();
    this.materials.dispose();
    this.linkMaterial.dispose();
    this.pickTarget.dispose();
    this.renderer.dispose();
    el.remove();
  }
}

function pushInto(map: Map<number, number[]>, key: number, value: number): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

/** Write a brightened copy of `base[from]` into `target[at]`. */
const scratch = new Color();
function brighten(target: Float32Array, at: number, base: Float32Array, from: number): void {
  scratch.setRGB(base[from], base[from + 1], base[from + 2]);
  target[at] = Math.min(1, scratch.r + HIGHLIGHT_BOOST);
  target[at + 1] = Math.min(1, scratch.g + HIGHLIGHT_BOOST);
  target[at + 2] = Math.min(1, scratch.b + HIGHLIGHT_BOOST);
}
