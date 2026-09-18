import {
  arcCircle,
  arcLength,
  circleCircleCrossings,
  lineCircleCrossings,
  type ArcCircle,
} from "../geometry/arc";
import { angleOf, distance, lerp, type Vec2 } from "../geometry/point";
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
  /** Along the centerline, in meters. */
  readonly length: number;
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
 * Let `N = at`, `w/2 = halfWidth`, `σ = side`, `d` the leg's direction, and
 * for an arc `R` its radius and `τ` the way it turns:
 *
 * - straight: the line through `N + σ·(w/2)·(−d.z, d.x)`, along `d`
 * - arc: the circle around the arc's center with radius
 *
 *       R − σ·τ·w/2
 *
 *   → the inner edge on the side the arc turns to; none where that is ≤ 0
 */
export function edgeOf(
  at: Vec2,
  leg: Leg,
  side: number,
  halfWidth: number,
): Edge | null {
  const { direction, arc } = leg;
  if (arc === null) {
    return {
      kind: "line",
      through: {
        x: at.x - side * halfWidth * direction.z,
        z: at.z + side * halfWidth * direction.x,
      },
      direction,
    };
  }

  const radius = arc.circle.radius - side * arc.turn * halfWidth;
  return radius > 0
    ? { kind: "circle", circle: { center: arc.circle.center, radius } }
    : null;
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
    length: distance(from, to),
    arc: null,
  };
  if (section.geometry.kind === "straight") {
    return straight;
  }

  const { via } = section.geometry;
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
  return {
    ...straight,
    length: arcLength(from, to, via),
    arc: { circle, turn },
  };
}
