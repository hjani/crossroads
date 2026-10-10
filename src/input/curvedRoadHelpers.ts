import { lineSweep, type LineGeometry } from "../core/geometry/lineGeometry";
import { distance, type Vec2 } from "../core/geometry/point";
import {
  bisectorDirectionsAt,
  continuingDirectionsAt,
  midSectionDirectionsAt,
  nearestDirection,
  perpendicularDirectionsAt,
} from "../core/network/directions";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { Viewport } from "../render/Viewport";
import type { Placement } from "./sectionPointPlacement";
import { snapDirection } from "./toolHelpers";

/**
 * Code shared by the curve tools: the smart arc and the connector.
 */

/**
 * The furthest round a planned road may turn: three quarters of a circle, as
 * a loop ramp does. Past it, a direction pointing nearly back from the far end
 * gives a road circling almost all the way round to get there.
 */
const MAX_SWEEP_RADIANS = 1.5 * Math.PI;

/**
 * How far the cursor must get from the start before the way it went picks a
 * direction. In pixels, as the pick radius it has to be wider than: a flick
 * is a movement of the hand, the same size at every zoom.
 */
const CAPTURE_RADIUS_PIXELS = 40;

/**
 * What a flick's heading is snapped to where the start offers no direction of
 * its own: a multiple of 15°.
 */
const ARC_DIRECTION_STEP_RADIANS = Math.PI / 12;

/** The directions a road could leave a placement by. None on open ground. */
export function offeredDirections(network: RoadNetwork, at: Placement): Vec2[] {
  switch (at.kind) {
    case "node":
      return [
        ...continuingDirectionsAt(network, at.node),
        ...bisectorDirectionsAt(network, at.node),
        ...perpendicularDirectionsAt(network, at.node),
      ];
    case "section":
      return midSectionDirectionsAt(network, at.section, at.position);
    case "grid":
    case "free":
      return [];
  }
}

/**
 * The direction a cursor at `ground` picks for a road leaving `start`, or null
 * while it is still inside the capture circle around it: the offered direction
 * nearest the way from the start to the cursor. Open ground offers none, so
 * there it is that way itself, snapped by `snapArcDirection`.
 */
export function capturedDirection(
  viewport: Viewport,
  network: RoadNetwork,
  start: Placement,
  ground: Vec2,
): Vec2 | null {
  const from = start.position;
  if (
    distance(ground, from) <=
    CAPTURE_RADIUS_PIXELS * viewport.metersPerPixel
  ) {
    return null;
  }

  const heading = { x: ground.x - from.x, z: ground.z - from.z };
  return (
    nearestDirection(offeredDirections(network, start), heading) ??
    snapArcDirection(heading)
  );
}

/**
 * The direction a road lands in at `end`, when the cursor reaching it was
 * heading along `heading`, or null where `end` offers none (open ground).
 *
 * Let `dᵢ` be the directions offered at `end`, pointing away from it, and `h`
 * the heading.
 *
 * - A road arriving in `−dᵢ` is the road leaving in `dᵢ`, run backwards → the
 *   arrivals on offer are the `−dᵢ`.
 * - The nearest to `h` has the largest `(−dᵢ)·h = dᵢ·(−h)`, which is the `dᵢ`
 *   `nearestDirection` picks for `−h`:
 *
 *       arrival = −nearestDirection(dᵢ, −h)
 *
 * `heading` does not need to be a unit vector.
 */
export function arrivalDirection(
  network: RoadNetwork,
  end: Placement,
  heading: Vec2,
): Vec2 | null {
  const back = nearestDirection(offeredDirections(network, end), {
    x: -heading.x,
    z: -heading.z,
  });
  return back === null ? null : { x: -back.x, z: -back.z };
}

/**
 * Whether a road from `from` to `to` in `geometry` sweeps no further round
 * than `MAX_SWEEP_RADIANS` in all (`lineSweep`): an arc's one sweep, a
 * biarc's two added up.
 */
export function sweepsWithinLimit(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
): boolean {
  return lineSweep(from, to, geometry) <= MAX_SWEEP_RADIANS;
}

/** `snapDirection` to a multiple of `ARC_DIRECTION_STEP_RADIANS`. */
function snapArcDirection(toward: Vec2): Vec2 {
  return snapDirection(toward, ARC_DIRECTION_STEP_RADIANS);
}
