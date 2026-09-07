import { distance, lerp } from "./points";
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
