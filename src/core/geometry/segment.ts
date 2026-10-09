import type { Crossing } from "./crossing";
import {
  areParallel,
  clamp01,
  distance,
  lerp,
  unitDirection,
  type Vec2,
} from "./point";

/**
 * Straight sections as plane geometry: where along one a position falls, and
 * where two of them meet. Positions in, answers in meters — see `point.ts`
 * for why none of this knows about the network.
 */

/**
 * Where along the segment `from`–`to` a position falls: 0 at `from`, 1 at
 * `to`. This is the `t` of the nearest point on the segment, the same `t`
 * that `lerp` takes.
 *
 * Let `d = to − from` and `p = point − from`.
 *
 * - A point on the line: `from + t·d`.
 * - The nearest one to `point` has `p − t·d` perpendicular to `d`:
 *   `(p − t·d)·d = 0`, so
 *
 *       t = (p·d) / (d·d)
 *
 * - Clamped to 0..1: past an end, the nearest point on the segment is that
 *   end.
 *
 * Returns 0 when `d·d = 0`: the segment is a single point.
 */
export function segmentFractionAt(point: Vec2, from: Vec2, to: Vec2): number {
  const alongX = to.x - from.x;
  const alongZ = to.z - from.z;
  const squaredLength = alongX * alongX + alongZ * alongZ;

  if (squaredLength === 0) {
    return 0;
  }
  return clamp01(
    ((point.x - from.x) * alongX + (point.z - from.z) * alongZ) / squaredLength,
  );
}

/**
 * The point on the segment `from`–`to` nearest `point`: the foot of its
 * perpendicular, or the nearer end where the foot falls past one.
 */
export function nearestPointOnSegment(point: Vec2, from: Vec2, to: Vec2): Vec2 {
  return lerp(from, to, segmentFractionAt(point, from, to));
}

/**
 * The segment `from`–`to` with `s₁` meters cut off its start and `s₂` off its
 * end. With `d = unitDirection(from, to)`:
 *
 *     from + s₁·d  →  to − s₂·d
 *
 * `s₁ + s₂` longer than the segment → it runs backwards.
 */
export function trimSegment(
  from: Vec2,
  to: Vec2,
  s1: number,
  s2: number,
): { readonly from: Vec2; readonly to: Vec2 } {
  const d = unitDirection(from, to);
  return {
    from: { x: from.x + s1 * d.x, z: from.z + s1 * d.z },
    to: { x: to.x - s2 * d.x, z: to.z - s2 * d.z },
  };
}

/**
 * How far `point` is from the line through `a` and `b`, in meters. The line
 * runs on past both points, so unlike `nearestPointOnSegment` nothing is
 * clamped.
 *
 * Let `d = b − a`, `p = point − a`, `θ` the angle between them, and `u × v`
 * the 2D cross product `u.x·v.z − u.z·v.x`.
 *
 * - The distance is the height of `p` above `d`: `|p|·|sin θ|`.
 * - `d × p = |d|·|p|·sin θ`, so
 *
 *       distance = |d × p| / |d|
 *
 * - → the same whichever side of the line `point` is on.
 * - `|d × p| ≤ |d|·|p|` → the result stays in `0..|p|` however short `d` is.
 *   Unlike `lineCrossing`, a near-zero divisor never blows up: it only makes
 *   the line's direction rounding noise.
 *
 * `a` and `b` the same point fix no line → the distance to `a`.
 */
export function distanceToLine(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) {
    return distance(point, a);
  }
  return Math.abs(dx * (point.z - a.z) - dz * (point.x - a.x)) / length;
}

