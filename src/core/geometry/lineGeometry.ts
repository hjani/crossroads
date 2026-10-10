import {
  arcArcCrossings,
  arcDirectionAt,
  arcFractionAt,
  arcLength,
  arcSweep,
  isArcValid,
  nearestPointOnArc,
  nearestPointsBetweenArcs,
  nearestPointsBetweenSegmentAndArc,
  pointOnArc,
  segmentArcCrossings,
  subArcVia,
  trimArc,
} from "./arc";
import {
  biarcCrossings,
  biarcDirectionAt,
  biarcFractionAt,
  biarcLength,
  biarcPrimitives,
  isBiarcValid,
  nearestPointOnBiarc,
  nearestPointsBetweenBiarcAndLine,
  pointOnBiarc,
  subBiarc,
  trimBiarc,
  type Biarc,
} from "./biarc";
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
export type LineGeometry = PrimitiveLineGeometry | BiarcGeometry;

/** A line in one piece. */
export type PrimitiveLineGeometry = StraightGeometry | ArcGeometry;

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
 * Two pieces end to end, meeting at a join. See `Biarc`, and
 * `docs/road-network.md`, Biarcs.
 */
export interface BiarcGeometry {
  readonly kind: "biarc";
  readonly biarc: Biarc;
}

/** A line in one piece, with its ends. */
export interface PrimitiveLine {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly geometry: PrimitiveLineGeometry;
}

/**
 * Whether a line can run in a given shape between two positions: a straight
 * always can, an arc only with a `via` out of line with its ends, a biarc
 * only with valid pieces (`isBiarcValid`).
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
    case "biarc":
      return isBiarcValid(from, to, geometry.biarc);
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
  switch (geometry.kind) {
    case "straight":
      return distance(from, to);
    case "arc":
      return arcLength(from, to, geometry.via);
    case "biarc":
      return biarcLength(from, to, geometry.biarc);
  }
}

/**
 * How far round a line sweeps in all, in radians: its pieces' sweeps added
 * up, whichever way each turns. Not the net turn: a quarter right then half a
 * circle left sweeps three quarters, though it ends up turned a quarter left.
 * A straight sweeps 0.
 */
export function lineSweep(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
): number {
  return primitivesOf(from, to, geometry).reduce(
    (sweep, piece) =>
      piece.geometry.kind === "arc"
        ? sweep + arcSweep(piece.from, piece.to, piece.geometry.via)
        : sweep,
    0,
  );
}

/**
 * A line as lines in one piece, end to end from `from` to `to`: the line
 * itself, or a biarc's two pieces.
 */
export function primitivesOf(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
): readonly PrimitiveLine[] {
  switch (geometry.kind) {
    case "straight":
    case "arc":
      return [{ from, to, geometry }];
    case "biarc":
      return biarcPrimitives(from, to, geometry.biarc);
  }
}

/**
 * The point a fraction `t` of the way along a line, 0 at `from` and 1 at
 * `to` — by length, round the curve of an arc.
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
    case "biarc":
      return pointOnBiarc(from, to, geometry.biarc, t);
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
    case "biarc":
      return biarcFractionAt(from, to, geometry.biarc, place);
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
    case "biarc":
      return biarcDirectionAt(from, to, geometry.biarc, t);
  }
}

/**
 * The shape of the part of a line between two places on it: a straight
 * stays straight, an arc's part is an arc (`subArcVia`), a biarc's is a
 * piece's part or a biarc (`subBiarc`). A place off the line counts as where
 * the line reaches it (`lineFractionAt`).
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
    case "arc":
      return subPrimitiveLineGeometry(from, to, geometry, partFrom, partTo);
    case "biarc":
      return subBiarc(from, to, geometry.biarc, partFrom, partTo);
  }
}

/** `subLineGeometry` for a line in one piece, which its part stays. */
export function subPrimitiveLineGeometry(
  from: Vec2,
  to: Vec2,
  geometry: PrimitiveLineGeometry,
  partFrom: Vec2,
  partTo: Vec2,
): PrimitiveLineGeometry {
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
    case "arc":
      return trimPrimitive(from, to, geometry, s1, s2);
    case "biarc":
      return trimBiarc(from, to, geometry.biarc, s1, s2);
  }
}

/** `trimLine` for a line in one piece, which it stays. */
export function trimPrimitive(
  from: Vec2,
  to: Vec2,
  geometry: PrimitiveLineGeometry,
  s1: number,
  s2: number,
): PrimitiveLine {
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
  switch (geometry.kind) {
    case "straight":
      return nearestPointOnSegment(point, from, to);
    case "arc":
      return nearestPointOnArc(point, from, to, geometry.via);
    case "biarc":
      return nearestPointOnBiarc(from, to, geometry.biarc, point);
  }
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
  switch (geometryA.kind) {
    case "straight":
      switch (geometryB.kind) {
        case "straight":
          return nearestPointsBetweenSegments(fromA, toA, fromB, toB);
        case "arc":
          return nearestPointsBetweenSegmentAndArc(
            fromA,
            toA,
            fromB,
            toB,
            geometryB.via,
          );
        case "biarc":
          return nearestPointsFromB(
            fromA,
            toA,
            geometryA,
            fromB,
            toB,
            geometryB,
          );
      }
    case "arc":
      switch (geometryB.kind) {
        case "straight": {
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
        case "arc":
          return nearestPointsBetweenArcs(
            fromA,
            toA,
            geometryA.via,
            fromB,
            toB,
            geometryB.via,
          );
        case "biarc":
          return nearestPointsFromB(
            fromA,
            toA,
            geometryA,
            fromB,
            toB,
            geometryB,
          );
      }
    case "biarc":
      return nearestPointsBetweenBiarcAndLine(
        fromA,
        toA,
        geometryA.biarc,
        fromB,
        toB,
        geometryB,
      );
  }
}

/**
 * `nearestPointsBetweenLines` for a biarc `B`, measured from its side, so the
 * pair comes back `B`'s point first and is turned around.
 */
function nearestPointsFromB(
  fromA: Vec2,
  toA: Vec2,
  geometryA: LineGeometry,
  fromB: Vec2,
  toB: Vec2,
  geometryB: BiarcGeometry,
): readonly [Vec2, Vec2] {
  const [onB, onA] = nearestPointsBetweenBiarcAndLine(
    fromB,
    toB,
    geometryB.biarc,
    fromA,
    toA,
    geometryA,
  );
  return [onA, onB];
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
 * two mixed pairings share it and one of them turns the answer around. So
 * does a biarc meeting anything.
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
        case "biarc":
          return biarcCrossings(
            fromB,
            toB,
            geometryB.biarc,
            fromA,
            toA,
            geometryA,
          ).map(fromTheOtherSide);
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
        case "biarc":
          return biarcCrossings(
            fromB,
            toB,
            geometryB.biarc,
            fromA,
            toA,
            geometryA,
          ).map(fromTheOtherSide);
      }
    case "biarc":
      return biarcCrossings(fromA, toA, geometryA.biarc, fromB, toB, geometryB);
  }
}
