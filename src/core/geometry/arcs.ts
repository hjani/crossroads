import { distance, lerp, unitDirection, type Vec2 } from "./points";
import {
  fromTheOtherSide,
  segmentCrossing,
  segmentFractionAt,
  type Crossing,
} from "./segments";

/**
 * Curved sections as plane geometry: the circle three positions lie on, and
 * the arc that runs between two of them through the third. Positions in,
 * answers in meters — see `points.ts` for why none of this knows about the
 * network.
 */

/** The circle an arc runs on. */
export interface ArcCircle {
  readonly center: Vec2;
  readonly radius: number;
}

/**
 * The circle through three positions, or null if there is none.
 *
 * Let `e = to − from`, `v = via − from`, `u` the center relative to `from`,
 * and `e × v = e.x·v.z − e.z·v.x` the 2D cross product. Everything is
 * relative to `from` so the squares stay small when the positions are far
 * from the world origin.
 *
 * - `u` is as far from `0` as from `e`:
 *   `|u|² = |u − e|² = |u|² − 2u·e + |e|²`. The `|u|²` cancels, leaving a
 *   line (the chord's perpendicular bisector):
 *
 *       2u·e = |e|²
 *
 * - The same for `v`: `2u·v = |v|²`.
 * - Solve the two equations with Cramer's rule. The determinant is
 *   `4(e × v)`, and a factor of 2 cancels:
 *
 *       u.x = (v.z·|e|² − e.z·|v|²) / 2(e × v)
 *       u.z = (e.x·|v|² − v.x·|e|²) / 2(e × v)
 *
 * - The radius is `|u|`.
 *
 * Returns null when `e × v = 0`: the three positions are in a line, `via`
 * is on one of the ends, or the ends are the same point. The zero check
 * only guards the division. It says nothing about which curves are too
 * gentle to build.
 */
export function arcCircle(from: Vec2, to: Vec2, via: Vec2): ArcCircle | null {
  const endX = to.x - from.x;
  const endZ = to.z - from.z;
  const viaX = via.x - from.x;
  const viaZ = via.z - from.z;

  // 2(e × v)
  const denominator = 2 * (endX * viaZ - endZ * viaX);
  if (denominator === 0) {
    return null;
  }

  // |e|² and |v|²
  const endSquared = endX * endX + endZ * endZ;
  const viaSquared = viaX * viaX + viaZ * viaZ;

  // u
  const offsetX = (viaZ * endSquared - endZ * viaSquared) / denominator;
  const offsetZ = (endX * viaSquared - viaX * endSquared) / denominator;

  return {
    center: { x: from.x + offsetX, z: from.z + offsetZ },
    radius: Math.hypot(offsetX, offsetZ),
  };
}

/**
 * Whether the three positions make an arc at all: a circle runs through
 * them. Says nothing about whether it is long enough to be a road.
 */
export function isArcValid(from: Vec2, to: Vec2, via: Vec2): boolean {
  return arcCircle(from, to, via) !== null;
}

/**
 * Finds the arc that starts at `from`, leaves it in `direction`, and ends at
 * `to`. Returns the arc's midpoint, to be used as its `via`.
 *
 * Returns null when there is no such arc:
 * - `direction` points exactly away from `to` (the arc would be a full circle)
 * - `from` and `to` are the same point, or `direction` is zero
 *
 * Let `d = to − from` be the chord, `m` its midpoint, `p = (−d.z, d.x)` the
 * chord rotated by 90°, and θ the angle between `direction` and `d`.
 *
 * - The arc turns through 2θ (tangent–chord angle theorem).
 * - The arc's midpoint is on the line through `m` perpendicular to the chord,
 *   at distance `(|d| / 2) · tan(θ/2)` from `m`, on the side `direction`
 *   points to.
 * - With `tan(θ/2) = sin θ / (1 + cos θ)`, where
 *   `sin θ = direction·p / (|direction| |d|)` (its sign gives the side) and
 *   `cos θ = direction·d / (|direction| |d|)`, this becomes:
 *
 *       via = m + p · (direction·p) / (2 · (|direction| |d| + direction·d))
 *
 * No angle is computed, and `direction` does not need to be a unit vector.
 *
 * If `direction` points exactly at `to`, the result is `m`: three points in a
 * line, which this module treats as a straight. If it points away from `to`,
 * the result is the long arc, more than a half circle. The zero check only
 * guards the division, as in `arcCircle`.
 */
