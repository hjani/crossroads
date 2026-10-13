import { arcViaLeaving } from "./arc";
import type { Crossing } from "./crossing";
import {
  isLineGeometryValid,
  lineCrossings,
  lineDirectionAt,
  lineFractionAt,
  lineLength,
  nearestPointOnLine,
  nearestPointsBetweenLines,
  offsetPrimitive,
  pointOnLine,
  STRAIGHT,
  subPrimitiveLineGeometry,
  trimPrimitive,
  type Line,
  type LineGeometry,
  type PrimitiveLine,
  type PrimitiveLineGeometry,
} from "./lineGeometry";
import { distance, isSamePoint, lerp, type Vec2 } from "./point";

/**
 * Biarcs as plane geometry: two pieces end to end, tangent where they meet,
 * so a line can leave one position in one direction and arrive at another
 * in another, smooth at both ends. See `docs/road-network.md`, Biarcs.
 */

/** Two pieces end to end, meeting at `join`. */
export interface Biarc {
  readonly join: Vec2;
  /** From the start to `join`. */
  readonly first: PrimitiveLineGeometry;
  /** From `join` to the end. */
  readonly second: PrimitiveLineGeometry;
}

/**
 * Whether a biarc can run from `from` to `to`: its join on neither end, so
 * each piece has a length, and each piece valid on its own. Tangency at the
 * join is not checked (`docs/road-network.md`, Biarcs).
 */
export function isBiarcValid(from: Vec2, to: Vec2, biarc: Biarc): boolean {
  const { join, first, second } = biarc;
  return (
    !isSamePoint(join, from) &&
    !isSamePoint(join, to) &&
    isLineGeometryValid(from, join, first) &&
    isLineGeometryValid(join, to, second)
  );
}

/** How long a biarc runs from `from` to `to`, in meters: both pieces. */
export function biarcLength(from: Vec2, to: Vec2, biarc: Biarc): number {
  return (
    lineLength(from, biarc.join, biarc.first) +
    lineLength(biarc.join, to, biarc.second)
  );
}

/** A biarc's two pieces with their own ends, first to second. */
export function biarcPrimitives(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
): readonly [PrimitiveLine, PrimitiveLine] {
  return [
    { from, to: biarc.join, geometry: biarc.first },
    { from: biarc.join, to, geometry: biarc.second },
  ];
}

/**
 * A biarc with `s₁` meters cut off its start and `s₂` off its end, measured
 * along it (`docs/road-layout.md`). With `L₁`, `L₂` the pieces' lengths:
 *
 * - `s₁ ≥ L₁` → the first piece is gone: the second, `s₁ − L₁` cut off its
 *   start and `s₂` off its end
 * - `s₂ ≥ L₂` → the same at the other end
 * - otherwise each cut off the piece at that end, the join kept
 *
 * `s₁ + s₂ > L` → what is left runs backwards, as a trimmed line does.
 */
export function trimBiarc(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  s1: number,
  s2: number,
): Line {
  const { join } = biarc;
  const firstLength = lineLength(from, join, biarc.first);
  const secondLength = lineLength(join, to, biarc.second);
  if (s1 >= firstLength) {
    return trimPrimitive(join, to, biarc.second, s1 - firstLength, s2);
  }
  if (s2 >= secondLength) {
    return trimPrimitive(from, join, biarc.first, s1, s2 - secondLength);
  }

  const first = trimPrimitive(from, join, biarc.first, s1, 0);
  const second = trimPrimitive(join, to, biarc.second, 0, s2);
  return {
    from: first.from,
    to: second.to,
    geometry: {
      kind: "biarc",
      biarc: { join, first: first.geometry, second: second.geometry },
    },
  };
}

/**
 * A biarc moved `offset` meters square to itself, to its right looking from
 * `from` toward `to` (`offsetLine`): each piece moved, `join` with them. Null
 * if either piece is.
 *
 * - tangent at `join` → one heading there, one normal → both pieces move
 *   `join` to the same place
 * - a moved piece keeps its heading at every point → still tangent at the
 *   moved `join`
 */
