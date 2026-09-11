import { sectionDirectionAt } from "./queries";
import type { RoadNetwork } from "./RoadNetwork";
import type { NodeId, Vec2 } from "./types";

/**
 * The directions a new road could leave a node by.
 */

/**
 * One direction per section meeting the node: the way that section is heading
 * as it arrives, carried on past the node. Unit vectors pointing away from the
 * node. Empty for an unknown node.
 */
export function continuingDirectionsAt(
  network: RoadNetwork,
  node: NodeId,
): Vec2[] {
  return network.sectionsAt(node).map((id) => {
    const section = network.getSection(id);
    if (section === undefined) {
      throw new Error(`Unknown section ${id}`);
    }

    if (section.to === node) {
      return sectionDirectionAt(network, section, 1);
    }
    // Starting here, the section heads away into itself, so arriving along it
    // means heading the other way.
    const leaving = sectionDirectionAt(network, section, 0);
    return { x: -leaving.x, z: -leaving.z };
  });
}
