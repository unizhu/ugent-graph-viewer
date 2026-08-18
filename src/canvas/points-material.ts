import { ShaderMaterial, Vector3 } from "three";

/**
 * Materials for the single-draw-call node cloud.
 *
 * Nodes are GL points, not meshes, so their appearance is entirely shader
 * work. Two materials share one vertex shader:
 *
 * - the display material shades each point as a lit sphere (an "impostor"),
 *   which is round at every zoom level and costs one quad per node. The mesh
 *   renderer it replaces drew resolution-4 spheres on large graphs -- visibly
 *   faceted -- so this is a better look as well as a cheaper one.
 * - the picking material writes an encoded node index instead of a colour,
 *   for exact hover detection (see `points-geometry.encodePickColor`).
 *
 * Both must size points identically or picking would disagree with what the
 * user sees, which is why the vertex shader is shared verbatim.
 */

/**
 * Upper bound on point size in pixels.
 *
 * `gl_PointSize` has an implementation-defined maximum and drivers differ in
 * whether they clamp or drop the point entirely; a node the camera is inside
 * would otherwise vanish rather than fill the screen.
 */
const MAX_POINT_PIXELS = 512;

const VERTEX_SHADER = /* glsl */ `
  attribute float size;
  attribute vec3 nodeColor;
  attribute float shape;

  // Pixels per world unit at one unit of depth. Folds viewport height, vertical
  // FOV and device pixel ratio into one value so the shader stays division-free
  // apart from the perspective divide.
  uniform float pixelsPerUnit;
  uniform float sizeScale;

  uniform float shapesEnabled;

  varying vec3 vColor;
  varying float vShape;

  void main() {
    vColor = nodeColor;
    vShape = shapesEnabled > 0.5 ? shape : 0.0;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // -mvPosition.z is depth in front of the camera. Guarded because a point
    // exactly on the camera plane would divide by zero and produce a NaN size,
    // which drivers render as a full-screen quad.
    float depth = max(-mvPosition.z, 0.0001);
    gl_PointSize = min(size * sizeScale * pixelsPerUnit / depth, ${MAX_POINT_PIXELS}.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Sphere impostor.
 *
 * `gl_PointCoord` gives position within the point sprite; treating it as a
 * unit disc yields a hemisphere normal, so a flat quad shades as a ball.
 * Fragments outside the disc are discarded, which is what makes the node round
 * rather than square. Depth is left at the sprite's centre depth rather than
 * written per fragment: `gl_FragDepth` would be more correct where nodes
 * interpenetrate, but it disables early-Z on most hardware, and this renderer
 * exists to be fast.
 */
/**
 * Signed distance to each silhouette's edge, negative inside.
 *
 * Shapes are computed rather than sampled from a texture atlas: no asset to
 * load or keep in sync, resolution-independent at every zoom, and still one
 * draw call. Indices must match `points-geometry.NODE_SHAPE`.
 */
const SHAPE_SDF = /* glsl */ `
  float shapeDistance(vec2 p, float shape) {
    if (shape < 0.5) {
      return length(p) - 1.0;                       // sphere
    } else if (shape < 1.5) {
      vec2 d = abs(p) - vec2(0.72);                 // rounded square
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.18;
    } else if (shape < 2.5) {
      return (abs(p.x) + abs(p.y)) - 1.0;           // diamond
    } else if (shape < 3.5) {
      // Triangle: half-plane intersection, nudged down so its visual centre
      // sits where the other shapes' centres do.
      vec2 q = vec2(p.x, p.y + 0.22);
      return max(abs(q.x) * 0.866 + q.y * 0.5, -q.y) - 0.55;
    }
    // Hexagon.
    vec2 a = abs(p);
    return max(a.x * 0.866 + a.y * 0.5, a.y) - 0.9;
  }
