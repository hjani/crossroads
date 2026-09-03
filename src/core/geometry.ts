import type { Vec2 } from "./types";

/**
 * Plane geometry on the XZ ground: points, distances, and where segments
 * meet. Knows nothing about the network — the inputs are positions, so the
 * same math serves a section that exists and one that is only being drawn.
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

/** Where two segments meet, and how far along each of them that is. */
export interface Crossing {
  readonly point: Vec2;
  /** 0 at the first segment's start, 1 at its end. */
  readonly alongA: number;
  readonly alongB: number;
}

export function distance(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/** Whether two positions are the same place — see `SAME_POINT_METERS`. */
export function isSamePoint(a: Vec2, b: Vec2): boolean {
  return distance(a, b) <= SAME_POINT_METERS;
}

/** The point a fraction `t` of the way from `from` to `to`. */
function lerp(from: Vec2, to: Vec2, t: number): Vec2 {
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

/**
 * Where the segments a1–a2 and b1–b2 meet, or null if they do not.
 *
 * Solved parametrically: a point on the first segment is `a1 + s·A` for the
 * direction `A = a2 - a1` and `s` from 0 to 1, and likewise `b1 + t·B`.
 * Equating the two gives `s·A - t·B = d`, where `d = b1 - a1`. Taking the
 * 2D cross product of both sides with `B` drops the `t` term, since
 * `B × B` is zero, and leaves `s` on its own; crossing with `A` instead
 * leaves `t`. Outside 0 to 1 the lines meet beyond the end of a segment.
 *
 * Parallel segments have no crossing to report, collinear ones included:
 * they lie along each other rather than meeting at a point. Touching at an
 * endpoint, on the other hand, is a crossing like any other and reported as
 * one — whether it means a new junction or a join that already exists is
 * the caller's to decide, since only it knows whether the two already share
 * a node.
 */
export function segmentCrossing(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
): Crossing | null {
  const ax = a2.x - a1.x;
  const az = a2.z - a1.z;
  const bx = b2.x - b1.x;
  const bz = b2.z - b1.z;

  // The 2D cross product of the two directions: the signed area they span,
  // which is zero exactly when they are parallel. Tested against zero
  // because that is the division it guards and nothing more — how shallow a
  // crossing is still worth building is not a question about vectors.
  const denominator = ax * bz - az * bx;
  if (denominator === 0) {
    return null;
  }

  const dx = b1.x - a1.x;
  const dz = b1.z - a1.z;
  const alongA = (dx * bz - dz * bx) / denominator;
  const alongB = (dx * az - dz * ax) / denominator;

  if (alongA < 0 || alongA > 1 || alongB < 0 || alongB > 1) {
    return null;
  }

  return { point: lerp(a1, a2, alongA), alongA, alongB };
}
