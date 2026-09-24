import {
  arcLength,
  nearestPointOnArc,
  nearestPointsBetweenArcs,
  nearestPointsBetweenSegmentAndArc,
} from "./arc";
import { distance, type Vec2 } from "./point";
import { nearestPointOnSegment, nearestPointsBetweenSegments } from "./segment";

/**
 * The shapes a line on the ground can take.
 */

/** How a line runs between two positions. */
export type LineGeometry = StraightGeometry | ArcGeometry;

export interface StraightGeometry {
  readonly kind: "straight";
}

/**
 * The straight shape, which has nothing to vary and so needs only one of
 * it. Saying `STRAIGHT` rather than writing the shape out also leaves the
 * places that assume straightness searchable for the day they stop.
 */
export const STRAIGHT: StraightGeometry = { kind: "straight" };

/**
 * A circular arc, fixed by a position it passes through between its ends.
 *
 * Three positions that are not in a line lie on one circle, so `via` settles
 * the radius, which way the line bends, and whether it takes the short or
 * the long way round — the far side of the circle is just a `via` on the far
 * side of the chord. The circle is derived from the three and never stored,
 * so there is one description of the arc and nothing beside it to keep in
 * step.
 *
 * The ends already fix all but one degree of freedom, so a position is more
 * than an arc needs: several `via`s describe the same arc. Comparing shapes
 * means comparing the circles they work out to, not the stored positions.
 *
 * Symmetric — the arc from A to B through V is the arc from B to A through V.
 */
export interface ArcGeometry {
  readonly kind: "arc";
  readonly via: Vec2;
}

/**
 * How long a line runs between two positions, in meters — along a given line
 * geometry.
 */
export function lineLength(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
): number {
  return geometry.kind === "arc"
    ? arcLength(from, to, geometry.via)
    : distance(from, to);
}

/**
 * The point on a line nearest `point`, whichever shape it runs in. A point
 * past either end gives that end.
 */
export function nearestPointOnLine(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
  point: Vec2,
): Vec2 {
  return geometry.kind === "arc"
    ? nearestPointOnArc(point, from, to, geometry.via)
    : nearestPointOnSegment(point, from, to);
}

/**
 * The point on each of two lines nearest the other, whichever shapes they
 * run in, the first line's first. The same point twice where they meet.
 */
export function nearestPointsBetweenLines(
  fromA: Vec2,
  toA: Vec2,
  geometryA: LineGeometry,
  fromB: Vec2,
  toB: Vec2,
  geometryB: LineGeometry,
): readonly [Vec2, Vec2] {
  if (geometryA.kind === "arc" && geometryB.kind === "arc") {
    return nearestPointsBetweenArcs(
      fromA,
      toA,
      geometryA.via,
      fromB,
      toB,
      geometryB.via,
    );
  }
  if (geometryA.kind === "arc") {
    // Measured from B's side, so the pair comes back B's point first.
    const [onB, onA] = nearestPointsBetweenSegmentAndArc(
      fromB,
      toB,
      fromA,
      toA,
      geometryA.via,
    );
    return [onA, onB];
  }
  if (geometryB.kind === "arc") {
    return nearestPointsBetweenSegmentAndArc(
      fromA,
      toA,
      fromB,
      toB,
      geometryB.via,
    );
  }
  return nearestPointsBetweenSegments(fromA, toA, fromB, toB);
}

/**
 * The shortest distance between two lines, in meters, whichever shapes they
 * run in: 0 where they meet.
 */
export function distanceBetweenLines(
  fromA: Vec2,
  toA: Vec2,
  geometryA: LineGeometry,
  fromB: Vec2,
  toB: Vec2,
  geometryB: LineGeometry,
): number {
  return distance(
    ...nearestPointsBetweenLines(fromA, toA, geometryA, fromB, toB, geometryB),
  );
}
