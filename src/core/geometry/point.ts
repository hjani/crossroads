/**
 * Positions on the XZ ground and the distances between them.
 *
 * The base of the plane geometry the model is built on — `segment.ts` and
 * `arc.ts` are the two shapes a road runs in, and both measure with what is
 * here. None of it knows anything about the network: the inputs are
 * positions, so the same math serves a section that exists and one that is
 * only being drawn.
 */

/** A point on the XZ ground plane, in meters. */
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/**
 * How close two positions have to be to count as the same place, in meters.
 *
 * Step a centimeter aside while standing in an intersection and you are
 * still standing in the same intersection — at this scale the ground does
 * not distinguish the two positions, and neither does the editor. It is
 * what makes a road ending on another road a junction rather than a near
 * miss.
 */
export const SAME_POINT_METERS = 0.01;

export function distance(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/** The vector one meter long pointing from `from` toward `to`. */
export function unitDirection(from: Vec2, to: Vec2): Vec2 {
  const length = distance(from, to);
  return { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
}

/**
 * The angle `direction` points at, in radians from +x turning toward +z, in
 * −π..π. `direction` does not need to be a unit vector.
 */
export function angleOf(direction: Vec2): number {
  return Math.atan2(direction.z, direction.x);
}

/** Whether two positions are the same place — see `SAME_POINT_METERS`. */
export function isSamePoint(a: Vec2, b: Vec2): boolean {
  return distance(a, b) <= SAME_POINT_METERS;
}

/**
 * The sine of the widest angle between two directions still counted as
 * parallel: far below any angle a real crossing is drawn at, far above
 * rounding noise.
 */
const PARALLEL_SINE = 1e-9;

/**
 * Whether the directions `u` and `v` are parallel, pointing the same way or
 * opposite. Neither needs to be a unit vector.
 *
 * With θ the angle between them and `u × v = u.x·v.z − u.z·v.x`:
 *
 * - `u × v = |u|·|v|·sin θ`, so parallel is
 *
 *       |u × v| ≤ ε·|u|·|v|      (sin θ ≤ ε)
 *
 * - relative, not `u × v = 0`: two pieces cut from one straight end where
 *   rounding put them, so their `u × v` is a little off 0
 * - relative to the lengths → the same answer at any scale
 * - a zero vector: `0 ≤ 0` → parallel to everything
 */
export function areParallel(u: Vec2, v: Vec2): boolean {
  const cross = u.x * v.z - u.z * v.x;
  return (
    Math.abs(cross) <=
    PARALLEL_SINE * Math.hypot(u.x, u.z) * Math.hypot(v.x, v.z)
  );
}

export function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** The point a fraction `t` of the way from `from` to `to`. */
export function lerp(from: Vec2, to: Vec2, t: number): Vec2 {
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

/** The vector from `from` to `to`. */
export function difference(from: Vec2, to: Vec2): Vec2 {
  return { x: to.x - from.x, z: to.z - from.z };
}

export function dot(u: Vec2, v: Vec2): number {
  return u.x * v.x + u.z * v.z;
}

/**
 * The area a closed ring of points encloses, by the shoelace formula:
 * positive when it runs from +x toward +z, negative the other way round.
 */
export function signedArea(ring: readonly Vec2[]): number {
  let twice = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    twice += p.x * q.z - p.z * q.x;
  });
  return twice / 2;
}
