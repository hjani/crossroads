import { nearestNode } from "../core/queries";
import type { Endpoint, RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import type { Viewport } from "../render/Viewport";
import { snapToGrid } from "./gridSnap";
import type { Modifiers } from "./Tool";

/**
 * Where a click puts one of the points a section is made of, shared by
 * every tool that draws one so that the same click means the same thing
 * whatever is being drawn.
 *
 * Two rules, because there are two kinds of point. An endpoint is a place
 * on the road, and welding it onto a node is how separately drawn roads
 * come to meet. A control point is not on the road network at all — it
 * says what the road between the endpoints does — so it snaps without ever
 * welding.
 */

/**
 * How close the cursor must look to a node to weld onto it. In pixels, so
 * the node is the same size of target at every zoom.
 *
 * A radius around a node, and nothing to do with the grid — the other way
 * a point is placed, which rounds each axis on its own and is measured in
 * meters (`GRID_PITCH_METERS`).
 */
const NODE_PICK_RADIUS_PIXELS = 12;

/**
 * Where a click puts an endpoint: how the point was arrived at, what the
 * model is told — an existing node once welded, a bare position otherwise
 * — and the point to draw it at, which is the node's own position when
 * the two differ.
 *
 * `kind` is what a tool reasons about; the endpoint alone cannot tell a
 * grid point from an unsnapped one, since both reach the model as a bare
 * position.
 */
export interface Placement {
  readonly kind: "node" | "grid" | "free";
  readonly endpoint: Endpoint;
  readonly position: Vec2;
}

/**
 * Decides where a ground position actually puts an endpoint.
 *
 * Welding beats the grid where both could apply — a grid point is never
 * a join. Ctrl skips the grid and nothing else: the cursor's own position
 * wherever there is nothing to weld onto, which is the only way to reach a
 * point no rule would produce. A point beside a node that must not join it
 * is placed by zooming in, since the pick radius is in pixels.
 */
export function placeEndpoint(
  network: RoadNetwork,
  viewport: Viewport,
  ground: Vec2,
  modifiers: Modifiers,
): Placement {
  const node = nearestNode(network, ground, nodePickRadiusMeters(viewport));
  if (node !== null) {
    return { kind: "node", endpoint: node.id, position: node.position };
  }

  if (modifiers.ctrl) {
    return { kind: "free", endpoint: ground, position: ground };
  }

  const snapped = snapToGrid(ground);
  return { kind: "grid", endpoint: snapped, position: snapped };
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
 * Whether two ground positions are close enough that a click at one of
 * them would weld onto a node at the other.
 */
export function withinNodePickRadius(
  viewport: Viewport,
  ground: Vec2,
  of: Vec2,
): boolean {
  const distance = Math.hypot(ground.x - of.x, ground.z - of.z);
  return distance <= nodePickRadiusMeters(viewport);
}

/** The weld radius as a distance on the ground, at the current zoom. */
function nodePickRadiusMeters(viewport: Viewport): number {
  return NODE_PICK_RADIUS_PIXELS * viewport.metersPerPixel;
}
