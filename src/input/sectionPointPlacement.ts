import { distance, SAME_POINT_METERS } from "../core/points";
import {
  crossingsAlong,
  nearestNode,
  nearestPointOnSection,
  nearestSection,
  nodeWithin,
} from "../core/queries";
import type { Endpoint, RoadNetwork } from "../core/RoadNetwork";
import { STRAIGHT, type Section, type Vec2 } from "../core/types";
import type { Viewport } from "../render/Viewport";
import { GRID_PITCH_METERS, snapToGrid } from "./gridSnap";
import type { Modifiers } from "./Tool";

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
 * How close the cursor must look to a node or a road to weld onto it. In
 * pixels, so either is the same size of target at every zoom. One radius for
 * both: a node is asked about first, so it wins over the road it sits on
 * without needing a larger one.
 *
 * A radius around the network, and nothing to do with the grid — the other
 * way a point is placed, which rounds each axis on its own and is measured
 * in meters (`GRID_PITCH_METERS`).
 */
const PICK_RADIUS_PIXELS = 12;

/**
 * Where a click puts an endpoint: how the point was arrived at, what the
 * model is told — an existing node once welded, a bare position otherwise
 * — and the point to draw it at, which is the node's own position when
 * the two differ.
 *
 * `kind` is what a tool reasons about; the endpoint alone cannot tell a
 * grid point from an unsnapped one, or either from a point on a road, since
 * all of them reach the model as a bare position.
 */
export interface Placement {
  readonly kind: "node" | "section" | "grid" | "free";
  readonly endpoint: Endpoint;
  readonly position: Vec2;
}

/**
 * Decides where a ground position actually puts an endpoint.
 *
 * Welding beats the grid where both could apply — a grid point is never
 * a join — and a node beats the road it sits on, since the end of a road is
 * where most joins are made. Ctrl skips only the grid snapping but not the
 * welding.
 */
export function placeEndpoint(
  network: RoadNetwork,
  viewport: Viewport,
  ground: Vec2,
  modifiers: Modifiers,
): Placement {
  const radius = pickRadiusMeters(viewport);

  const node = nearestNode(network, ground, radius);
  if (node !== null) {
    return { kind: "node", endpoint: node.id, position: node.position };
  }

  const section = nearestSection(network, ground, radius);
  if (section !== null) {
    const onRoad = nearestPointOnSection(network, section, ground);
    const position = modifiers.ctrl
      ? onRoad
      : roundAlongSection(network, section, onRoad, ground);

    // Rounding can land on a node of the road.
    const landedOn = nodeWithin(network, position, SAME_POINT_METERS);
    if (landedOn !== null) {
      return {
        kind: "node",
        endpoint: landedOn.id,
        position: landedOn.position,
      };
    }
    return { kind: "section", endpoint: position, position };
  }

  if (modifiers.ctrl) {
    return { kind: "free", endpoint: ground, position: ground };
  }

  const snapped = snapToGrid(ground);
  return { kind: "grid", endpoint: snapped, position: snapped };
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
 * point, or the cursor's own with Ctrl held.
 *
 * No welding, unlike an endpoint. A control point says what the road does
 * rather than where it ends, and a node that happens to be near the cursor
 * has no claim on the shape. It never becomes a node either, so there is
 * nothing for a `Placement` to say about it — a position is the whole
 * answer.
 */
export function placeControlPoint(ground: Vec2, modifiers: Modifiers): Vec2 {
  return modifiers.ctrl ? ground : snapToGrid(ground);
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
  const distance = Math.hypot(ground.x - of.x, ground.z - of.z);
  return distance <= pickRadiusMeters(viewport);
}

/** The weld radius as a distance on the ground, at the current zoom. */
function pickRadiusMeters(viewport: Viewport): number {
  return PICK_RADIUS_PIXELS * viewport.metersPerPixel;
}
