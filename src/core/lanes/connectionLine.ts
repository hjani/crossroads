import { arcViaLeaving } from "../geometry/arc";
import { biarcBetween, biarcPrimitives } from "../geometry/biarc";
import {
  distanceBetweenLines,
  nearestPointOnLine,
  offsetPrimitive,
  STRAIGHT,
  type Line,
  type PrimitiveLine,
} from "../geometry/lineGeometry";
import {
  difference,
  distance,
  dot,
  isSamePoint,
  SAME_POINT_METERS,
  type Vec2,
} from "../geometry/point";
import { lineCrossing } from "../geometry/segment";
import type { JunctionOutline } from "../layout/outline";
import { LANE_WIDTH_METERS } from "./lane";

/**
 * How far a connection keeps from a junction's curbs, in meters: `c` in
 * `docs/lanes.md`, Shape. Half a lane → the lane's whole width stays on the
 * road.
 */
export const CONNECTION_CLEARANCE_METERS = LANE_WIDTH_METERS / 2;

/**
 * How far short of the widest turn that fits `largestFittingRadius` may stop,
 * in meters.
 */
export const RADIUS_TOLERANCE_METERS = 0.1;

/**
 * Where cars drive across a junction: straights and arcs end to end, from an
 * incoming lane's exit to an outgoing lane's entry. See `docs/lanes.md`,
 * Shape.
 */
export interface ConnectionLine {
  /**
   * In driving order: the first starts at the exit, each next one where the
   * one before ends, the last ends at the entry.
   */
  readonly pieces: readonly PrimitiveLine[];
}

/**
 * What a connection keeps `CONNECTION_CLEARANCE_METERS` from
 * (`docs/lanes.md`, Shape): a junction's curb pieces, and the corners of its
 * outline — where two roadway ends meet, no curb lies between them.
 */
export interface Curbs {
  readonly pieces: readonly Line[];
  readonly corners: readonly Vec2[];
}

/**
 * A junction's curbs, read off its outline: each curb piece runs from the
 * point before it round the ring, and every point of the ring is a corner.
 */
export function curbsOf({ pieces }: JunctionOutline): Curbs {
  return {
    pieces: pieces.flatMap((piece, index) =>
      piece.edge === "curb"
        ? [
            {
              from: pieces[index === 0 ? pieces.length - 1 : index - 1].point,
              to: piece.point,
              geometry: piece.incomingGeometry,
            },
          ]
        : [],
    ),
    corners: pieces.map((piece) => piece.point),
  };
}

/**
 * Two lane lines crossing ahead of both lanes (`docs/lanes.md`, Shape): the
 * exit's carried on along `h`, the entry's carried back along `e`, both unit
 * vectors.
 */
interface Corner {
  readonly exit: Vec2;
  readonly h: Vec2;
  readonly entry: Vec2;
  readonly e: Vec2;
  /** Where the lines cross: `K`. */
  readonly k: Vec2;
  /** `a = |K − exit|` */
  readonly a: number;
  /** `b = |entry − K|` */
  readonly b: number;
}

/**
 * The connection from `exit`, heading `h`, to `entry`, heading `e`, both unit
 * vectors, across a junction with `curbs` (`docs/lanes.md`, Shape):
 *
 * - lane lines crossing ahead of both lanes (`cornerOf`): the turn round
 *   their corner, as wide as keeps clear of the curbs
 *   (`largestFittingRadius`, `turnAt`)
 * - otherwise a biarc (`biarcBetween`); where there is none, a straight
 */
export function connectionLine(
  exit: Vec2,
  h: Vec2,
  entry: Vec2,
  e: Vec2,
  curbs: Curbs,
): ConnectionLine {
  const corner = cornerOf(exit, h, entry, e);
  if (corner !== null) {
    return turnAt(corner, largestFittingRadius(corner, curbs));
  }

  const biarc = biarcBetween(exit, h, entry, e);
  return {
    pieces:
      biarc === null
        ? [{ from: exit, to: entry, geometry: STRAIGHT }]
        : biarcPrimitives(exit, entry, biarc),
  };
}

/**
 * A connection moved `offset` meters square to itself, to its right the way
 * it runs, piece by piece (`offsetPrimitive`): the same shape, every heading
 * kept → still smooth at every join. Negative → to the left. Null where a
 * piece would pass its arc's center.
 */
export function offsetConnectionLine(
  { pieces }: ConnectionLine,
  offset: number,
): ConnectionLine | null {
  const moved: PrimitiveLine[] = [];
  for (const { from, to, geometry } of pieces) {
    const piece = offsetPrimitive(from, to, geometry, offset);
    if (piece === null) {
      return null;
    }
    moved.push(piece);
  }
  return { pieces: moved };
}

