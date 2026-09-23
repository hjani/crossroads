import { distance, SAME_POINT_METERS, type Vec2 } from "../core/geometry/point";
import {
  crossingsAlong,
  nearestNode,
  nearestPointOnSection,
  nearestSection,
  nodeWithin,
} from "../core/network/queries";
import type { Endpoint, RoadNetwork } from "../core/network/RoadNetwork";
import { STRAIGHT } from "../core/geometry/lineGeometry";
import { junctionContains, pick } from "../core/layout/pick";
import type { RoadLayout } from "../core/layout/RoadLayout";
import {
  type Node,
  type NodeId,
  type Section,
  type SectionId,
} from "../core/network/types";
import type { Viewport } from "../render/Viewport";
import { GRID_PITCH_METERS, snapToGrid } from "./gridSnap";

/**
 * Where a click puts one of the points a section is made of, shared by
 * every tool that draws one so that the same click means the same thing
 * whatever is being drawn.
 *
 * Two rules, because there are two kinds of point. An endpoint is a place
 * on the road, and welding it onto a node or a road is how separately drawn
 * roads come to meet. A control point is not on the road network at all —
 * it says what the road between the endpoints does — so it snaps without
 * ever welding.
 */

/**
 * How close the cursor must look to a node or a road to weld onto it where
 * the ground it covers is out of reach — a junction enclosing no ground, a
 * road too thin on screen to aim inside. In pixels, so either is the same
 * size of target at every zoom. One radius for both: a node is asked about
 * first, so it wins over the road it sits on without needing a larger one.
 *
 * A radius around the network, and nothing to do with the grid — the other
 * way a point is placed, which rounds each axis on its own and is measured
 * in meters (`GRID_PITCH_METERS`).
 */
const PICK_RADIUS_PIXELS = 12;

/**
 * Where a section's end will be placed.
 *
 * `kind` is what a tool reasons about. A grid point, an unsnapped one and a
 * point on a road all reach the model as a bare position, which cannot tell
 * them apart.
 */
export type Placement =
  | {
      readonly kind: "node";
      readonly node: NodeId;
      readonly position: Vec2;
    }
  | {
      readonly kind: "section";
      readonly section: SectionId;
      readonly position: Vec2;
    }
  | {
      readonly kind: "grid" | "free";
      readonly position: Vec2;
    };

/**
 * An Endpoint for network planning, created from a Placement.
 */
export function endpointFrom(placement: Placement): Endpoint {
  return placement.kind === "node" ? placement.node : placement.position;
}

/**
 * Decides where a section's end at `ground` lands. The same order Inspect
 * picks in (`docs/tools.md`)..
 * First to answer wins:
 *
 * - a node within the pick radius
 * - the layout part the click is inside — a junction welds onto its node, a
 *   roadway onto its section
 * - a section within the pick radius
 * - else the grid, or `ground` itself without `useGrid`
 *
 * The area is the answer; the radii handle the case when the visible area is
 * too small. A node is asked first because its junction may enclose no ground
 * at all, as where two roads meet in line. A section is asked last because its
 * centerline runs on through the junction to the node, and would otherwise
 * take the junction's clicks.
 *
 * Welding beats the grid where both could apply — a grid point is never a
 * join. Turning `useGrid` off skips only the grid snapping, not the welding.
 */
export function placeSectionEnd(
  network: RoadNetwork,
  layout: RoadLayout,
  viewport: Viewport,
  ground: Vec2,
  { useGrid }: { useGrid: boolean },
): Placement {
  const radius = pickRadiusMeters(viewport);

  const node = nearestNode(network, ground, radius);
  if (node !== null) {
    return atNode(node);
  }

  const picked = pick(layout, ground);
  if (picked !== null) {
    return picked.kind === "junction"
      ? atNode(network.getNode(picked.node))
      : weldOntoSection(
          network,
          layout,
          network.getSection(picked.section),
          ground,
          useGrid,
        );
  }

  const section = nearestSection(network, ground, radius);
  if (section !== null) {
    return weldOntoSection(network, layout, section, ground, useGrid);
  }

  if (!useGrid) {
    return { kind: "free", position: ground };
  }

  return { kind: "grid", position: snapToGrid(ground) };
}

