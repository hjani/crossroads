import { distance, isSamePoint, SAME_POINT_METERS } from "./geometry";
import {
  crossingsAlong,
  nearestNode,
  nodeWithin,
  positionOf,
  positionOfNode,
  type SectionCrossing,
} from "./queries";
import type { Endpoint, RoadNetwork } from "./RoadNetwork";
import type { NodeId, SectionId, Vec2 } from "./types";

/**
 * Edits that span more than one section.
 *
 * Outside `RoadNetwork` on purpose: the model stores nodes and sections and
 * keeps them structurally valid, while these compose its public calls into
 * a change that means something — a crossing becomes a junction. Nothing
 * here is privileged, and a caller could make the same calls itself.
 */

/**
 * The shortest a section may be, in meters.
 *
 * Not a tolerance but a judgment: anything shorter is not a road, it is
 * the residue of a click that nearly hit something. Every piece an edit
 * would leave is measured against it — the whole section included, when it
 * crosses nothing to be cut at.
 */
export const MIN_SECTION_LENGTH_METERS = 1;

/**
 * Splits a section at a point, and returns the node its halves meet at.
 *
 * A point that is the same place as one of the section's own endpoints
 * splits nothing and gives back that endpoint's node, so a road meeting
 * another where it already ends joins it rather than cutting it.
 */
export function splitSection(
  network: RoadNetwork,
  id: SectionId,
  at: Endpoint,
): NodeId {
  const section = network.getSection(id);
  if (section === undefined) {
    throw new Error(`Unknown section ${id}`);
  }

  const point = positionOf(network, at);
  if (isSamePoint(point, positionOfNode(network, section.from))) {
    return section.from;
  }
  if (isSamePoint(point, positionOfNode(network, section.to))) {
    return section.to;
  }

  // Both halves go in before the original comes out: the network discards a
  // node the moment its last section leaves, so removing first would take
  // the endpoints with it.
  const half = network.addSection(section.from, at);
  network.addSection(half.to, section.to);
  network.removeSection(id);
  return half.to;
}

/**
 * Adds a section, turning everything it crosses into a junction: each
 * section crossed is split at the crossing, and the new one into the pieces
 * between them.
 *
 * Returns the node at the `to` end, so a run of roads can carry on from it.
 * Returns null instead if the layout cannot be built cleanly, in which case
 * nothing was created or removed.
 */
export function addSectionWithCrossings(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
): NodeId | null {
  const crossings = crossingsAlong(network, from, to);
  if (!isFeasible(network, from, to, crossings)) {
    return null;
  }
  if (crossings.length === 0) {
    return network.addSection(from, to).to;
  }

  let previous = from;
  for (const crossing of crossings) {
    const atPrevious = isSamePoint(crossing.point, positionOf(network, previous));
    const junction = splitSection(
      network,
      crossing.section,
      splitPoint(network, crossing.point, atPrevious ? previous : to),
    );

    if (!atPrevious) {
      network.addSection(previous, junction);
    }
    previous = junction;
  }

  // The loop ran at least once, so `previous` is the junction it left. The
  // assertion states what the loop guarantees and the type cannot.
  const lastJunction = previous as NodeId;

  // Which is the answer already, if that crossing was the far end.
  const end = positionOf(network, to);
  if (isSamePoint(positionOfNode(network, lastJunction), end)) {
    return lastJunction;
  }
  return network.addSection(lastJunction, to).to;
}

/**
 * Where to split for a crossing: the crossing point, unless the network
 * already has a point there.
 *
 * `candidate` is the end of the new section the crossing might have landed
 * on, which wins because it is a position the user placed, and is not
 * necessarily a node yet. Failing that, an existing node in the same place
 * is used, so that two roads crossing the new one within a centimeter of
 * each other meet it at one node rather than at two beside each other.
 */
function splitPoint(
  network: RoadNetwork,
  point: Vec2,
  candidate: Endpoint,
): Endpoint {
  if (isSamePoint(point, positionOf(network, candidate))) {
    return candidate;
  }
  return nodeWithin(network, point, SAME_POINT_METERS)?.id ?? point;
}

/**
 * Whether the edit leaves a network worth building: every piece the new
 * section is cut into is a road, and every crossing falls somewhere a
 * junction can go. With nothing crossed, the single piece is the whole
 * section.
 *
 * Asked before anything is created, so a refusal costs the network nothing.
 */
function isFeasible(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
  crossings: readonly SectionCrossing[],
): boolean {
  let previous = positionOf(network, from);
  for (const crossing of crossings) {
    if (!isBuildablePiece(previous, crossing.point)) {
      return false;
    }
    if (!landsCleanly(network, crossing.point)) {
      return false;
    }
    previous = crossing.point;
  }

  return isBuildablePiece(previous, positionOf(network, to));
}

/**
 * Whether a crossing falls somewhere a junction can go: on an existing
 * node, or clear of every one of them.
 *
 * In between is a miss — the user was aiming at that node — and it is also
 * where a junction would leave a stub behind, since a node that close is
 * the end of some road. Asking for the nearest node covers the ends of the
 * section being crossed along with every other one.
 */
function landsCleanly(network: RoadNetwork, point: Vec2): boolean {
  const near = nearestNode(network, point, MIN_SECTION_LENGTH_METERS);
  return near === null || isSamePoint(near.position, point);
}

/**
 * A stretch between two split points is either no piece at all — the same
 * place twice, where a crossing lands on a point the section already has —
 * or a section long enough to be a road. In between is the near miss
 * nothing sensible can be made of.
 */
function isBuildablePiece(from: Vec2, to: Vec2): boolean {
  const length = distance(from, to);
  return length <= SAME_POINT_METERS || length >= MIN_SECTION_LENGTH_METERS;
}
