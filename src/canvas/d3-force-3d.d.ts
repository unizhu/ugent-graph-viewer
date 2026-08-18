/**
 * Minimal ambient types for `d3-force-3d`, which ships no declarations and has
 * no `@types` package (checked: registry 404).
 *
 * Deliberately narrow: only the surface `layout.ts` actually calls, with the
 * signatures read from the installed source
 * (`d3-force-3d@3.0.6/src/{simulation,link,manyBody,center}.js`). A blanket
 * `declare module "d3-force-3d"` would type the whole library as `any` and
 * silently accept a misspelled force or a wrong argument order.
 */
declare module "d3-force-3d" {
  /** A node the simulation reads from and writes coordinates back onto. */
  interface ForceNode {
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  interface Force {
    (alpha: number): void;
  }

  interface LinkForce extends Force {
    /** Maps a node to the value link endpoints are matched against. */
    id<N>(accessor: (node: N) => unknown): LinkForce;
    distance(value: number | ((link: unknown) => number)): LinkForce;
    strength(value: number | ((link: unknown) => number)): LinkForce;
  }

  interface ManyBodyForce extends Force {
    strength(value: number | ((node: unknown) => number)): ManyBodyForce;
    distanceMax(value: number): ManyBodyForce;
    theta(value: number): ManyBodyForce;
  }

  interface CenterForce extends Force {
    strength(value: number): CenterForce;
  }

  interface Simulation<N> {
    /** Advance one step. Safe to call after `stop()`; that is the manual mode. */
    tick(iterations?: number): Simulation<N>;
    /** Halt the internal timer started on construction. */
    stop(): Simulation<N>;
    restart(): Simulation<N>;
    nodes(): N[];
    nodes(nodes: N[]): Simulation<N>;
    force(name: string, force: Force | null): Simulation<N>;
    numDimensions(dimensions: number): Simulation<N>;
    alphaDecay(value: number): Simulation<N>;
    velocityDecay(value: number): Simulation<N>;
  }

  /** `numDimensions` defaults to 2 and is clamped to [1, 3]; pass 3 for 3D. */
  export function forceSimulation<N extends ForceNode>(
    nodes: N[],
    numDimensions?: number,
  ): Simulation<N>;

  export function forceLink<L>(links: L[]): LinkForce;
  export function forceManyBody(): ManyBodyForce;
  export function forceCenter(x?: number, y?: number, z?: number): CenterForce;
}
