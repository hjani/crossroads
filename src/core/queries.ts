import type { RoadNetwork } from "./RoadNetwork";
import type { Node, Vec2 } from "./types";

/**
 * Geometric questions asked of the network from outside it.
 *
 * Separate from `RoadNetwork` on purpose: the class owns storage and
 * structural validity, and would otherwise become the home for every
 * calculation anyone needs. These read the model through its public API
 * and answer in world units — what the answer is *for*, and how close is
 * close enough, is the caller's business.
 */

/**
 * The node nearest a position, or null if none is within `maxDistance`
 * meters of it.
 *
 * A linear scan over every node. Fine at the scale the editor works at,
 * and the one place a spatial index would go if it stops being so.
 */
export function nearestNode(
  network: RoadNetwork,
  to: Vec2,
  maxDistance: number,
): Node | null {
  let nearest: Node | null = null;
  // Squared throughout, so the scan needs no square roots.
  let nearestDistance = maxDistance * maxDistance;

  for (const node of network.allNodes()) {
    const dx = node.position.x - to.x;
    const dz = node.position.z - to.z;
    const distance = dx * dx + dz * dz;
    if (distance <= nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }

  return nearest;
}