/**
 * The corner the two lane lines make, or null where they cross behind a lane
 * end, or not at all (parallel, `lineCrossing`).
 *
 * - the exit's line run on: `K = exit + a·h`
 * - the entry's line run on from one step before it: `K = (entry − e) + s·e`
 *   → `b = |entry − K| = 1 − s` (unit `e`)
 * - `lineCrossing` gives both: `a = alongA`, `s = alongB`
 * - ahead of both: `a`, `b` over `SAME_POINT_METERS`. A corner within a
 *   centimeter of a lane end leaves no room to turn.
 */
function cornerOf(exit: Vec2, h: Vec2, entry: Vec2, e: Vec2): Corner | null {
  const crossing = lineCrossing(
    exit,
    { x: exit.x + h.x, z: exit.z + h.z },
    { x: entry.x - e.x, z: entry.z - e.z },
    entry,
  );
  if (crossing === null) {
    return null;
  }

  const a = crossing.alongA;
  const b = 1 - crossing.alongB;
  return a > SAME_POINT_METERS && b > SAME_POINT_METERS
    ? { exit, h, entry, e, k: crossing.point, a, b }
    : null;
}

/**
 * The radius of the widest turn round a corner that keeps clear of `curbs`,
 * up to `R_cap` (`maxRadius`), at most `RADIUS_TOLERANCE_METERS` short of the
 * limit. The one place it is found, so a closed form can take its place.
 *
 * - clear: `c` from every curb piece and corner (`clearOf`), and no corner
 *   passed (`hasPassed`)
 * - the arc and where it touches the lines scale about `K` with `R` → a
 *   larger `R` reaches only further into the inside of the turn, and only
 *   further from its outside; a corner once passed stays passed
 * - → once the smallest `R` tried is clear, `R` is clear up to a limit `R*`
 *   and never above it
 * - `R_cap` clear → `R_cap`
 * - the smallest `R` tried not clear → none is: the lane lines themselves
 *   run too close to a curb → `R_cap`
 * - otherwise halve `[lo, hi]`, `lo` clear and `hi` not, until they are
 *   within the tolerance → `lo`
 */
function largestFittingRadius(corner: Corner, curbs: Curbs): number {
  const isClear = (radius: number): boolean =>
    clearOf(turnAt(corner, radius), curbs) &&
    !curbs.corners.some((point) => hasPassed(corner, radius, point));

  const cap = maxRadius(corner);
  let lo = RADIUS_TOLERANCE_METERS;
  let hi = cap;
  if (hi <= lo || isClear(hi) || !isClear(lo)) {
    return cap;
  }
  while (hi - lo > RADIUS_TOLERANCE_METERS) {
    const middle = (lo + hi) / 2;
    if (isClear(middle)) {
      lo = middle;
    } else {
      hi = middle;
    }
  }
  return lo;
}

/**
 * Whether every piece of a connection keeps `CONNECTION_CLEARANCE_METERS`
 * from every curb piece and every corner.
 */
function clearOf({ pieces }: ConnectionLine, curbs: Curbs): boolean {
  return pieces.every(
    ({ from, to, geometry }) =>
      curbs.pieces.every(
        (curb) =>
          distanceBetweenLines(
            from,
            to,
            geometry,
            curb.from,
            curb.to,
            curb.geometry,
          ) >= CONNECTION_CLEARANCE_METERS,
      ) &&
      curbs.corners.every(
        (corner) =>
          distance(corner, nearestPointOnLine(from, to, geometry, corner)) >=
          CONNECTION_CLEARANCE_METERS,
      ),
  );
}

/**
 * Whether the turn round a corner with radius `R` has passed `point`: it
 * lies between `K` and the arc, where its distance to the turn grows again
 * as `R` does (`docs/lanes.md`, Shape).
 *
 * `σ = sign(h × e)`, the side the turn bends to, `+1` the right of `h`; `P`,
 * `Q` where the arc touches the lines (`touchingPoints`); `X = point`.
 *
 * - inside triangle `P K Q`:
 *   - the exit's line, bending side: `σ·(h × (X − P)) ≥ 0`
 *   - the entry's line, bending side: `σ·(e × (X − Q)) ≥ 0`
 *   - `K`'s side of the chord: `(Q − P) × (X − P)` and `(Q − P) × (K − P)`
 *     of one sign
 * - and outside the arc's circle:
 *
 *       M = P + σ·R·(−h.z, h.x),   |X − M| > R
 *
 * - triangle `P K Q` outside the circle is exactly the area between `K` and
 *   the arc: the arc bulges toward `K` from the chord
 */
