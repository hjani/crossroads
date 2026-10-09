import {
  arcCircle,
  circleCircleCrossings,
  lineCircleCrossings,
  type ArcCircle,
} from "../geometry/arc";
import { STRAIGHT, type LineGeometry } from "../geometry/lineGeometry";
import {
  angleOf,
  distance,
  isSamePoint,
  lerp,
  unitDirection,
  type Vec2,
} from "../geometry/point";
import { lineCrossing } from "../geometry/segment";
import { sectionDirectionLeavingNode } from "../network/queries";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, Section } from "../network/types";

/**
 * A junction's legs and their edges: the geometry of the roads meeting one
 * node, as the junction rules (`junction.ts`) see them.
 *
 * Used only for junction geometry.
 */

/**
 * A leg of the junction: one section meeting the node, seen from the node.
 * (A T-junction has three legs.)
 */
export interface Leg {
  readonly section: Section;
  /** Unit vector, leaving the node. */
  readonly direction: Vec2;
  /**
   * `direction` as an angle. Only the differences between legs mean anything:
   * `inCounterclockwiseOrder` shifts it by whole turns.
   */
  readonly angle: number;
  /** Half the road's width: from the centerline to either edge, in meters. */
  readonly halfWidth: number;
  /**
   * The circle an arc runs on, and which way it turns leaving the node: +1
   * counterclockwise, −1 clockwise. Null for a straight.
   */
  readonly arc: { readonly circle: ArcCircle; readonly turn: number } | null;
}

/** A leg's edge, taken whole: it runs on past both ends of the section. */
export type Edge =
  | { readonly kind: "line"; readonly through: Vec2; readonly direction: Vec2 }
  | { readonly kind: "circle"; readonly circle: ArcCircle };

/**
 * How close two legs' directions have to be for their curvature, not their
 * angle, to decide which comes first counterclockwise.
 *
 * Where it matters: a road branching off tangentially. Both legs leave
 * the node the same way, so their angles are equal, but they are worked out
 * from different sections and differ by rounding. Which one is larger is
 * then chance.
 *
 * The problem it solves: in the wrong order, the gap between the two is taken
 * on the wrong side. Their edges on that side never cross, so neither is set
 * back, though the roads overlap for tens of meters.
 *
 * Why curvature is right, not just a tie-break. At distance `x` from the node,
 * with `α` a leg's angle and `κ` its signed curvature (`+` counterclockwise):
 *
 *     sideways offset ≈ α·x + κ·x²/2
 *
 * - two legs `Δα` apart in angle and `Δκ` in curvature: the curvature term
 *   wins beyond `x = 2·Δα/Δκ`
 * - at this tolerance and `R = 100 m`: beyond 0.2 mm → the curvature order is
 *   what the roads actually do
 * - rounding is far below it (around 1e-12)
 */
const SAME_DIRECTION_TOLERANCE_RADIANS = 1e-6;

/** The legs at a node, in counterclockwise order (`inCounterclockwiseOrder`). */
export function legsAt(network: RoadNetwork, node: NodeId): Leg[] {
  return inCounterclockwiseOrder(
    network
      .sectionsAt(node)
      .map((id) => legOf(network, network.getSection(id), node)),
  );
}

/**
 * A leg's edge on its `side` (+1 counterclockwise, −1 clockwise), or null for
 * the inner edge of an arc too tight to have one. `at` is the node's position.
 *
 * `offset` puts the line elsewhere than the curb: 0 is the centerline, and a
 * negative offset lies across it, on the other side.
 *
 * Let `N = at`, `h = offset` (the half-width `w/2` by default), `σ = side`,
 * `d` the leg's direction, and for an arc `R` its radius and `τ` the way it
 * turns:
 *
 * - straight: the line through `N + σ·h·(−d.z, d.x)`, along `d`
 * - arc: the circle around the arc's center with radius
 *
 *       R − σ·τ·h
 *
 *   → the inner edge on the side the arc turns to; none where that is ≤ 0
 */
