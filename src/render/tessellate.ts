import { arcCircle, arcPolyline } from "../core/geometry/arc";
import { isSamePoint, unitDirection, type Vec2 } from "../core/geometry/point";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { LineGeometry } from "../core/geometry/lineGeometry";
import type { Section } from "../core/network/types";

/**
 * The points a section is drawn along: its centerline, and the slices across
 * its ribbon.
 *
 * Shared by everything that draws sections rather than owned by one of them,
 * so a mark on a section lands on the same shape the section itself is drawn
 * in — a coarser one would visibly cut inside the road it marks.
 */

/**
 * How far a drawn arc may stray from the curve it stands for, in meters.
 *
 * A distance on the ground rather than on screen, so the geometry depends on
 * the network alone and is rebuilt only when the network changes. Zoom far
 * enough in and the chords do eventually show, which is where a tolerance
 * that follows `Viewport.metersPerPixel` would take over.
 */
const ARC_SAG_METERS = 0.05;

/**
 * The positions a section's centerline is drawn along: its two ends for a
 * straight, and enough points to pass for the curve for an arc.
 *
 * Where the two kinds stop differing. Everything past here works on points,
 * so an arc costs a drawing no more than a straight with a lot of ends.
 *
 * Named for the line it draws: a ribbon is a second drawing of a section
 * beside this one, not a replacement for it.
 */
export function centerline(
  network: RoadNetwork,
  section: Section,
): readonly Vec2[] {
  return centerlineBetween(
    network.getNode(section.from).position,
    network.getNode(section.to).position,
    section.centerlineGeometry,
  );
}

/**
 * The same shape, for a stretch of road the network does not have yet: a
 * piece of a plan, whose ends are positions rather than nodes.
 *
 * `centerline` is this with the nodes looked up first, and nothing else —
 * the two exist because one caller has a section and another has the
 * positions a section would be made from. A planned piece and the section
 * it becomes are the same two positions in the same geometry, so drawing
 * them any other way would move the preview under the click that commits
 * it.
 */
export function centerlineBetween(
  from: Vec2,
  to: Vec2,
  centerlineGeometry: LineGeometry,
): readonly Vec2[] {
  return centerlineGeometry.kind === "arc"
    ? arcPolyline(from, to, centerlineGeometry.via, ARC_SAG_METERS)
    : [from, to];
}

/**
 * A cut straight across a ribbon, from one edge to the other.
 *
 * `edgeA` is on the same edge in every slice of a section, so the ribbon
 * between two slices doesn't twist.
 */
export interface RibbonSlice {
  readonly edgeA: Vec2;
  readonly edgeB: Vec2;
}

/**
 * Slices across a section's ribbon, `widthMeters` wide, close enough together
 * that the edges stay within `ARC_SAG_METERS` of their curve.
 *
 * Each slice is `p ± (w/2)·n`: a centerline point `p`, the unit normal `n`
 * there, and `w = widthMeters`.
 *
 * Straight: a slice at each end, with `n = (d.z, −d.x)`, where
 * `d = unitDirection(from, to)`.
 *
 * Arc, with center `c` and radius `r`:
 *
 * - a chord over the angle α is at most `ρ·(1 − cos(α/2))` away from a
 *   circle of radius ρ
 * - → grows with ρ, so the outer edge, at radius `r + w/2`, is the worst
 * - → break up the centerline with the tolerance scaled down by
 *   `r / (r + w/2)`:
 *
 *       ARC_SAG_METERS · r / (r + w/2)
 *
 * - every point is on the circle, so the normal is the radius direction:
 *
 *       n = unitDirection(c, p)
 *
 * - → always outward, so `edgeA` is always the outer edge
 *
 * A `via` in line with the ends has no circle → sliced as a straight.
 *
 * Ends at the same place → no slices, and an error logged.
 */
export function ribbonSlicesBetween(
  from: Vec2,
  to: Vec2,
  centerlineGeometry: LineGeometry,
  widthMeters: number,
): readonly RibbonSlice[] {
  if (isSamePoint(from, to)) {
    console.error(
      `No ribbon for a section of no length, at (${from.x}, ${from.z})`,
    );
    return [];
  }
  if (centerlineGeometry.kind === "arc") {
    const circle = arcCircle(from, to, centerlineGeometry.via);
    if (circle !== null) {
      const sagMeters =
        (ARC_SAG_METERS * circle.radius) / (circle.radius + widthMeters / 2);
      return arcPolyline(from, to, centerlineGeometry.via, sagMeters).map((p) =>
        sliceAt(p, unitDirection(circle.center, p), widthMeters),
      );
    }
  }

  const d = unitDirection(from, to);
  const n = { x: d.z, z: -d.x };
  return [sliceAt(from, n, widthMeters), sliceAt(to, n, widthMeters)];
}

/** The slice through `p` along the unit normal `n`: `p ± (w/2)·n`. */
function sliceAt(p: Vec2, n: Vec2, w: number): RibbonSlice {
  const h = w / 2;
  return {
    edgeA: { x: p.x + h * n.x, z: p.z + h * n.z },
    edgeB: { x: p.x - h * n.x, z: p.z - h * n.z },
  };
}