export function arcViaLeaving(
  from: Vec2,
  direction: Vec2,
  to: Vec2,
): Vec2 | null {
  const chordX = to.x - from.x;
  const chordZ = to.z - from.z;
  // p: the chord rotated by 90°.
  const perpX = -chordZ;
  const perpZ = chordX;

  const lengths =
    Math.hypot(direction.x, direction.z) * Math.hypot(chordX, chordZ);
  const alongChord = direction.x * chordX + direction.z * chordZ;
  const denominator = 2 * (lengths + alongChord);
  if (denominator === 0) {
    return null;
  }

  const offset = (direction.x * perpX + direction.z * perpZ) / denominator;
  return {
    x: from.x + chordX / 2 + perpX * offset,
    z: from.z + chordZ / 2 + perpZ * offset,
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
 * reading `segmentFractionAt` gives a segment of no length. Sections
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

/**
 * Which way the arc `from`–`via`–`to` is heading a fraction `t` of the way
 * along, as a unit vector pointing from `from` toward `to`.
 *
 * On a circle the heading is square to the radius, so it is the direction
 * from the center turned a quarter — forward for a forward sweep, back for
 * a backward one.
 *
 * Three positions in a line head straight from one end to the other, the
 * same straight reading `pointOnArc` gives them.
 */
export function arcDirectionAt(
  from: Vec2,
  to: Vec2,
  via: Vec2,
  t: number,
): Vec2 {
  const run = arcRun(from, to, via);
  if (run === null) {
    return unitDirection(from, to);
  }

  const angle = run.startAngle + run.sweep * t;
  const turn = Math.sign(run.sweep);
  return { x: -turn * Math.sin(angle), z: turn * Math.cos(angle) };
}

/**
 * Where along the arc `from`–`via`–`to` a position falls: 0 at `from` and 1
 * at `to`. The inverse of `pointOnArc`.
 *
 * Read by direction from the center, so a position off the curve answers
 * for the place on the curve that lies the same way from the middle. That
 * is what makes this the right question to ask of a node that landed a
 * little off the road it is cutting: it is the fraction the road reached
 * when it got to that place, not a claim that the place is on it.
 *
 * The turn is counted the way the arc runs: forward for a forward sweep,
 * and back from a full circle for one going the other way, since a backward
 * sweep is reached by turning down from `2π` rather than up from zero. A
 * position exactly at `from` is the exception, having turned nothing either
 * way — without it the wrap would read that as a full circle backwards.
 *
 * A direction the arc never turns to is the fraction's version of a
 * position past the end of a segment, and answers the same way
 * `segmentFractionAt` does: with whichever end the turn ran out at. Measured by
 * distance rather than by more turning, because the far side of the circle
 * lies past the end and before the start at once, and only the ends
 * themselves say which is nearer.
 *
 * A `via` in line with the ends measures along the segment between them,
 * the same straight reading the rest of this module gives one.
 */
export function arcFractionAt(
  from: Vec2,
  to: Vec2,
  via: Vec2,
  point: Vec2,
): number {
  const run = arcRun(from, to, via);
  if (run === null) {
    return segmentFractionAt(point, from, to);
  }

  const fraction = sweptFractionAt(run, point);
  return fraction !== null
    ? fraction
    : distance(point, from) <= distance(point, to)
      ? 0
      : 1;
}

/** The whole arc's length, in meters. */
export function arcLength(from: Vec2, to: Vec2, via: Vec2): number {
  const run = arcRun(from, to, via);
  return run === null
    ? distance(from, to)
    : run.circle.radius * Math.abs(run.sweep);
}

/**
 * However many chords it takes, an arc is never split past this. Insurance
 * against a tolerance so fine, or a radius so large, that the count runs
 * away — at which point the arc is straight enough that nobody will see
 * where it stopped being subdivided.
 */
const MAX_ARC_CHORDS = 512;

/**
 * The arc `from`–`via`–`to` as a run of straight chords, both endpoints
 * included, fine enough that no chord strays further than `sagMeters` from
 * the true curve.
 *
 * The tolerance is asked for rather than fixed here, because how close is
 * close enough depends on what the polyline is for — a drawing answers it
 * with what the viewer can see, a length or a crossing with what the
 * network cares about. The math has no opinion.
 *
 * Both ends are the positions passed in rather than points computed from
 * their angles, which would differ from them by a rounding. A section's
 * ends are its nodes, and they have to land exactly on them.
 *
 * A `via` in line with the ends has no circle, so the result is the two
 * ends and nothing between — the same straight reading `pointOnArc` gives.
 */
export function arcPolyline(
  from: Vec2,
  to: Vec2,
  via: Vec2,
  sagMeters: number,
): Vec2[] {
  const run = arcRun(from, to, via);
  if (run === null) {
    return [from, to];
  }

  const { center, radius } = run.circle;
  const chords = chordCount(radius, Math.abs(run.sweep), sagMeters);

  const points: Vec2[] = [from];
  for (let chord = 1; chord < chords; chord++) {
    const angle = run.startAngle + (run.sweep * chord) / chords;
    points.push({
      x: center.x + radius * Math.cos(angle),
      z: center.z + radius * Math.sin(angle),
    });
  }
  points.push(to);
  return points;
}

/**
 * Where the line through `a1`, `a2` meets `circle`, as fractions `t` along the
 * line: 0 at `a1`, 1 at `a2`, and on past both. Up to two, smaller `t` first.
 *
 * Let `d = a2 − a1`, `f = a1 − center`, and `r` the radius.
 *
 * - A point on the line: `a1 + t·d`.
 * - It is on the circle when `|f + t·d|² = r²`, which expands to
 *   `a·t² + b·t + c = 0` with
 *
 *       a = d·d
 *       b = 2(f·d)
 *       c = f·f − r²
 *
 * - The roots, the `−` one first:
 *
 *       t = (−b ± √(b² − 4ac)) / 2a
 *
 * Returns none when:
 * - `a = 0`: two equal points fix no line.
 * - `b² − 4ac < 0`: the line misses the circle.
 *
 * `b² − 4ac = 0` is a tangent, which counts, as two equal roots. With
 * rounding, a line that only touches the circle often gives two very close
 * roots instead. The zero check only guards the square root.
 */
export function lineCircleCrossings(
  a1: Vec2,
  a2: Vec2,
  circle: ArcCircle,
): number[] {
  const { center, radius } = circle;
  const directionX = a2.x - a1.x;
  const directionZ = a2.z - a1.z;
  const offsetX = a1.x - center.x;
  const offsetZ = a1.z - center.z;

  const a = directionX * directionX + directionZ * directionZ;
  if (a === 0) {
    // No line. We're about to divide by it below, so bail out early.
    return [];
  }

  const b = 2 * (offsetX * directionX + offsetZ * directionZ);
  const c = offsetX * offsetX + offsetZ * offsetZ - radius * radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return [];
  }

  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

/**
 * Where the segment `a1`–`a2` meets the arc `from`–`via`–`to`, in order of
 * distance from `a1`. Up to two: the `lineCircleCrossings` of the arc's
 * circle, kept only where `t` is in 0..1 and the arc's sweep reaches the
 * point.
 *
 * A `via` in line with the ends is a straight, and this returns what
 * `segmentCrossing` returns.
 */
export function segmentArcCrossings(
  a1: Vec2,
  a2: Vec2,
  from: Vec2,
  to: Vec2,
  via: Vec2,
): Crossing[] {
  const run = arcRun(from, to, via);
  if (run === null) {
    const crossing = segmentCrossing(a1, a2, from, to);
    return crossing === null ? [] : [crossing];
  }

  const crossings: Crossing[] = [];
  for (const alongA of lineCircleCrossings(a1, a2, run.circle)) {
    if (alongA < 0 || alongA > 1) {
      continue;
    }

    const point = lerp(a1, a2, alongA);
    const alongB = sweptFractionAt(run, point);
    if (alongB !== null) {
      crossings.push({ point, alongA, alongB });
    }
  }
  return crossings;
}

/**
 * Where the arc `fromA`–`viaA`–`toA` meets the arc `fromB`–`viaB`–`toB`, in
 * order along the first arc. Up to two: the `circleCircleCrossings` of their
 * circles, kept only where both arcs' sweeps reach the point.
 *
 * A `via` in line with its ends is a straight, and the answer comes from
 * `segmentArcCrossings`.
 */
export function arcArcCrossings(
  fromA: Vec2,
  toA: Vec2,
  viaA: Vec2,
  fromB: Vec2,
  toB: Vec2,
  viaB: Vec2,
): Crossing[] {
  const runA = arcRun(fromA, toA, viaA);
  if (runA === null) {
    return segmentArcCrossings(fromA, toA, fromB, toB, viaB);
  }

  const runB = arcRun(fromB, toB, viaB);
  if (runB === null) {
    // We'll get the results from the B point of view, so we then need to flip them.
    // Flippling might also change the order, so we need to sort again.
    return segmentArcCrossings(fromB, toB, fromA, toA, viaA)
      .map(fromTheOtherSide)
      .sort((left, right) => left.alongA - right.alongA);
  }

  const crossings: Crossing[] = [];
  for (const point of circleCircleCrossings(runA.circle, runB.circle)) {
    const alongA = sweptFractionAt(runA, point);
    const alongB = sweptFractionAt(runB, point);
    if (alongA !== null && alongB !== null) {
      crossings.push({ point, alongA, alongB });
    }
  }
  return crossings.sort((left, right) => left.alongA - right.alongA);
}

/**
 * Where circle `a` meets circle `b`. Up to two, in no particular order.
 *
 * Let `cA, rA` and `cB, rB` be the two circles, `w = cB − cA`, `D = |w|`.
 * In coordinates with `cA` at the origin and the x axis along `w`:
 *
 * - A meeting point is on both circles:
 *
 *       x² + y² = rA²
 *       (x − D)² + y² = rB²
 *
 * - Subtract the second from the first (removes y²) and solve:
 *
 *       x = (D² + rA² − rB²) / 2D        (alongCenters)
 *       y = ±√(rA² − x²)                 (offCenters)
 *
 * - Back in world coordinates, with `n = (−w.z, w.x) / D`:
 *
 *       point = cA + x·w/D ± y·n         (foot ± step)
 *
 * Returns none when:
 * - `D = 0`: same center. Different radii never meet, and the same circle
 *   has no single meeting points. The zero check only guards the division.
 * - `rA² − x² < 0`: the circles are too far apart, or one is inside the
 *   other.
 *
 * `rA² − x² = 0` is two circles touching: both points are the same, and both
 * are returned, as for a tangent in `lineCircleCrossings`.
 */
export function circleCircleCrossings(a: ArcCircle, b: ArcCircle): Vec2[] {
  const { center: centerA, radius: radiusA } = a;
  const { center: centerB, radius: radiusB } = b;
  const betweenX = centerB.x - centerA.x;
  const betweenZ = centerB.z - centerA.z;
  const between = Math.hypot(betweenX, betweenZ);

  // Same center.
  if (between === 0) {
    return [];
  }

  const alongCenters =
    (between * between + radiusA * radiusA - radiusB * radiusB) / (2 * between);
  const squaredOff = radiusA * radiusA - alongCenters * alongCenters;
  if (squaredOff < 0) {
    return [];
  }

  // foot = cA + x·w/D, step = y·n
  const offCenters = Math.sqrt(squaredOff);
  const footX = centerA.x + (alongCenters * betweenX) / between;
  const footZ = centerA.z + (alongCenters * betweenZ) / between;
  const stepX = (-betweenZ / between) * offCenters;
  const stepZ = (betweenX / between) * offCenters;

  return [
    { x: footX + stepX, z: footZ + stepZ },
    { x: footX - stepX, z: footZ - stepZ },
  ];
}

/**
 * How far along the arc a position's direction from the center falls, or
 * null where the arc never turns that way.
 *
 * The one reading every question here shares, so that all of them agree
 * about where an arc begins and ends.
 *
 * The turn is counted the way the arc runs: forward for a forward sweep,
 * and back from a full circle for one going the other way, since a backward
 * sweep is reached by turning down from `2π` rather than up from zero. A
 * position exactly at the start is the exception, having turned nothing
 * either way — without it the wrap would read that as a full circle
 * backwards.
 *
 * Never negative, the two signs cancelling when the turn is counted in the
 * sweep's own direction, so running past the end is the only way out.
 */
function sweptFractionAt(run: ArcRun, point: Vec2): number | null {
  const turn = turnFrom(run.startAngle, angleAt(run.circle.center, point));
  const along = run.sweep >= 0 || turn === 0 ? turn : turn - 2 * Math.PI;

  const fraction = along / run.sweep;
  return fraction <= 1 ? fraction : null;
}

/**
 * How many chords an arc of radius `r` and sweep `s` needs, so that no chord
 * is more than `sag` away from the arc.
 *
 * Let α be the angle one chord spans.
 *
 * - The largest gap between chord and arc is at the chord's midpoint
 *   (the sagitta): `r · (1 − cos(α/2))`.
 * - Set it equal to `sag` and solve for α:
 *
 *       α = 2 · acos(1 − sag / r)
 *
 * - Chords needed: `ceil(s / α)`, limited to 1..MAX_ARC_CHORDS.
 *
 * For small α, one chord's length is `≈ 2 · √(2 · r · sag)`. It grows with
 * √r, while the arc grows with r, so a wide curve needs more chords than a
 * tight one with the same sweep.
 *
 * `1 − sag / r` is clamped to −1..1 first, because `acos` is undefined
 * outside that range:
 * - `sag ≤ 0` → α = 0 → the count is MAX_ARC_CHORDS
 * - `sag ≥ 2r` → α = 2π → the count is 1
 */
function chordCount(radius: number, sweep: number, sagMeters: number): number {
  const cosHalfAngle = Math.max(-1, Math.min(1, 1 - sagMeters / radius));
  const widestAngle = 2 * Math.acos(cosHalfAngle);
  return Math.min(MAX_ARC_CHORDS, Math.max(1, Math.ceil(sweep / widestAngle)));
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