export function edgeOf(
  at: Vec2,
  leg: Leg,
  side: number,
  offset = leg.halfWidth,
): Edge | null {
  const { direction, arc } = leg;
  if (arc === null) {
    return {
      kind: "line",
      through: {
        x: at.x - side * offset * direction.z,
        z: at.z + side * offset * direction.x,
      },
      direction,
    };
  }

  const radius = edgeRadiusOf(arc, side, offset);
  return radius > 0
    ? { kind: "circle", circle: { center: arc.circle.center, radius } }
    : null;
}

/**
 * The radius of the circle `offset` off an arc leg's centerline on its
 * `side`: `R − σ·τ·h`, the edge at `h = w/2`.
 */
function edgeRadiusOf(
  arc: NonNullable<Leg["arc"]>,
  side: number,
  offset: number,
): number {
  return arc.circle.radius - side * arc.turn * offset;
}

/**
 * Where the cut across a leg at `setback` meets its `side` edge (+1
 * counterclockwise, −1 clockwise) — one end of the roadway's end, and one
 * corner of the junction. `at` is the node's position.
 *
 * Let `N = at`, `s = setback`, `w/2` the leg's half-width, `σ = side`, `d`
 * the leg's direction, and for an arc `O` its center, `R` its radius and `τ`
 * the way it turns:
 *
 * - straight: the cut is perpendicular to `d`, so the point is `s` along it
 *   and `w/2` to the side:
 *
 *       N + s·d + σ·(w/2)·(−d.z, d.x)
 *
 * - arc: `s` is measured along the centerline, which has radius `R`, so the
 *   cut lies on the radius at
 *
 *       θ = τ·s/R
 *
 *   from `N` — the same `θ` `setbackThrough` reads back. With `u = N − O`
 *   turned by `θ`, and the edge at radius `R − σ·τ·w/2` (`edgeRadiusOf`):
 *
 *       O + ((R − σ·τ·w/2)/R)·turn(u, θ)
 *
 * The edge radius is not guarded against going negative: an arc tighter than
 * `w/2` has its ribbon folded over itself whatever we do here, and the
 * reflected point is where that fold is drawn.
 */
export function edgePointAt(
  at: Vec2,
  leg: Leg,
  side: number,
  setback: number,
): Vec2 {
  const { direction, arc, halfWidth } = leg;
  if (arc === null) {
    return {
      x: at.x + setback * direction.x - side * halfWidth * direction.z,
      z: at.z + setback * direction.z + side * halfWidth * direction.x,
    };
  }

  const { center, radius } = arc.circle;
  const turned = (arc.turn * setback) / radius;
  const sin = Math.sin(turned);
  const cos = Math.cos(turned);
  const ux = at.x - center.x;
  const uz = at.z - center.z;
  const scale = edgeRadiusOf(arc, side, halfWidth) / radius;

  return {
    x: center.x + scale * (ux * cos - uz * sin),
    z: center.z + scale * (ux * sin + uz * cos),
  };
}

/**
 * How a leg's `side` edge runs between two of its points: straight, or round
 * the edge's own circle.
 *
 * The `via` is the edge point halfway between them, which for a circle of
 * center `O` and radius `r` lies on the ray from `O` through the chord's
 * midpoint `m`:
 *
 *     via = O + r·unitDirection(O, m)
 *
 * That is the shorter way round, which is what these pieces are: two points
 * at most a leg's setback apart.
 *
 * Straight wherever there is no such circle — a straight leg, an arc too
 * tight for the edge to exist, or `m` at `O`, where the points are opposite
 * each other and neither way round is shorter.
 */
export function alongEdge(
  leg: Leg,
  side: number,
  from: Vec2,
  to: Vec2,
): LineGeometry {
  const { arc } = leg;
  if (arc === null) {
    return STRAIGHT;
  }

  const { center } = arc.circle;
  const radius = edgeRadiusOf(arc, side, leg.halfWidth);
  const middle = lerp(from, to, 0.5);
  if (radius <= 0 || isSamePoint(center, middle)) {
    return STRAIGHT;
  }

  const out = unitDirection(center, middle);
  return {
    kind: "arc",
    via: { x: center.x + radius * out.x, z: center.z + radius * out.z },
  };
}

