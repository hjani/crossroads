import type { Vec2 } from "./types";

/**
 * Positions on the XZ ground and the distances between them.
 *
 * The base of the plane geometry the model is built on — `segments.ts` and
 * `arcs.ts` are the two shapes a road runs in, and both measure with what is
 * here. None of it knows anything about the network: the inputs are
 * positions, so the same math serves a section that exists and one that is
 * only being drawn.
 */

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

/** Whether two positions are the same place — see `SAME_POINT_METERS`. */
export function isSamePoint(a: Vec2, b: Vec2): boolean {
  return distance(a, b) <= SAME_POINT_METERS;
}

/** The point a fraction `t` of the way from `from` to `to`. */
export function lerp(from: Vec2, to: Vec2, t: number): Vec2 {
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
  };
}
