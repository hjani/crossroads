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

/**
 * How far `point` is from the segment `from`–`to`, in meters.
 *
 * Not the distance to the infinite line through the two: a point past
 * either end measures to that end, which is what makes this the distance to
 * a road rather than to the direction it happens to run in.
 */
export function distanceToSegment(point: Vec2, from: Vec2, to: Vec2): number {
  return Math.sqrt(squaredDistanceToSegment(point, from, to));
}

/**
 * The same distance, squared — for a scan comparing distances only against
 * each other and against a limit, which can square the limit instead and
 * skip a square root per candidate. `nearestNode` does the same.
 *
 * The segment is every point `from + t·along` for `t` between 0 and 1,
 * where `along = to - from`. So the question is which `t` is nearest, and
 * the answer is a projection.
 *
 * The 2D dot product `a·b = ax·bx + az·bz` measures how much of `a` points
 * the same way as `b`, scaled by both their lengths. Taking it of
 * `point - from` against `along` therefore gives how far along the segment
 * `point` lies — but multiplied by the segment's length, since that length
 * is baked into the result. Dividing by `along·along`, which is the length
 * squared, cancels that factor and divides by the length once more, turning
 * the distance into a fraction of the segment. Hence `t` from one dot
 * product over another.
 *
 * `t` outside 0..1 means the nearest place on the *line* is off the end of
 * the *segment*, so it is clamped: the nearest place on the segment is then
 * that endpoint, and the distance is measured to it. That is the whole
 * difference between this and a point-to-line distance, and it is why a
 * cursor beyond the end of a road is still near the road's end rather than
 * near the road.
 *
 * A segment of no length has no direction to project onto — `along·along`
 * is zero and the division would be undefined — but it is also a single
 * place, so `t` is 0 and the distance is to that place.
 */
export function squaredDistanceToSegment(
  point: Vec2,
  from: Vec2,
  to: Vec2,
): number {
  const alongX = to.x - from.x;
  const alongZ = to.z - from.z;
  const squaredLength = alongX * alongX + alongZ * alongZ;

  const t =
    squaredLength === 0
      ? 0
      : clamp01(
          ((point.x - from.x) * alongX + (point.z - from.z) * alongZ) /
            squaredLength,
        );

  // From the nearest place on the segment to the point itself.
  const dx = point.x - (from.x + alongX * t);
  const dz = point.z - (from.z + alongZ * t);
  return dx * dx + dz * dz;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
