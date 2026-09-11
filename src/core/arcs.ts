import { distance, lerp, unitDirection } from "./points";
import {
  fromTheOtherSide,
  segmentCrossing,
  segmentFractionAt,
  type Crossing,
} from "./segments";
import type { Vec2 } from "./types";

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
 * Whether the three positions make an arc at all: a circle runs through
 * them. Says nothing about whether it is long enough to be a road.
 */
export function isArcValid(from: Vec2, to: Vec2, via: Vec2): boolean {
  return arcCircle(from, to, via) !== null;
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
 * Where the segment `a1`–`a2` meets the arc `from`–`via`–`to`, in the order
 * they are met walking from `a1`. Up to two: a straight road crossing a
 * bend meets it going in and coming out again.
 *
 * A point on the segment is `a1 + t·d` for the direction `d = a2 − a1`, and
 * it is on the circle when it stands the radius away from the center.
 * Squaring that gives `|a1 + t·d − c|² = r²`, and with `f = a1 − c` it
 * multiplies out to `(d·d)t² + 2(f·d)t + (f·f − r²) = 0` — an ordinary
 * quadratic, whose two roots are the places the line pierces the circle.
 *
 * A discriminant below zero is a line passing the circle by, with nothing
 * to report. Zero is a tangent, which touches at a point and is a crossing
 * like any other: whether a junction there is worth building is a question
 * about how short the pieces come out, not about how shallow the meeting
 * was. Tested against zero because that is the square root it guards and
 * nothing more — a grazing line is also expected to return two (very close)
 * crossings because of precision of the calculation.
 *
 * Both are stretches rather than the whole line and the whole circle, so a
 * root counts only where it falls on both — `t` between 0 and 1, and a
 * direction the arc actually turns to.
 *
 * A `via` in line with the ends is a straight run between them, and meets
 * the segment wherever `segmentCrossing` says it does.
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

  const { center, radius } = run.circle;
  const directionX = a2.x - a1.x;
  const directionZ = a2.z - a1.z;
  const offsetX = a1.x - center.x;
  const offsetZ = a1.z - center.z;

  const a = directionX * directionX + directionZ * directionZ;
  if (a === 0) {
    // Section has no length. We're about to divide by it below, so bail out early.
    return [];
  }

  const b = 2 * (offsetX * directionX + offsetZ * directionZ);
  const c = offsetX * offsetX + offsetZ * offsetZ - radius * radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return [];
  }

  const root = Math.sqrt(discriminant);
  const crossings: Crossing[] = [];
  // The smaller root first, which is the meeting reached sooner walking
  // from `a1` — the order the caller is promised.
  for (const alongA of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
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
 * the order they are met walking from `fromA`. Up to two.
 *
 * Two circles that meet at all meet on a line square to the one joining
 * their centers, at equal distance from it either side. With `d` the gap
 * between the centers, that meeting line stands `alongCenters = (d² + r₁² −
 * r₂²) / 2d` from the first — what falls out of asking for a place that is
 * `r₁` from one center and `r₂` from the other — and the two points sit
 * `offCenters = √(r₁² − alongCenters²)` off it, one each way.
 *
 * Circles too far apart to reach, or one swallowed by the other, leave that
 * square root nothing to work with and there is no meeting. Circles sharing
 * a center never meet either, and two that are the same circle meet
 * everywhere rather than at a point, which is not a crossing — the reading
 * `segmentCrossing` gives two collinear segments.
 *
 * Touching circles put both points in the same place, and both are
 * reported, as a tangent line is by `segmentArcCrossings`.
 *
 * Circles meeting is not the same as arcs meeting: each place has to fall
 * inside both sweeps, since the circles can touch where neither arc, or
 * only one of them, actually runs.
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

  const { center: centerA, radius: radiusA } = runA.circle;
  const { center: centerB, radius: radiusB } = runB.circle;
  const betweenX = centerB.x - centerA.x;
  const betweenZ = centerB.z - centerA.z;
  const between = Math.hypot(betweenX, betweenZ);

  // Tested against zero because that is the division below it guards, and
  // because a shared center is the one arrangement with no line between
  // them to measure along.
  if (between === 0) {
    return [];
  }

  const alongCenters =
    (between * between + radiusA * radiusA - radiusB * radiusB) / (2 * between);
  const squaredOff = radiusA * radiusA - alongCenters * alongCenters;
  if (squaredOff < 0) {
    return [];
  }

  // The foot of the meeting line on the line between the centers, and the
  // step from it to either meeting, square to that line.
  const offCenters = Math.sqrt(squaredOff);
  const footX = centerA.x + (alongCenters * betweenX) / between;
  const footZ = centerA.z + (alongCenters * betweenZ) / between;
  const stepX = (-betweenZ / between) * offCenters;
  const stepZ = (betweenX / between) * offCenters;

  const crossings: Crossing[] = [];
  for (const point of [
    { x: footX + stepX, z: footZ + stepZ },
    { x: footX - stepX, z: footZ - stepZ },
  ]) {
    const alongA = sweptFractionAt(runA, point);
    const alongB = sweptFractionAt(runB, point);
    if (alongA !== null && alongB !== null) {
      crossings.push({ point, alongA, alongB });
    }
  }
  return crossings.sort((left, right) => left.alongA - right.alongA);
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
 * How many chords an arc of this radius and sweep takes to stay within the
 * tolerance.
 *
 * A chord spanning an angle `t` on a circle of radius `r` sits at its
 * furthest from the arc halfway along, where the gap — the sagitta — is
 * `r · (1 − cos(t/2))`: the center is `r·cos(t/2)` from the chord's
 * midpoint and `r` from the arc above it. Setting that equal to the
 * tolerance and solving back gives the widest angle one chord may span, and
 * the sweep divided by it is how many are needed.
 *
 * A larger radius does buy longer chords — a gentler curve leaves more room
 * under it before the gap opens up — but not proportionally: the chords grow
 * with the square root of the radius while the arc grows with the radius, so
 * a wide sweeping curve still takes more of them than a tight bend of the
 * same sweep. Which is the point of counting rather than fixing a number:
 * each arc gets what its own size asks for.
 *
 * The cosine is clamped before `acos`, which is undefined outside −1..1. A
 * tolerance of zero or less puts it at 1 and the widest angle at 0, and a
 * tolerance past the diameter puts it below −1; either way the count runs
 * into a limit rather than off the end of the math.
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