/** Where two whole edges cross, in no particular order. */
export function edgeCrossings(a: Edge, b: Edge): Vec2[] {
  if (a.kind === "circle") {
    return b.kind === "circle"
      ? circleCircleCrossings(a.circle, b.circle)
      : edgeCrossings(b, a);
  }

  const aNext = {
    x: a.through.x + a.direction.x,
    z: a.through.z + a.direction.z,
  };
  if (b.kind === "circle") {
    return lineCircleCrossings(a.through, aNext, b.circle).map((t) =>
      lerp(a.through, aNext, t),
    );
  }

  const bNext = {
    x: b.through.x + b.direction.x,
    z: b.through.z + b.direction.z,
  };
  const crossing = lineCrossing(a.through, aNext, b.through, bNext);
  return crossing === null ? [] : [crossing.point];
}

/**
 * The point of a whole edge nearest `point` — where a circle about `point`
 * touches the edge, if one does.
 *
 * - line through `A` along the unit `d`: the foot of the perpendicular,
 *   `A + ((P − A)·d)·d`
 * - circle about `O` with radius `r`: straight out from `O` toward `P`,
 *   `O + r·unitDirection(O, P)`
 */
export function nearestOnEdge(edge: Edge, point: Vec2): Vec2 {
  if (edge.kind === "line") {
    const { through, direction } = edge;
    const along =
      (point.x - through.x) * direction.x + (point.z - through.z) * direction.z;
    return {
      x: through.x + along * direction.x,
      z: through.z + along * direction.z,
    };
  }

  const { center, radius } = edge.circle;
  const out = unitDirection(center, point);
  return { x: center.x + radius * out.x, z: center.z + radius * out.z };
}

/**
 * Whether `point` lies no farther toward a leg's `side` (+1 counterclockwise,
 * −1 clockwise) than its edge there, the edge carried on past both ends of
 * the section: on that edge, or anywhere on the road's side of it, past the
 * centerline and the other edge included. `at` is the node's position.
 *
 * How far `point` lies off the centerline toward `side`, with `N = at`,
 * `P = point`, `σ = side`, `d` the leg's direction, and for an arc `O` its
 * center, `R` its radius and `τ` the way it turns:
 *
 * - straight: along the normal `σ·(−d.z, d.x)`:
 *
 *       h = σ·(d × (P − N))
 *
 * - arc: toward `σ` the radius shrinks by `σ·τ` per meter (the edge at
 *   `R − σ·τ·w/2`, `edgeOf`):
 *
 *       h = σ·τ·(R − |P − O|)
 *
 * - no farther than the edge: `h ≤ w/2`
 */
export function isWithinEdge(
  at: Vec2,
  leg: Leg,
  side: number,
  point: Vec2,
): boolean {
  const { direction, arc, halfWidth } = leg;
  const off =
    arc === null
      ? side * (direction.x * (point.z - at.z) - direction.z * (point.x - at.x))
      : side *
        arc.turn *
        (arc.circle.radius - distance(arc.circle.center, point));
  return off <= halfWidth;
}

/**
 * How far along a leg's centerline its roadway ends, if the cut across it
 * passes through `point`; negative behind the node. `at` is the node's
 * position.
 *
 * A roadway ends with a cut straight across the road, square to it. Let
 * `N = at`, `P = point`, `d` the leg's direction, and for an arc `O` its
 * center, `R` its radius and `τ` the way it turns:
 *
 * - straight: the cut is perpendicular to `d` → the setback is how far `P` is
 *   along `d`:
 *
 *       s = (P − N)·d
 *
 * - arc: square to an arc means along a radius → the cut through `P` lies on
 *   the line from `O` through `P`. With `u = N − O`, `v = P − O`, and `θ` the
 *   turn from `u` to `v` in the arc's direction:
 *
 *       θ = τ·atan2(u × v, u·v)
 *       s = R·θ
 *
 *   `θ` is in `(−π, π]`: past a half turn counts as behind `N`. A setback that
 *   long would be more than half of any arc anyway.
 */
