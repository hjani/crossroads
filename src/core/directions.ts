import { sectionDirectionAt } from "./queries";
import type { RoadNetwork } from "./RoadNetwork";
import type { NodeId, Vec2 } from "./types";

/**
 * The directions a new road could leave a node by.
 */

/**
 * One direction per section meeting the node: the way that section is heading
 * as it arrives, carried on past the node. That is the reverse of entering the
 * section from the node. Unit vectors pointing away from the node. Empty for an
 * unknown node.
 */
export function continuingDirectionsAt(
  network: RoadNetwork,
  node: NodeId,
): Vec2[] {
  return enteringDirectionsAt(network, node).map(({ x, z }) => ({
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
  const angles = enteringDirectionsAt(network, node)
    .map(({ x, z }) => Math.atan2(z, x))
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
 * One direction per section meeting the node: the way that section is entered
 * from the node, pointing into it. The gaps between roads lie between these.
 * Empty for an unknown node.
 */
function enteringDirectionsAt(network: RoadNetwork, node: NodeId): Vec2[] {
  return network.sectionsAt(node).map((id) => {
    const section = network.getSection(id);
    if (section.from === node) {
      return sectionDirectionAt(network, section, 0);
    }
    // Ending here, the section runs into the node, so entering it from the
    // node means heading the other way.
    const arriving = sectionDirectionAt(network, section, 1);
    return { x: -arriving.x, z: -arriving.z };
  });
}
