import type { Crossing } from "./crossing";
import { clamp01, lerp, type Vec2 } from "./point";

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
 * Returns null when `A × B = 0`: parallel lines, the same line included (it
 * overlaps rather than meets at a point), or two equal points that fix no
 * line. The zero check only guards the division.
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

  // A × B
  const denominator = ax * bz - az * bx;
  if (denominator === 0) {
    return null;
  }

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
