import { arcCircle } from "../geometry/arc";
import { lineFractionAt, pointOnLine } from "../geometry/lineGeometry";
import { distance, type Vec2 } from "../geometry/point";
import type { NodeId, SectionId } from "../network/types";
import type { Junction } from "./junction";
import type { RoadLayout } from "./RoadLayout";
import type { Roadway } from "./roadway";

/**
 * Which part of the layout contains a point on the ground.
 *
 * Exact: the ground a part contains is its own tolerance. How near is near
 * enough on screen is the caller's business.
 */

/** The part found at the given location. */
export type PickResult =
  | { readonly kind: "junction"; readonly node: NodeId }
  | { readonly kind: "roadway"; readonly section: SectionId };

/**
 * The part containing `point`, or null where no part does.
 *
 * Junctions are asked before roadways, and the first to contain the point
 * answers. Parts overlap only where a section is too short for its setbacks
 * (`docs/road-layout.md`).
 *
 * A point on a part's edge may go either way.
 *
 * A linear scan over every part, like `nearestNode` over every node.
 */
export function pick(layout: RoadLayout, point: Vec2): PickResult | null {
  for (const junction of layout.allJunctions()) {
    if (junctionContains(junction, point)) {
      return { kind: "junction", node: junction.node };
    }
  }
  for (const roadway of layout.allRoadways()) {
    if (roadwayContains(roadway, point)) {
      return { kind: "roadway", section: roadway.outline.section };
    }
  }
  return null;
}

/**
 * Whether a junction's ring covers `p`.
 *
 * Let `P` be the polygon through the pieces' points, and for an arc piece
 * from `a` to `b` through `v`, `S` its circular segment: the part of its
 * circle's disc on `v`'s side of the chord `ab`.
 *
 * - an arc piece differs from its chord by exactly `S`:
 *   - bulging out of `P` → the ring covers `P ∪ S`
 *   - bulging into `P` → the ring covers `P ∖ S`
 * - either way `p ∈ S` flips whether `p` is covered, so, counting even–odd:
 *
 *       covered = (p ∈ P) xor (p in an odd number of the S)
 *
 * - `p ∈ P`: a ray from `p` toward +x crosses `P`'s edges an odd number of
 *   times
 * - `p ∈ S`, with the circle `(c, r)`, and `×` the cross product:
 *
 *       |p − c| < r   and   (b − a) × (p − a) has the sign of (b − a) × (v − a)
 *
 * No arc is broken into chords, so a round join is picked against its true
 * curve. Two pieces on one line, as at a straight join, cover nothing. A dead
 * end's cut and cap give `P` no area, and the cap's `S` is the half disc.
 */
export function junctionContains(junction: Junction, p: Vec2): boolean {
  const { pieces } = junction.outline();
  let covered = false;
  pieces.forEach((piece, index) => {
    const a = pieces[index === 0 ? pieces.length - 1 : index - 1].point;
    const b = piece.point;
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < a.x + ((p.z - a.z) * (b.x - a.x)) / (b.z - a.z)
    ) {
      covered = !covered;
    }
    const geometry = piece.incomingGeometry;
    if (geometry.kind === "arc" && inCircularSegment(a, b, geometry.via, p)) {
      covered = !covered;
    }
  });
  return covered;
}

/**
 * Whether `p` lies in the circular segment of the arc `a`–`v`–`b`: inside its
 * circle, on `v`'s side of the chord. None for a `v` in line with the ends.
 */
function inCircularSegment(a: Vec2, b: Vec2, v: Vec2, p: Vec2): boolean {
  const circle = arcCircle(a, b, v);
  if (circle === null) {
    return false;
  }
  const side = (q: Vec2): number =>
    (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x);
  return distance(p, circle.center) < circle.radius && side(p) * side(v) > 0;
}

/**
 * Whether a roadway's band covers `p`: between its two end cuts, and within
 * `w/2` of its centerline.
 *
 * Let `t` be where along the centerline the place nearest `p` falls
 * (`lineFractionAt`), clamped to the ends, and `q` the centerline point at
 * `t`.
 *
 * - the end cuts are square to the road: across a straight, along a radius
 *   of an arc
 * - `t` is read the same way — by projection onto a straight, by direction
 *   from an arc's center — so `p` is between the cuts exactly where `t` was
 *   not clamped:
 *
 *       0 < t < 1
 *
 * - there `q` lies square across from `p`, so `|p − q|` is how far `p` is off
 *   the centerline:
 *
 *       |p − q| ≤ w/2
 *
 * A roadway of no length has no `t` strictly between its ends → covers
 * nothing.
 */
function roadwayContains(roadway: Roadway, p: Vec2): boolean {
  const { from, to, centerlineGeometry, widthMeters } = roadway.outline;
  const t = lineFractionAt(from, to, centerlineGeometry, p);
  if (t <= 0 || t >= 1) {
    return false;
  }

  const q = pointOnLine(from, to, centerlineGeometry, t);
  return distance(p, q) <= widthMeters / 2;
}
