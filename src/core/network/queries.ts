import { arcCircle } from "../geometry/arc";
import { distance, isSamePoint, type Vec2 } from "../geometry/point";
import { isNodeId, type Endpoint, type RoadNetwork } from "./RoadNetwork";
import {
  lineCrossings,
  lineDirectionAt,
  lineFractionAt,
  pointOnLine,
  primitivesOf,
  type LineGeometry,
} from "../geometry/lineGeometry";
import type { Node, NodeId, Section, SectionId } from "./types";

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
 * in: the distance to the nearest point on it.
 */
function distanceToSection(
  network: RoadNetwork,
  section: Section,
  to: Vec2,
): number {
  return distance(to, nearestPointOnSection(network, section, to));
}

/**
 * The point on a section nearest a position, whichever shape it runs in.
 *
 * It is the point `nearestSection` measures its distance to, so a section
 * found in range and the point placed on it agree. A position past either
 * end gives that end.
 */
export function nearestPointOnSection(
  network: RoadNetwork,
  section: Section,
  to: Vec2,
): Vec2 {
  const from = network.getNode(section.from).position;
  const end = network.getNode(section.to).position;
  const t = sectionFractionAt(network, section, to);

  return pointOnLine(from, end, section.centerlineGeometry, t);
}

/**
 * Where along a section a place falls, 0 at its `from` node and 1 at its `to`
 * — the `t` that `sectionDirectionAt` takes. Measured round the curve of an
 * arc, and a place off the section reads as the nearest place on it.
 */
export function sectionFractionAt(
  network: RoadNetwork,
  section: Section,
  place: Vec2,
): number {
  const from = network.getNode(section.from).position;
  const end = network.getNode(section.to).position;

  return lineFractionAt(from, end, section.centerlineGeometry, place);
}

/**
 * Which way a section is heading a fraction `t` of the way along it, 0 at
 * its `from` node and 1 at its `to`, as a unit vector pointing the way it
 * runs from one to the other. A straight heads the same way all along.
 */
export function sectionDirectionAt(
  network: RoadNetwork,
  section: Section,
  t: number,
): Vec2 {
  const from = network.getNode(section.from).position;
  const end = network.getNode(section.to).position;

  return lineDirectionAt(from, end, section.centerlineGeometry, t);
}

/**
 * Which way a section leaves one of its nodes, as a unit vector pointing away
 * from the node and into the section — along the tangent, for an arc. Throws
 * for a section that does not meet the node.
 */
export function sectionDirectionLeavingNode(
  network: RoadNetwork,
  section: Section,
  node: NodeId,
): Vec2 {
  if (section.from === node) {
    return sectionDirectionAt(network, section, 0);
  }
  if (section.to !== node) {
    throw new Error(`Section ${section.id} does not meet node ${node}`);
  }
  // Ending here, the section runs into the node, so leaving the node along it
  // means heading the other way.
  const arriving = sectionDirectionAt(network, section, 1);
  return { x: -arriving.x, z: -arriving.z };
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
 * The radii a section's centerline bends at, in meters, one per arc in the
 * order they run from its `from` node: none for a straight, one for an arc,
 * two for a biarc — fewer where a piece of it is straight.
 */
export function sectionRadii(network: RoadNetwork, section: Section): number[] {
  const pieces = primitivesOf(
    network.getNode(section.from).position,
    network.getNode(section.to).position,
    section.centerlineGeometry,
  );
  return pieces.flatMap(({ from, to, geometry }) => {
    const circle =
      geometry.kind === "arc" ? arcCircle(from, to, geometry.via) : null;
    return circle === null ? [] : [circle.radius];
  });
}

/** Where an endpoint is, whether it names a node or carries a position. */
export function positionOf(network: RoadNetwork, endpoint: Endpoint): Vec2 {
  return isNodeId(endpoint) ? network.getNode(endpoint).position : endpoint;
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
  centerlineGeometry: LineGeometry,
): SectionCrossing[] {
  const start = positionOf(network, from);
  const end = positionOf(network, to);

  const crossings: SectionCrossing[] = [];
  for (const section of network.allSections()) {
    const met = lineCrossings(
      start,
      end,
      centerlineGeometry,
      network.getNode(section.from).position,
      network.getNode(section.to).position,
      section.centerlineGeometry,
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
    if (shared && isSamePoint(crossingPoint, network.getNode(node).position)) {
      return true;
    }
  }
  return false;
}
