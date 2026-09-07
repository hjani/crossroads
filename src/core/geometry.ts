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

/** The circle an arc runs on. */
export interface ArcCircle {
  readonly center: Vec2;
  readonly radius: number;
}

/**
 * The circle through three positions, or null if they are in a line.
 *
 * Everything below is measured from `from`, which both simplifies the
 * algebra and keeps the squares in it from being swamped by a position that
 * may be kilometers from the world origin. Call the other two `e` and `v`
 * once shifted, and the center `u`.
 *
 * `u` is whatever is equally far from all three. Equally far from the
 * origin and from `e` means `|u|² = |u − e|²`, and expanding the right side
 * gives `|u|² − 2u·e + |e|²`. The `|u|²` cancels off both sides, leaving
 * `2u·e = |e|²`, or written out, `2·ex·ux + 2·ez·uz = |e|²`. That is the
 * equation of a line: the coordinates of `u` appear multiplied by constants
 * and added, nothing more. It is the perpendicular bisector of the chord —
 * a line's coefficients are the direction it stands perpendicular to, and
 * here they are the chord itself. Against `v` the same gives a second one,
 * `2u·v = |v|²`, and the center is the point sitting on both.
 *
 * Two lines, two unknowns, solved by Cramer's rule: each coordinate is a
 * determinant over the one the pair shares. Every entry of the system
 * carries a factor of 2, so the shared determinant comes out as four times
 * the cross product `e × v` and each numerator as twice one of its own;
 * cancelling a 2 through leaves the doubled cross product `denominator`
 * holds below.
 *
 * A cross product of zero is two parallel chords — the three positions in a
 * line, their bisectors parallel too, and no circle to find. It is also
 * what a `via` sitting on either end comes out as, since that chord and the
 * other are then the same one. Tested against zero because that is the
 * division it guards and nothing more: how gentle a curve is still worth
 * building is not a question about chords.
 */
export function arcCircle(from: Vec2, to: Vec2, via: Vec2): ArcCircle | null {
  const endX = to.x - from.x;
  const endZ = to.z - from.z;
  const viaX = via.x - from.x;
  const viaZ = via.z - from.z;

  const denominator = 2 * (endX * viaZ - endZ * viaX);
  if (denominator === 0) {
    return null;
  }

  // What each bisector equals: the right-hand sides, |e|² and |v|².
  const endSquared = endX * endX + endZ * endZ;
  const viaSquared = viaX * viaX + viaZ * viaZ;

  // Still measured from `from`, so this doubles as the radius: how far the
  // center is from `from` is the length of the offset between them.
  const offsetX = (viaZ * endSquared - endZ * viaSquared) / denominator;
  const offsetZ = (endX * viaSquared - viaX * endSquared) / denominator;

  return {
    center: { x: from.x + offsetX, z: from.z + offsetZ },
    radius: Math.hypot(offsetX, offsetZ),
  };
}

/**
 * The point a fraction `t` of the way along the arc `from`–`via`–`to`, 0 at
 * `from` and 1 at `to`.
 *
 * The radius does not change along an arc, so a fraction of its length and
 * the same fraction of its angle are the same place, and the point is
 * `from` turned about the center by `t` of the way round.
 *
 * Three positions in a line describe that line, so a `via` with no circle
 * through it runs straight between the ends rather than refusing — the same
 * reading `squaredDistanceToSegment` gives a segment of no length. Sections
 * never arrive here, since the network turns such an arc away, but a road
 * still being dragged out passes through straightness on its way to a curve.
 */
export function pointOnArc(from: Vec2, to: Vec2, via: Vec2, t: number): Vec2 {
  const run = arcRun(from, to, via);
  if (run === null) {
    return lerp(from, to, t);
  }

  const angle = run.startAngle + run.sweep * t;
  return {
    x: run.circle.center.x + run.circle.radius * Math.cos(angle),
    z: run.circle.center.z + run.circle.radius * Math.sin(angle),
  };
}

/** The whole arc's length, in meters. */
export function arcLength(from: Vec2, to: Vec2, via: Vec2): number {
  const run = arcRun(from, to, via);
  return run === null
    ? distance(from, to)
    : run.circle.radius * Math.abs(run.sweep);
}

/** An arc as an angle to start at and an angle to turn through. */
interface ArcRun {
  readonly circle: ArcCircle;
  readonly startAngle: number;
  readonly sweep: number;
}

/**
 * Which way round the circle the arc goes, and how far.
 *
 * The circle alone leaves two arcs between the ends, and `via` picks one by
 * lying on it. So both candidates are measured the same way — counting
 * forward from `from` — and the one that reaches `to` only after passing
 * `via` is the arc. The other is that same turn taken the other way round,
 * which is the forward one less a full circle, and so comes out negative.
 */
function arcRun(from: Vec2, to: Vec2, via: Vec2): ArcRun | null {
  const circle = arcCircle(from, to, via);
  if (circle === null) {
    return null;
  }

  const startAngle = angleAt(circle.center, from);
  const toEnd = turnFrom(startAngle, angleAt(circle.center, to));
  const toVia = turnFrom(startAngle, angleAt(circle.center, via));

  return {
    circle,
    startAngle,
    sweep: toVia < toEnd ? toEnd : toEnd - 2 * Math.PI,
  };
}

/** The direction from `center` to `point`, as an angle. */
function angleAt(center: Vec2, point: Vec2): number {
  return Math.atan2(point.z - center.z, point.x - center.x);
}

/** How far forward `angle` is from `base`, from 0 up to a full circle. */
function turnFrom(base: number, angle: number): number {
  const turn = (angle - base) % (2 * Math.PI);
  return turn < 0 ? turn + 2 * Math.PI : turn;
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
