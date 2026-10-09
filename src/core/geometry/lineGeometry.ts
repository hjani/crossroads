import {
  arcArcCrossings,
  arcDirectionAt,
  arcFractionAt,
  arcLength,
  isArcValid,
  nearestPointOnArc,
  nearestPointsBetweenArcs,
  nearestPointsBetweenSegmentAndArc,
  pointOnArc,
  segmentArcCrossings,
  subArcVia,
  trimArc,
} from "./arc";
import { fromTheOtherSide, type Crossing } from "./crossing";
import { distance, lerp, unitDirection, type Vec2 } from "./point";
import {
  nearestPointOnSegment,
  nearestPointsBetweenSegments,
  segmentCrossing,
  segmentFractionAt,
  trimSegment,
} from "./segment";

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
 * Whether a line can run in a given shape between two positions: a straight
 * always can, an arc only with a `via` out of line with its ends.
 */
export function isLineGeometryValid(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
): boolean {
  switch (geometry.kind) {
    case "straight":
      return true;
    case "arc":
      return isArcValid(from, to, geometry.via);
  }
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
 * The point a fraction `t` of the way along a line, 0 at `from` and 1 at
 * `to` — round the curve of an arc.
 */
export function pointOnLine(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
  t: number,
): Vec2 {
  switch (geometry.kind) {
    case "straight":
      return lerp(from, to, t);
    case "arc":
      return pointOnArc(from, to, geometry.via, t);
  }
}

/**
 * Where along a line a place falls, 0 at `from` and 1 at `to` — the `t` that
 * `pointOnLine` takes. Measured round the curve of an arc, and a place off
 * the line reads as the nearest place on it.
 */
export function lineFractionAt(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
  place: Vec2,
): number {
  switch (geometry.kind) {
    case "straight":
      return segmentFractionAt(place, from, to);
    case "arc":
      return arcFractionAt(from, to, geometry.via, place);
  }
}

/**
 * Which way a line is heading a fraction `t` of the way along it, as a unit
 * vector pointing the way it runs from `from` to `to`. A straight heads the
 * same way all along.
 */
export function lineDirectionAt(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
  t: number,
): Vec2 {
  switch (geometry.kind) {
    case "straight":
      return unitDirection(from, to);
    case "arc":
      return arcDirectionAt(from, to, geometry.via, t);
  }
}

/**
 * The shape of the part of a line between two places on it: a straight
 * stays straight, an arc's part is an arc (`subArcVia`). A place off the
 * line counts as where the line reaches it (`lineFractionAt`).
 */
export function subLineGeometry(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
  partFrom: Vec2,
  partTo: Vec2,
): LineGeometry {
  switch (geometry.kind) {
    case "straight":
      return STRAIGHT;
    case "arc":
      return {
        kind: "arc",
        via: subArcVia(from, to, geometry.via, partFrom, partTo),
      };
  }
}

/**
 * A line with `s₁` meters cut off its start and `s₂` off its end, measured
 * along it: a shorter line of the same shape.
 */
export function trimLine(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
  s1: number,
  s2: number,
): { readonly from: Vec2; readonly to: Vec2; readonly geometry: LineGeometry } {
  switch (geometry.kind) {
    case "straight":
      return { ...trimSegment(from, to, s1, s2), geometry };
    case "arc": {
      const arc = trimArc(from, to, geometry.via, s1, s2);
      return {
        from: arc.from,
        to: arc.to,
        geometry: { kind: "arc", via: arc.via },
      };
    }
  }
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

/**
 * Where two lines meet, whichever shapes they run in, with `alongA` measured
 * along the first of them. In no particular order.
 *
 * The dispatch neither shape module can do: each answers for the shapes it
 * owns, and which pair is being asked about is the question left over. A
 * straight meeting an arc is one piece of math read from either end, so the
 * two mixed pairings share it and one of them turns the answer around.
 */
export function lineCrossings(
  fromA: Vec2,
  toA: Vec2,
  geometryA: LineGeometry,
  fromB: Vec2,
  toB: Vec2,
  geometryB: LineGeometry,
): Crossing[] {
  switch (geometryA.kind) {
    case "straight":
      switch (geometryB.kind) {
        case "straight": {
          const crossing = segmentCrossing(fromA, toA, fromB, toB);
          return crossing === null ? [] : [crossing];
        }
        case "arc":
          return segmentArcCrossings(fromA, toA, fromB, toB, geometryB.via);
      }
    case "arc":
      switch (geometryB.kind) {
        case "straight":
          return segmentArcCrossings(fromB, toB, fromA, toA, geometryA.via).map(
            fromTheOtherSide,
          );
        case "arc":
          return arcArcCrossings(
            fromA,
            toA,
            geometryA.via,
            fromB,
            toB,
            geometryB.via,
          );
      }
  }
}
