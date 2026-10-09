import { arcViaLeaving } from "./arc";
import { STRAIGHT, type LineGeometry } from "./lineGeometry";
import { isSamePoint, lerp, type Vec2 } from "./point";

/**
 * Biarcs as plane geometry: two pieces end to end, tangent where they meet,
 * so a line can leave one position in one direction and arrive at another
 * in another, smooth at both ends. See `docs/road-network.md`, Biarcs.
 */

/** Two pieces end to end, tangent at `join`. */
export interface Biarc {
  readonly join: Vec2;
  /** From the start to `join`. */
  readonly first: LineGeometry;
  /** From `join` to the end. */
  readonly second: LineGeometry;
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
): LineGeometry | null {
  const via = arcViaLeaving(from, direction, to);
  if (via === null) {
    return null;
  }
  return isSamePoint(via, lerp(from, to, 0.5))
    ? STRAIGHT
    : { kind: "arc", via };
}