function hasPassed(corner: Corner, radius: number, point: Vec2): boolean {
  const { h, e, k } = corner;
  const bend = Math.sign(cross(h, e));
  const { p, q } = touchingPoints(corner, radius);
  const center = {
    x: p.x - bend * radius * h.z,
    z: p.z + bend * radius * h.x,
  };
  const chord = difference(p, q);
  return (
    bend * cross(h, difference(p, point)) >= 0 &&
    bend * cross(e, difference(q, point)) >= 0 &&
    cross(chord, difference(p, point)) * cross(chord, difference(p, k)) >= 0 &&
    distance(point, center) > radius
  );
}

/**
 * `R_cap`: the widest turn round a corner that stays between the lane ends,
 * `T ≤ a` and `T ≤ b` (`turnAt`):
 *
 *     R_cap = min(a, b) / tan(θ/2)
 */
function maxRadius(corner: Corner): number {
  return Math.min(corner.a, corner.b) / tanHalfTurn(corner);
}

/**
 * The turn round a corner with radius `R`, up to `R_cap` (`maxRadius`):
 * straight on along `h` to `P`, an arc tangent to both lane lines from `P`
 * to `Q` (`touchingPoints`), straight on along `e`.
 *
 * - the arc leaves `P` along `h` and ends at `Q` (`arcViaLeaving`). A corner
 *   turns, `θ > 0` → `P`, `Q` and the arc are never in line. Only `R = 0`
 *   gives no arc: `P = Q = K`.
 * - the straights: exit to `P`, `Q` to entry. One within `SAME_POINT_METERS`
 *   is left out, its touching point merged into the lane end
 *   (`mergeIfSame`). `R_cap` always leaves out at least one.
 */
function turnAt(corner: Corner, radius: number): ConnectionLine {
  const { exit, h, entry } = corner;
  const touching = touchingPoints(corner, radius);
  const p = mergeIfSame(touching.p, exit);
  const q = mergeIfSame(touching.q, entry);
  const via = arcViaLeaving(p, h, q);

  const pieces: PrimitiveLine[] = [];
  if (p !== exit) {
    pieces.push({ from: exit, to: p, geometry: STRAIGHT });
  }
  pieces.push({
    from: p,
    to: q,
    geometry: via === null ? STRAIGHT : { kind: "arc", via },
  });
  if (q !== entry) {
    pieces.push({ from: q, to: entry, geometry: STRAIGHT });
  }
  return { pieces };
}

/**
 * Where the arc of radius `R` round a corner touches the lane lines: `P` on
 * the exit's, `Q` on the entry's.
 *
 * `θ = |φ|`, how far the connection turns; `M` the arc's center.
 *
 * - two tangents from one point to a circle are equally long → `T` from `K`
 *   to `P` and to `Q`
 * - triangle `K P M`: a right angle at `P` (radius ⊥ tangent); at `K` half of
 *   the angle between the lines, `(π − θ)/2`, as `KM` bisects it → `θ/2` at
 *   `M`:
 *
 *       T = R·tan(θ/2)
 *       P = K − T·h,   Q = K + T·e
 */
function touchingPoints(
  corner: Corner,
  radius: number,
): { readonly p: Vec2; readonly q: Vec2 } {
  const { h, e, k } = corner;
  const t = radius * tanHalfTurn(corner);
  return {
    p: { x: k.x - t * h.x, z: k.z - t * h.z },
    q: { x: k.x + t * e.x, z: k.z + t * e.z },
  };
}

/**
 * `tan(θ/2)`, `θ` how far a corner turns, from `h` to `e` either way.
 *
 * - unit `h`, `e`: `cos θ = h·e`, `sin θ = |h × e|`
 * - half-angle formula:
 *
 *       tan(θ/2) = sin θ / (1 + cos θ) = |h × e| / (1 + h·e)
 *
 * - a corner's lines are not parallel → `h × e ≠ 0`, `h ≠ −e` → over 0, and
 *   finite
 */
function tanHalfTurn({ h, e }: Corner): number {
  return Math.abs(cross(h, e)) / (1 + dot(h, e));
}

/** `u × v = u.x·v.z − u.z·v.x`: over 0 where `v` points right of `u`. */
function cross(u: Vec2, v: Vec2): number {
  return u.x * v.z - u.z * v.x;
}

/**
 * `end` itself where `point` is the same place (`isSamePoint`): the two
 * merge into one. Else `point`. `turnAt` tells a straight left out by `end`
 * coming back.
 */
function mergeIfSame(point: Vec2, end: Vec2): Vec2 {
  return isSamePoint(point, end) ? end : point;
}