export function offsetBiarc(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  offset: number,
): Line | null {
  const first = offsetPrimitive(from, biarc.join, biarc.first, offset);
  const second = offsetPrimitive(biarc.join, to, biarc.second, offset);
  if (first === null || second === null) {
    return null;
  }
  return {
    from: first.from,
    to: second.to,
    geometry: {
      kind: "biarc",
      biarc: {
        join: first.to,
        first: first.geometry,
        second: second.geometry,
      },
    },
  };
}

/**
 * A biarc run the other way (`reverseLine`): ends and pieces swapped, `join`
 * kept. Each piece keeps its shape, as a line in one piece does.
 */
export function reverseBiarc(from: Vec2, to: Vec2, biarc: Biarc): Line {
  return {
    from: to,
    to: from,
    geometry: {
      kind: "biarc",
      biarc: { join: biarc.join, first: biarc.second, second: biarc.first },
    },
  };
}

/**
 * The shape of the part of a biarc between two places on it, `partFrom`
 * before `partTo` along it. A place off the biarc counts as where it
 * reaches it (`biarcFractionAt`).
 *
 * - Both on one piece, a place at `join` counting as on either → that
 *   piece's part.
 * - On different pieces → a biarc, `join` kept, of each piece's part.
 *
 * Each part is cut as a line in one piece is (`subPrimitiveLineGeometry`) →
 * a place a few millimeters off the curve can leave a kink as small at
 * `join`.
 */
export function subBiarc(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  partFrom: Vec2,
  partTo: Vec2,
): LineGeometry {
  const { join, first, second } = biarc;
  const m = joinFraction(from, to, biarc);
  const along = (place: Vec2): number =>
    biarcFractionAt(from, to, biarc, place);

  if (isSamePoint(partTo, join) || along(partTo) <= m) {
    return subPrimitiveLineGeometry(from, join, first, partFrom, partTo);
  }
  if (isSamePoint(partFrom, join) || along(partFrom) > m) {
    return subPrimitiveLineGeometry(join, to, second, partFrom, partTo);
  }
  return {
    kind: "biarc",
    biarc: {
      join,
      first: subPrimitiveLineGeometry(from, join, first, partFrom, join),
      second: subPrimitiveLineGeometry(join, to, second, join, partTo),
    },
  };
}

/**
 * The point a fraction `t` of the way along a biarc, 0 at `from` and 1 at
 * `to`, by length (`joinFraction`).
 */
export function pointOnBiarc(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  t: number,
): Vec2 {
  const { piece, along } = pieceAt(from, to, biarc, t);
  return pointOnLine(piece.from, piece.to, piece.geometry, along);
}

/**
 * Which way a biarc is heading a fraction `t` of the way along it, by length
 * (`joinFraction`), as a unit vector. At the join, the way the first piece
 * arrives.
 */
export function biarcDirectionAt(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  t: number,
): Vec2 {
  const { piece, along } = pieceAt(from, to, biarc, t);
  return lineDirectionAt(piece.from, piece.to, piece.geometry, along);
}

/**
 * Where along a biarc a place falls, 0 at `from` and 1 at `to`, by length
 * (`joinFraction`): read on the piece whose nearest point is nearer. A place
 * off the biarc reads as the nearest place on it.
 */
export function biarcFractionAt(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  place: Vec2,
): number {
  const m = joinFraction(from, to, biarc);
  const [first, second] = biarcPrimitives(from, to, biarc);
  const t1 = lineFractionAt(first.from, first.to, first.geometry, place);
  const t2 = lineFractionAt(second.from, second.to, second.geometry, place);
  const onFirst = pointOnLine(first.from, first.to, first.geometry, t1);
  const onSecond = pointOnLine(second.from, second.to, second.geometry, t2);
  return distance(place, onFirst) <= distance(place, onSecond)
    ? alongWhole(m, 0, t1)
    : alongWhole(m, 1, t2);
}

/**
 * The point on a biarc nearest `point`: the nearer of its two pieces'
 * nearest points. A point past either end gives that end.
 */
export function nearestPointOnBiarc(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  point: Vec2,
): Vec2 {
  const [first, second] = biarcPrimitives(from, to, biarc).map((piece) =>
    nearestPointOnLine(piece.from, piece.to, piece.geometry, point),
  );
  return distance(point, first) <= distance(point, second) ? first : second;
}