/**
 * Where the line through `a1`, `a2` meets the line through `b1`, `b2`, or null
 * if they don't. The lines run on past the points, so `alongA` and `alongB`
 * can be anywhere, negative included.
 *
 * Let `A = a2 − a1`, `B = b2 − b1`, `d = b1 − a1`, and `u × v` the 2D cross
 * product `u.x·v.z − u.z·v.x` (so `v × v = 0`).
 *
 * - A point on each line: `a1 + s·A` and `b1 + t·B`.
 * - They are the same point when `s·A − t·B = d`.
 * - Cross both sides with `B` (removes t), then with `A` (removes s):
 *
 *       s = (d × B) / (A × B)
 *       t = (d × A) / (A × B)
 *
 * `s` is `alongA` and `t` is `alongB`.
 *
 * Returns null for `areParallel(A, B)`: parallel lines, the same line
 * included (it overlaps rather than meets at a point), or two equal points
 * that fix no line.
 *
 * - near parallel, `A × B` and `d × B` are both rounding noise → `s`, `t`
 *   land anywhere, 0..1 included, while `a1 + s·A` and `b1 + t·B` are
 *   nowhere near each other
 */
export function lineCrossing(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
): Crossing | null {
  const ax = a2.x - a1.x;
  const az = a2.z - a1.z;
  const bx = b2.x - b1.x;
  const bz = b2.z - b1.z;
  if (areParallel({ x: ax, z: az }, { x: bx, z: bz })) {
    return null;
  }

  // A × B, cannot be 0 because lines are not parallel
  const denominator = ax * bz - az * bx;

  const dx = b1.x - a1.x;
  const dz = b1.z - a1.z;
  const alongA = (dx * bz - dz * bx) / denominator;
  const alongB = (dx * az - dz * ax) / denominator;

  return { point: lerp(a1, a2, alongA), alongA, alongB };
}

/**
 * Where the segments `a1`–`a2` and `b1`–`b2` meet, or null if they don't.
 *
 * Touching at an endpoint (exactly 0 or 1) is a crossing.
 */
export function segmentCrossing(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
): Crossing | null {
  const crossing = lineCrossing(a1, a2, b1, b2);
  if (
    crossing === null ||
    crossing.alongA < 0 ||
    crossing.alongA > 1 ||
    crossing.alongB < 0 ||
    crossing.alongB > 1
  ) {
    return null;
  }
  return crossing;
}

/**
 * The point on each of the segments `a1`–`a2` and `b1`–`b2` nearest the
 * other, the first segment's first: the crossing twice where they meet.
 *
 * Let `A = a2 − a1`, `B = b2 − b1`, and a point on each
 * `a(s) = a1 + s·A`, `b(t) = b1 + t·B`, with `s, t` in 0..1.
 *
 * - `|a(s) − b(t)|` is convex in `(s, t)` → its least value over the square
 *   is at a stationary point inside it, or on its edge.
 * - Stationary inside: `a(s) − b(t)` square to both `A` and `B`.
 *   - `A`, `B` not parallel → only the zero vector → the segments meet
 *     (`segmentCrossing`).
 *   - parallel → the distance is constant along a line of `(s, t)`, which
 *     runs on to the edge → found there too.
 * - On the edge: `s` or `t` is 0 or 1 → an end of one segment, paired with
 *   the nearest point of the other (`nearestPointOnSegment`). The closest of
 *   the four pairs:
 *
 *       (a1, b), (a2, b), (a, b1), (a, b2)
 *
 * A segment of no length is a point, and comes out paired with its nearest
 * point on the other segment.
 */
export function nearestPointsBetweenSegments(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
): readonly [Vec2, Vec2] {
  const crossing = segmentCrossing(a1, a2, b1, b2);
  if (crossing !== null) {
    return [crossing.point, crossing.point];
  }
  const pairs: (readonly [Vec2, Vec2])[] = [
    [a1, nearestPointOnSegment(a1, b1, b2)],
    [a2, nearestPointOnSegment(a2, b1, b2)],
    [nearestPointOnSegment(b1, a1, a2), b1],
    [nearestPointOnSegment(b2, a1, a2), b2],
  ];
  return pairs.reduce((best, pair) =>
    distance(...pair) < distance(...best) ? pair : best,
  );
}
