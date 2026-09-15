import { arcViaLeaving } from "./arcs";
import { angleOf, isSamePoint, lerp } from "./points";
import {
  sectionDirectionAt,
  sectionDirectionLeavingNode,
  sectionFractionAt,
} from "./queries";
import type { RoadNetwork } from "./RoadNetwork";
import {
  STRAIGHT,
  type NodeId,
  type SectionGeometry,
  type SectionId,
  type Vec2,
} from "./types";

/**
 * The natural directions a new road is suggested to leave a location by.
 */

/**
 * One direction per section meeting the node: the way that section is heading
 * as it arrives, carried on past the node. That is the reverse of the way the
 * section leaves the node. Unit vectors pointing away from the node. Empty for
 * an unknown node.
 */
export function continuingDirectionsAt(
  network: RoadNetwork,
  node: NodeId,
): Vec2[] {
  return directionsLeavingNode(network, node).map(({ x, z }) => ({
    x: -x,
    z: -z,
  }));
}

/**
 * One direction per gap between neighboring sections at the node, splitting
 * it evenly, so a branch leaves as clear of the roads either side as it can.
 * At a straight through-node these are the two perpendiculars. Unit vectors
 * pointing away from the node, in no promised order. Empty for a node with
 * fewer than two sections, which has no gap between two roads.
 *
 * Worked in angles rather than by adding the directions either side of a gap:
 * that sum is zero across a gap of 180°, and across a wider one it points into
 * the narrower gap on the other side.
 */
export function bisectorDirectionsAt(
  network: RoadNetwork,
  node: NodeId,
): Vec2[] {
  const angles = directionsLeavingNode(network, node)
    .map(angleOf)
    .sort((a, b) => a - b);
  if (angles.length < 2) return [];

  return angles.map((angle, index) => {
    // The last gap wraps round, past the full turn, to the first section.
    const next =
      index + 1 < angles.length ? angles[index + 1] : angles[0] + 2 * Math.PI;
    const middle = (angle + next) / 2;
    return { x: Math.cos(middle), z: Math.sin(middle) };
  });
}

/**
 * Two directions per section meeting the node, perpendicular to it on either
 * side, for a turn off that road at a right angle. Unit vectors pointing away
 * from the node, in no promised order. Empty for an unknown node.
 *
 * At a straight through-node both sections give the same two, which are also
 * the bisectors there.
 */
export function perpendicularDirectionsAt(
  network: RoadNetwork,
  node: NodeId,
): Vec2[] {
  return directionsLeavingNode(network, node).flatMap(({ x, z }) => [
    { x: -z, z: x },
    { x: z, z: -x },
  ]);
}

/**
 * The directions at a place along a section rather than at either end of it:
 * the way the road heads there, forward and back, and the two directions square
 * to it. Unit vectors pointing away from `at`, in no promised order. Throws for
 * an unknown section.
 *
 * What a node there would be offered once the road is cut at it: two sections
 * heading opposite ways, carried on past it, and the two half-turn gaps between
 * them split.
 */
export function midSectionDirectionsAt(
  network: RoadNetwork,
  section: SectionId,
  at: Vec2,
): Vec2[] {
  const road = network.getSection(section);
  const { x, z } = sectionDirectionAt(
    network,
    road,
    sectionFractionAt(network, road, at),
  );
  return [
    { x, z },
    { x: -x, z: -z },
    { x: -z, z: x },
    { x: z, z: -x },
  ];
}

/**
 * The one of `directions` aimed most nearly along `toward`, or null where there
 * are no directions.
 *
 * Let `dᵢ` be each direction, and θᵢ the angle between `dᵢ` and `toward`.
 *
 * - `dᵢ·toward = |dᵢ| |toward| cos θᵢ`
 * - `|dᵢ| = 1` for every direction, and `|toward|` is the same for all of them,
 *   so the dot product orders them as cos θᵢ does.
 * - θᵢ is in 0..π, where cos is decreasing, so the smallest angle has the
 *   largest dot product:
 *
 *       nearest = argmax dᵢ·toward
 *
 * No angle or length is computed, and `toward` does not need to be a unit
 * vector. A tie keeps the first of the tied directions, which a zero `toward`
 * makes of all of them.
 */
export function nearestDirection(
  directions: readonly Vec2[],
  toward: Vec2,
): Vec2 | null {
  let nearest: Vec2 | null = null;
  let largestDot = -Infinity;
  for (const direction of directions) {
    const dot = direction.x * toward.x + direction.z * toward.z;
    if (dot > largestDot) {
      nearest = direction;
      largestDot = dot;
    }
  }
  return nearest;
}

/**
 * The shape of the road that leaves `from` in `direction` and ends at `to`:
 * an arc, or a straight where that arc bends too little to tell from one.
 *
 * Returns null where `arcViaLeaving` has no arc: `direction` points exactly
 * away from `to` (a full circle), `direction` is zero, or `from` is on `to`.
 *
 * Let `m = from + (to − from)/2` be the chord's midpoint.
 *
 * - `via = arcViaLeaving(from, direction, to)` is the arc's midpoint, so
 *   `|via − m|` is the sagitta: how far the arc bulges from its chord.
 * - A bulge of no more than a centimeter is a straight:
 *
 *       |via − m| ≤ SAME_POINT_METERS  →  STRAIGHT
 *
 * `direction` does not need to be a unit vector.
 *
 * Every sweep short of a full circle is answered, the long way round
 * included. Which of those are worth offering is the caller's to decide.
 *
 * The straight is load-bearing: three positions in a line make no arc, and
 * the network refuses one, so a direction aimed right at `to` would plan as a
 * refusal.
 */
export function geometryLeaving(
  from: Vec2,
  direction: Vec2,
  to: Vec2,
): SectionGeometry | null {
  const via = arcViaLeaving(from, direction, to);
  if (via === null) {
    return null;
  }

  return isSamePoint(via, lerp(from, to, 0.5))
    ? STRAIGHT
    : { kind: "arc", via };
}

/**
 * One direction per section meeting the node: the way that section leaves it.
 * The gaps between roads lie between these. Empty for an unknown node.
 */
function directionsLeavingNode(network: RoadNetwork, node: NodeId): Vec2[] {
  return network
    .sectionsAt(node)
    .map((id) =>
      sectionDirectionLeavingNode(network, network.getSection(id), node),
    );
}