export function setbackThrough(at: Vec2, leg: Leg, point: Vec2): number {
  const { direction, arc } = leg;
  if (arc === null) {
    return (point.x - at.x) * direction.x + (point.z - at.z) * direction.z;
  }

  const { center, radius } = arc.circle;
  const ux = at.x - center.x;
  const uz = at.z - center.z;
  const vx = point.x - center.x;
  const vz = point.z - center.z;
  const turned = Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz);
  return radius * arc.turn * turned;
}

/**
 * The legs in counterclockwise order, starting after the widest gap, with
 * each `angle` unwrapped so that it grows along the list.
 *
 * For an arc leg, let `R` be its radius and `τ` the way it turns leaving the
 * node (`leg.arc.turn`: `+1` counterclockwise, `−1` clockwise).
 *
 * - legs within `SAME_DIRECTION_TOLERANCE_RADIANS` of each other: by signed
 *   curvature, smaller first → the one bending clockwise of the other comes
 *   first
 *
 *       κ = τ/R        (0 for a straight)
 *
 * - start after the widest gap: it is at least `2π/n` wide, so no two legs
 *   that close are split across the start and the end of the list
 * - unwrapped, with `α₀` the first leg's angle, so every angle is in
 *   `[α₀, α₀ + 2π)`:
 *
 *       α' = α₀ + ((α − α₀) mod 2π)
 */
function inCounterclockwiseOrder(legs: readonly Leg[]): Leg[] {
  const sorted = [...legs].sort((a, b) => a.angle - b.angle);
  const count = sorted.length;
  if (count < 2) {
    return sorted;
  }

  // The widest gap, after sorted[widest]. The last one wraps round.
  let widest = count - 1;
  let widestGap = sorted[0].angle + 2 * Math.PI - sorted[count - 1].angle;
  for (let i = 0; i + 1 < count; i++) {
    const gap = sorted[i + 1].angle - sorted[i].angle;
    if (gap > widestGap) {
      widest = i;
      widestGap = gap;
    }
  }

  const base = sorted[(widest + 1) % count].angle;
  return sorted
    .map((leg) => {
      const turned = leg.angle - base;
      return {
        ...leg,
        angle: base + (turned < 0 ? turned + 2 * Math.PI : turned),
      };
    })
    .sort((a, b) =>
      Math.abs(a.angle - b.angle) < SAME_DIRECTION_TOLERANCE_RADIANS
        ? curvatureOf(a) - curvatureOf(b)
        : a.angle - b.angle,
    );
}

/** A leg's signed curvature `κ = τ/R`, 0 for a straight. */
function curvatureOf(leg: Leg): number {
  return leg.arc === null ? 0 : leg.arc.turn / leg.arc.circle.radius;
}

function legOf(network: RoadNetwork, section: Section, node: NodeId): Leg {
  const direction = sectionDirectionLeavingNode(network, section, node);
  const from = network.getNode(section.from).position;
  const to = network.getNode(section.to).position;
  const straight = {
    section,
    direction,
    angle: angleOf(direction),
    halfWidth: section.profile.width / 2,
    arc: null,
  };
  if (section.centerlineGeometry.kind === "straight") {
    return straight;
  }

  const { via } = section.centerlineGeometry;
  const circle = arcCircle(from, to, via);
  if (circle === null) {
    // In line with its ends: the arc functions read it as a straight too.
    return straight;
  }
  // The arc turns toward its center: counterclockwise when the center lies
  // to the left of the direction, where d × (O − N) > 0.
  const at = network.getNode(node).position;
  const turn = Math.sign(
    direction.x * (circle.center.z - at.z) -
      direction.z * (circle.center.x - at.x),
  );
  return { ...straight, arc: { circle, turn } };
}