/** The placement welding onto an existing node. */
function atNode(node: Node): Placement {
  return { kind: "node", node: node.id, position: node.position };
}

/**
 * Where an end welding onto `section` lands, on its centerline:
 *  - with `useGrid`: at the nearest place the road crosses a grid line
 *  - else at the nearest place on the road.
 *
 * Landing inside one of the section's own junctions welds onto that node
 * instead.
 */
function weldOntoSection(
  network: RoadNetwork,
  layout: RoadLayout,
  section: Section,
  ground: Vec2,
  useGrid: boolean,
): Placement {
  const onRoad = nearestPointOnSection(network, section, ground);
  const position = useGrid
    ? roundAlongSection(network, section, onRoad, ground)
    : onRoad;

  // Check if position landed within one of the end junctions.
  for (const node of [section.from, section.to]) {
    if (junctionContains(layout.junctionAt(node), position)) {
      return atNode(network.getNode(node));
    }
  }

  // A junction covering no ground still has its node to land on.
  const landedOn = nodeWithin(network, position, SAME_POINT_METERS);
  if (landedOn !== null) {
    return atNode(landedOn);
  }
  return { kind: "section", section: section.id, position };
}

/**
 * Where a weld onto a road lands once rounded: the place nearest the cursor
 * where the road crosses a grid line. So points along a road are spaced by
 * the grid, whichever way the road runs.
 *
 * Only the edges of the grid cell holding `onRoad` are searched. The road
 * leaves that cell through its edges in both directions, so the nearest
 * crossing either way is on one of them. A road that ends inside the cell
 * may cross none, and keeps `onRoad`.
 */
function roundAlongSection(
  network: RoadNetwork,
  section: Section,
  onRoad: Vec2,
  ground: Vec2,
): Vec2 {
  const left = Math.floor(onRoad.x / GRID_PITCH_METERS) * GRID_PITCH_METERS;
  const top = Math.floor(onRoad.z / GRID_PITCH_METERS) * GRID_PITCH_METERS;
  const right = left + GRID_PITCH_METERS;
  const bottom = top + GRID_PITCH_METERS;
  const corners: Vec2[] = [
    { x: left, z: top },
    { x: right, z: top },
    { x: right, z: bottom },
    { x: left, z: bottom },
  ];

  let nearest = onRoad;
  let nearestDistance = Infinity;
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    for (const crossing of crossingsAlong(network, corner, next, STRAIGHT)) {
      if (crossing.section !== section.id) continue;

      const crossingDistance = distance(crossing.point, ground);
      if (crossingDistance < nearestDistance) {
        nearest = crossing.point;
        nearestDistance = crossingDistance;
      }
    }
  });
  return nearest;
}

/**
 * Decides where a ground position puts a control point: the nearest grid
 * point, or the cursor's own without `useGrid`.
 *
 * No welding, unlike an endpoint. A control point says what the road does
 * rather than where it ends, and a node that happens to be near the cursor
 * has no claim on the shape. It never becomes a node either, so there is
 * nothing for a `Placement` to say about it — a position is the whole
 * answer.
 */
export function placeControlPoint(
  ground: Vec2,
  { useGrid }: { useGrid: boolean },
): Vec2 {
  return useGrid ? snapToGrid(ground) : ground;
}

/**
 * Whether two ground positions are within the pick radius of each other:
 * close enough that a click at one would weld onto a node at the other.
 */
export function withinPickRadius(
  viewport: Viewport,
  ground: Vec2,
  of: Vec2,
): boolean {
  return distance(ground, of) <= pickRadiusMeters(viewport);
}

/** The weld radius as a distance on the ground, at the current zoom. */
function pickRadiusMeters(viewport: Viewport): number {
  return PICK_RADIUS_PIXELS * viewport.metersPerPixel;
}
