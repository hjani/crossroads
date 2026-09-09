import { arcArcCrossings, distanceToArc, segmentArcCrossings } from "./arcs";
import { isSamePoint } from "./points";
import {
  distanceToSegment,
  fromTheOtherSide,
  segmentCrossing,
  type Crossing,
} from "./segments";
import { isNodeId, type Endpoint, type RoadNetwork } from "./RoadNetwork";
import type {
  Node,
  NodeId,
  Section,
  SectionGeometry,
  SectionId,
  Vec2,
} from "./types";

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

/**
 * The section nearest a position, or null if none runs within
 * `maxDistance` meters of it.
 *
 * Distance to the section as it runs, not to its endpoints and not to the
 * line between them: a position beside the middle of a long road is near it,
 * and an arc is measured against its curve. Measured to the nearest place
 * along it, so a position past either end falls back to being near that end.
 *
 * A linear scan over every section, like `nearestNode` over every node, and
 * the same place a spatial index would go.
 */
export function nearestSection(
  network: RoadNetwork,
  to: Vec2,
  maxDistance: number,
): Section | null {
  let nearest: Section | null = null;
  let nearestDistance = maxDistance;

  for (const section of network.allSections()) {
    const distance = distanceToSection(network, section, to);
    if (distance <= nearestDistance) {
      nearest = section;
      nearestDistance = distance;
    }
  }

  return nearest;
}

/**
 * How far a position is from a section, in meters, whichever shape it runs
 * in.
 *
 * In meters rather than squared, unlike the scan in `nearestNode`: how far
 * an arc strays from its circle cannot be had without the square root that
 * finds the radius in the first place, so there is none to skip. One per
 * section is nothing beside the linear scan it sits in.
 */
function distanceToSection(
  network: RoadNetwork,
  section: Section,
  to: Vec2,
): number {
  const from = positionOfNode(network, section.from);
  const end = positionOfNode(network, section.to);

  return section.geometry.kind === "arc"
    ? distanceToArc(to, from, end, section.geometry.via)
    : distanceToSegment(to, from, end);
}

/**
 * Some node within `maxDistance` meters of a position, or null if there is
 * none.
 *
 * Stops at the first one it finds rather than weighing up the candidates,
 * which is what a caller asking "is there a node here" wants — and where
 * the distance is small enough that a second node could not also be in
 * range, there is nothing to weigh. Use `nearestNode` for a pick radius,
 * where several nodes can plausibly be in reach at once.
 */
export function nodeWithin(
  network: RoadNetwork,
  of: Vec2,
  maxDistance: number,
): Node | null {
  const limit = maxDistance * maxDistance;

  for (const node of network.allNodes()) {
    const dx = node.position.x - of.x;
    const dz = node.position.z - of.z;
    if (dx * dx + dz * dz <= limit) {
      return node;
    }
  }

  return null;
}

/**
 * Where a node is. Throws if the network does not have it, as `addSection`
 * does — an id held by anything reading the network is expected to be one
 * the network still knows.
 */
export function positionOfNode(network: RoadNetwork, id: NodeId): Vec2 {
  const node = network.getNode(id);
  if (node === undefined) {
    throw new Error(`Unknown node ${id}`);
  }
  return node.position;
}

/** Where an endpoint is, whether it names a node or carries a position. */
export function positionOf(network: RoadNetwork, endpoint: Endpoint): Vec2 {
  return isNodeId(endpoint) ? positionOfNode(network, endpoint) : endpoint;
}

/** A place where a section between two endpoints would cross an existing one. */
export interface SectionCrossing {
  readonly section: SectionId;
  readonly point: Vec2;
  /** 0 at the new section's start, 1 at its end. */
  readonly alongNew: number;
}

/**
 * Every existing section a new one from `from` to `to` would cross, in the
 * order they are met walking from `from`.
 *
 * A section can be met more than once, and so appears more than once: a
 * road drawn across a bend crosses it going in and coming out again.
 *
 * A place the new section is already joined on is not a crossing, and is
 * left out. That is a rule about the place rather than about the section
 * standing there — two roads sharing a node can still meet somewhere else
 * once either of them bends, and only the meeting at the shared node is the
 * join the caller is making.
 *
 * A linear scan over every section, like `nearestNode` over every node.
 */
export function crossingsAlong(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
  geometry: SectionGeometry,
): SectionCrossing[] {
  const start = positionOf(network, from);
  const end = positionOf(network, to);

  const crossings: SectionCrossing[] = [];
  for (const section of network.allSections()) {
    const met = shapesCrossing(
      start,
      end,
      geometry,
      positionOfNode(network, section.from),
      positionOfNode(network, section.to),
      section.geometry,
    );

    for (const crossing of met) {
      if (isCrossingAtJoin(network, from, to, section, crossing.point)) {
        continue;
      }
      crossings.push({
        section: section.id,
        point: crossing.point,
        alongNew: crossing.alongA,
      });
    }
  }

  crossings.sort((left, right) => left.alongNew - right.alongNew);
  return crossings;
}

/**
 * Where a stretch of road running one shape meets a stretch running
 * another, with `alongA` measured along the first of them. In no
 * particular order.
 *
 * The dispatch neither shape module can do: each answers for the shapes it
 * owns, and which pair is being asked about is the question left over. A
 * straight meeting an arc is one piece of math read from either end, so the
 * two mixed pairings share it and one of them turns the answer around.
 */
function shapesCrossing(
  from: Vec2,
  to: Vec2,
  geometry: SectionGeometry,
  otherFrom: Vec2,
  otherTo: Vec2,
  otherGeometry: SectionGeometry,
): Crossing[] {
  if (geometry.kind === "arc") {
    if (otherGeometry.kind === "arc") {
      return arcArcCrossings(
        from,
        to,
        geometry.via,
        otherFrom,
        otherTo,
        otherGeometry.via,
      );
    }
    return segmentArcCrossings(
      otherFrom,
      otherTo,
      from,
      to,
      geometry.via,
    ).map(fromTheOtherSide);
  }

  if (otherGeometry.kind === "arc") {
    return segmentArcCrossings(from, to, otherFrom, otherTo, otherGeometry.via);
  }

  const crossing = segmentCrossing(from, to, otherFrom, otherTo);
  return crossing === null ? [] : [crossing];
}

/**
 * Whether the crossing is exactly at the join of two sections.
 */
function isCrossingAtJoin(
  network: RoadNetwork,
  plannedFrom: Endpoint,
  plannedTo: Endpoint,
  crossed: Section,
  crossingPoint: Vec2,
): boolean {
  for (const node of [crossed.from, crossed.to]) {
    const shared = node === plannedFrom || node === plannedTo;
    if (shared && isSamePoint(crossingPoint, positionOfNode(network, node))) {
      return true;
    }
  }
  return false;
}