`;

const DISPLAY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 lightDirection;
  uniform float ambient;
  uniform float opacity;

  varying vec3 vColor;
  varying float vShape;

  ${SHAPE_SDF}

  void main() {
    vec2 fromCenter = gl_PointCoord * 2.0 - 1.0;
    float radiusSq = dot(fromCenter, fromCenter);
    if (shapeDistance(fromCenter, vShape) > 0.0) discard;
    // Clamped so a corner of an angular shape, which lies outside the unit
    // circle, still yields a real normal instead of a NaN from sqrt().
    radiusSq = min(radiusSq, 1.0);

    // Hemisphere normal. gl_PointCoord's y runs downward, hence the negation.
    float z = sqrt(1.0 - radiusSq);
    vec3 normal = vec3(fromCenter.x, -fromCenter.y, z);

    float diffuse = max(dot(normal, normalize(lightDirection)), 0.0);
    // A little rim light keeps dark nodes legible against a dark background,
    // which the flat-shaded mesh renderer struggled with.
    float rim = pow(1.0 - z, 2.0) * 0.25;
    vec3 shaded = vColor * (ambient + (1.0 - ambient) * diffuse) + rim;

    gl_FragColor = vec4(shaded, opacity);
  }
`;

/**
 * Picking. Emits the vertex colour unmodified so it can be read back as an
 * integer id: no lighting, no anti-aliasing, and the same disc cutout as the
 * display material so the clickable area matches the drawn one exactly.
 */
const PICKING_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vShape;

  ${SHAPE_SDF}

  void main() {
    // Same silhouette test as the display shader, so the clickable area is
    // exactly the drawn area — a corner of a diamond is hoverable, and the
    // empty space beside it is not.
    if (shapeDistance(gl_PointCoord * 2.0 - 1.0, vShape) > 0.0) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

export interface PointsMaterials {
  display: ShaderMaterial;
  picking: ShaderMaterial;
  /** Update both materials after a resize or camera FOV change. */
  setPixelsPerUnit(value: number): void;
  /** Draw per-kind silhouettes (true) or a uniform sphere for every node. */
  setShapesEnabled(enabled: boolean): void;
  dispose(): void;
}

/**
 * Pixels per world unit at unit depth, for the perspective point-size formula.
 *
 * Derived from the standard projection: a world-space length L at depth d
 * covers `L * (height / (2 * tan(fov / 2))) / d` pixels. Device pixel ratio is
 * folded in because `gl_PointSize` is in framebuffer pixels, not CSS pixels --
 * omitting it makes every node half-size on a retina display.
 */
export function pixelsPerUnitFor(
  viewportHeightPx: number,
  verticalFovDegrees: number,
  pixelRatio: number,
): number {
  const fovRadians = (verticalFovDegrees * Math.PI) / 180;
  return (viewportHeightPx * pixelRatio) / (2 * Math.tan(fovRadians / 2));
}

export function createPointsMaterials(options?: {
  /** Multiplies every node's size; 1 matches the mesh renderer's scale. */
  sizeScale?: number;
  opacity?: number;
  /** Default true; false draws every node as a sphere. */
  shapesEnabled?: boolean;
}): PointsMaterials {
  const sizeScale = options?.sizeScale ?? 1;
  const opacity = options?.opacity ?? 1;

  const shared = () => ({
    pixelsPerUnit: { value: 1 },
    sizeScale: { value: sizeScale },
    // Display and picking must agree: if one draws silhouettes and the other
    // discs, the hoverable area stops matching the drawn one.
    shapesEnabled: { value: options?.shapesEnabled === false ? 0 : 1 },
  });

  const display = new ShaderMaterial({
    uniforms: {
      ...shared(),
      // Light fixed in view space, so the graph stays evenly lit as the camera
      // orbits instead of half of it falling dark.
      lightDirection: { value: new Vector3(0.4, 0.6, 1).normalize() },
      ambient: { value: 0.45 },
      opacity: { value: opacity },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: DISPLAY_FRAGMENT_SHADER,
    transparent: opacity < 1,
  });

  const picking = new ShaderMaterial({
    uniforms: shared(),
    vertexShader: VERTEX_SHADER,
    fragmentShader: PICKING_FRAGMENT_SHADER,
  });

  return {
    display,
    picking,
    setPixelsPerUnit(value: number) {
      display.uniforms.pixelsPerUnit.value = value;
      picking.uniforms.pixelsPerUnit.value = value;
    },
    setShapesEnabled(enabled: boolean) {
      const value = enabled ? 1 : 0;
      display.uniforms.shapesEnabled.value = value;
      picking.uniforms.shapesEnabled.value = value;
    },
    dispose() {
      display.dispose();
      picking.dispose();
    },
  };
}
