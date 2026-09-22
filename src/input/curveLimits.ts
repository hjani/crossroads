import { arcCircle } from "../core/geometry/arc";
import type { LineGeometry } from "../core/geometry/lineGeometry";
import type { Vec2 } from "../core/geometry/point";

/**
 * How tight the section tools let a road curve. The network builds any arc;
 * this is the tools' limit, see `docs/tools.md`.
 */

/** The tightest curve any road may take, in meters, however narrow. */
const GLOBAL_MIN_CURVE_RADIUS_METERS = 10;

/**
 * The tightest curve a road `roadWidth` meters wide may take: under half its
 * width, the arc has no inner edge.
 */
function minCurveRadius(roadWidth: number): number {
  return Math.max(GLOBAL_MIN_CURVE_RADIUS_METERS, roadWidth / 2);
}

/**
 * Whether a section from `from` to `to` curves tighter than a road
 * `roadWidth` meters wide may. A straight never does, and neither does an
 * arc with no circle — that one is the network's to refuse.
 */
export function isTooTight(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
  roadWidth: number,
): boolean {
  if (geometry.kind !== "arc") return false;

  const circle = arcCircle(from, to, geometry.via);
  return circle !== null && circle.radius < minCurveRadius(roadWidth);
}