/**
 * The point on a biarc and on another line nearest each other, whichever
 * shape the other runs in, the biarc's first: the nearer of its two pieces'
 * pairs.
 */
export function nearestPointsBetweenBiarcAndLine(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  otherFrom: Vec2,
  otherTo: Vec2,
  other: LineGeometry,
): readonly [Vec2, Vec2] {
  const [first, second] = biarcPrimitives(from, to, biarc).map((piece) =>
    nearestPointsBetweenLines(
      piece.from,
      piece.to,
      piece.geometry,
      otherFrom,
      otherTo,
      other,
    ),
  );
  return distance(...first) <= distance(...second) ? first : second;
}

/**
 * Where a biarc meets another line, whichever shape the other runs in, with
 * `alongA` measured along the biarc by length (`joinFraction`). In no
 * particular order.
 *
 * Each piece is met on its own → a line through the join meets the biarc
 * there twice, once per piece.
 */
export function biarcCrossings(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  otherFrom: Vec2,
  otherTo: Vec2,
  other: LineGeometry,
): Crossing[] {
  const m = joinFraction(from, to, biarc);
  return biarcPrimitives(from, to, biarc).flatMap((piece, index) =>
    lineCrossings(
      piece.from,
      piece.to,
      piece.geometry,
      otherFrom,
      otherTo,
      other,
    ).map((crossing) => ({
      ...crossing,
      alongA: alongWhole(m, index, crossing.alongA),
    })),
  );
}

/**
 * Where the join falls along a biarc, as a fraction of its length.
 *
 * Fractions along a biarc are by length, as along an arc. With `L₁`, `L₂`
 * the two pieces' lengths:
 *
 *     m = L₁ / (L₁ + L₂)
 *
 * - `t` of the whole, `t ≤ m`: `t₁ = t/m` along the first piece
 * - `t` of the whole, `t > m`: `t₂ = (t − m)/(1 − m)` along the second
 * - back again (`alongWhole`): `t = m·t₁`, or `t = m + (1 − m)·t₂`
 *
 * A valid biarc's pieces both have a length → `0 < m < 1`, and neither
 * division is by zero.
 */
function joinFraction(from: Vec2, to: Vec2, biarc: Biarc): number {
  const first = lineLength(from, biarc.join, biarc.first);
  return first / (first + lineLength(biarc.join, to, biarc.second));
}

/** The piece `t` of the whole falls on, and how far along that piece. */
function pieceAt(
  from: Vec2,
  to: Vec2,
  biarc: Biarc,
  t: number,
): { readonly piece: PrimitiveLine; readonly along: number } {
  const m = joinFraction(from, to, biarc);
  const [first, second] = biarcPrimitives(from, to, biarc);
  return t <= m
    ? { piece: first, along: t / m }
    : { piece: second, along: (t - m) / (1 - m) };
}

/** `t` along piece `index` (0 the first), as a fraction of the whole. */
function alongWhole(m: number, index: number, t: number): number {
  return index === 0 ? m * t : m + (1 - m) * t;
}

