import type { Vec2 } from "../core/geometry/points";

/**
 * Rounding a position onto the editing grid.
 *
 * The grid belongs to the input layer and to no tool in particular: every
 * tool that places a point rounds it the same way, or the same click would
 * land differently depending on which one was active. It reaches the model
 * as an ordinary position, indistinguishable from an unsnapped one — the
 * network itself stays gridless.
 */

/**
 * The spacing of the grid, in meters.
 *
 * Fixed rather than scaled with the zoom: the same click has to land on
 * the same point whatever view it was made from.
 */
export const GRID_PITCH_METERS = 5;

/** The grid point nearest a position. Lines run through the origin. */
export function snapToGrid(point: Vec2): Vec2 {
  return {
    x: Math.round(point.x / GRID_PITCH_METERS) * GRID_PITCH_METERS,
    z: Math.round(point.z / GRID_PITCH_METERS) * GRID_PITCH_METERS,
  };
}