/**
 * The biarc that leaves `from` in `leaving` and arrives at `to` heading in
 * `arriving`, its join placed so both pieces have the same tangent length.
 *
 * Returns null when there is none:
 * - `from` and `to` are the same point
 * - `leaving` and `arriving` are the same direction, and `to` is not ahead
 *   of `from` along it
 * - either direction is zero
 *
 * Let `t0`, `t1` be `leaving` and `arriving` as unit vectors, `v = to − from`,
 * `t = t0 + t1`, `c = 1 − t0·t1`, and `d` the tangent length.
 *
 * - A piece's tangents at its two ends meet at a corner, equally far from
 *   both ends (tangents from a point to a circle are equally long). With
 *   both pieces' tangent length `d`, the corners are
 *
 *       Q0 = from + d·t0,   Q1 = to − d·t1
 *
 * - Both pieces touch the line `Q0–Q1` at the join `J`: `d` past `Q0` and
 *   `d` before `Q1` → `J` is its midpoint and `|Q1 − Q0| = 2d`.
 * - `Q1 − Q0 = v − d·t` and `|t|² = 2 + 2·t0·t1 = 4 − 2c`. Squaring:
 *
 *       |v|² − 2d·(v·t) + d²·(4 − 2c) = 4d²
 *       2c·d² + 2(v·t)·d − |v|² = 0
 *
 * - `c ≥ 0` and `−|v|² < 0` → one positive root. Written so its two terms
 *   never cancel, which loses digits when they are close:
 *
 *       d = |v|² / ((v·t) + √((v·t)² + 2c·|v|²))      v·t ≥ 0
 *       d = (√((v·t)² + 2c·|v|²) − (v·t)) / 2c         v·t < 0
 *
 * - The join, and the heading there:
 *
 *       J = (Q0 + Q1) / 2,   heading Q1 − Q0
 *
 * - Each piece: the arc leaving its start along its heading there and
 *   ending at its far end (`arcViaLeaving`). A `via` on the chord's midpoint,
 *   within `SAME_POINT_METERS`, is a straight: three positions in a line
 *   make no arc.
 *
 * What follows:
 * - `d > 0` → each piece turns less than a half circle.
 * - Reversed (ends swapped, both directions turned around): `v → −v`,
 *   `t → −t`, so `v·t` and `c` stay → the same `d` and `J`, the pieces
 *   swapped.
 * - `c = 0`, the same heading at both ends: only the first form applies,
 *   `d = |v|² / 2(v·t)` — an S-curve, or a straight in two pieces when `to`
 *   is straight ahead. `v·t ≤ 0` leaves no root, and the zero check below
 *   is that case.
 * - Neither direction needs to be a unit vector.
 */
export function biarcBetween(
  from: Vec2,
  leaving: Vec2,
  to: Vec2,
  arriving: Vec2,
): Biarc | null {
  const leavingLength = Math.hypot(leaving.x, leaving.z);
  const arrivingLength = Math.hypot(arriving.x, arriving.z);
  const chordX = to.x - from.x;
  const chordZ = to.z - from.z;
  // |v|²
  const chordSquared = chordX * chordX + chordZ * chordZ;
  if (leavingLength === 0 || arrivingLength === 0 || chordSquared === 0) {
    return null;
  }

  // t0, t1
  const t0 = { x: leaving.x / leavingLength, z: leaving.z / leavingLength };
  const t1 = {
    x: arriving.x / arrivingLength,
    z: arriving.z / arrivingLength,
  };
  // v·t, and c — clamped, since rounding can take two equal directions a
  // little past 1 apart and the root below with them.
  const alongBoth = chordX * (t0.x + t1.x) + chordZ * (t0.z + t1.z);
  const c = Math.max(0, 1 - (t0.x * t1.x + t0.z * t1.z));

  const root = Math.sqrt(alongBoth * alongBoth + 2 * c * chordSquared);
  const denominator = alongBoth >= 0 ? alongBoth + root : 2 * c;
  if (denominator === 0) {
    return null;
  }
  const d =
    alongBoth >= 0
      ? chordSquared / denominator
      : (root - alongBoth) / denominator;

  const q0 = { x: from.x + d * t0.x, z: from.z + d * t0.z };
  const q1 = { x: to.x - d * t1.x, z: to.z - d * t1.z };
  const join = lerp(q0, q1, 0.5);
  const first = pieceLeaving(from, t0, join);
  const second = pieceLeaving(join, { x: q1.x - q0.x, z: q1.z - q0.z }, to);
  return first === null || second === null ? null : { join, first, second };
}

/**
 * The piece leaving `from` in `direction` and ending at `to`: an arc, or a
 * straight where the arc's midpoint is on the chord's. Null where
 * `arcViaLeaving` has no arc.
 */
function pieceLeaving(
  from: Vec2,
  direction: Vec2,
  to: Vec2,
): PrimitiveLineGeometry | null {
  const via = arcViaLeaving(from, direction, to);
  if (via === null) {
    return null;
  }
  return isSamePoint(via, lerp(from, to, 0.5))
    ? STRAIGHT
    : { kind: "arc", via };
}
