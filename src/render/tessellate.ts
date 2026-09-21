import { arcCircle, arcPolyline } from "../core/geometry/arc";
import { isSamePoint, unitDirection, type Vec2 } from "../core/geometry/point";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { LineGeometry } from "../core/geometry/lineGeometry";
import type { Section } from "../core/network/types";
import type {
  JunctionOutline,
  Outline,
  OutlinePiece,
  RoadwayOutline,
} from "../core/layout/outline";

/**
 * Splits up geometry into primitives: a line broken into chords, and the ground an
 * outline covers broken into triangles.
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
  return polylineBetween(
    network.getNode(section.from).position,
    network.getNode(section.to).position,
    section.centerlineGeometry,
  );
}

/**
 * The positions any line is drawn along, between two ends: the ends
 * themselves for a straight, and enough points to pass for the curve for an
 * arc.
 *
 * Named for what it makes rather than for what it draws, because it draws
 * several things: a section's centerline through `centerline`, a stretch of
 * a plan the network does not have yet, and a junction's outline.
 *
 * `centerline` is this with the nodes looked up first, and nothing else —
 * the two exist because one caller has a section and another has the
 * positions a section would be made from. A planned piece and the section
 * it becomes are the same two positions in the same geometry, so drawing
 * them any other way would move the preview under the click that commits
 * it.
 */
export function polylineBetween(
  from: Vec2,
  to: Vec2,
  lineGeometry: LineGeometry,
): readonly Vec2[] {
  return lineGeometry.kind === "arc"
    ? arcPolyline(from, to, lineGeometry.via, ARC_SAG_METERS)
    : [from, to];
}

/**
 * The ground an outline covers, as triangles: a flat list, every three points
 * one triangle.
 *
 * Each kind is filled the way its shape allows — a junction fanned from its
 * center, a roadway as a strip along its centerline.
 */
export function tessellateOutline(outline: Outline): Vec2[] {
  return outline.kind === "junction"
    ? tessellateJunctionOutline(outline)
    : tessellateRoadwayOutline(outline);
}

/**
 * A junction as a fan: a triangle from the center out to each pair of
 * neighboring corners, the last pair wrapping back to the first.
 *
 * The fan is how a junction is drawn, not what it is: on a tight arc beside a
 * sharp gap a triangle can flip over and pave a sliver of grass
 * (`docs/road-surface.md`, Limits). The surface is double-sided, so a flipped
 * triangle still draws.
 */
function tessellateJunctionOutline(outline: JunctionOutline): Vec2[] {
  const { center } = outline;
  const corners = outlineCorners(outline.pieces);
  return corners.flatMap((corner, i) => [
    center,
    corner,
    corners[(i + 1) % corners.length],
  ]);
}

/**
 * The corners a junction's outline is drawn through, with its arcs broken into
 * chords.
 *
 * A piece runs from the piece before it — the last one for the first piece,
 * the outline being closed — and each drawn piece gives back both of its ends,
 * so every piece contributes all but its first point.
 */
function outlineCorners(pieces: readonly OutlinePiece[]): Vec2[] {
  return pieces.flatMap((piece, index) => {
    const before = index === 0 ? pieces[pieces.length - 1] : pieces[index - 1];
    return polylineBetween(
      before.point,
      piece.point,
      piece.incomingGeometry,
    ).slice(1);
  });
}

/**
 * A roadway as a strip: two triangles between each pair of neighboring
 * slices.
 */
function tessellateRoadwayOutline(outline: RoadwayOutline): Vec2[] {
  const slices = ribbonSlicesBetween(outline);
  const triangles: Vec2[] = [];
  for (let i = 1; i < slices.length; i++) {
    const back = slices[i - 1];
    const front = slices[i];
    triangles.push(back.edgeB, front.edgeB, front.edgeA);
    triangles.push(back.edgeB, front.edgeA, back.edgeA);
  }
  return triangles;
}

/**
 * A cut straight across a ribbon, from one edge to the other.
 *
 * `edgeA` is on the same edge in every slice of a section, so the ribbon
 * between two slices doesn't twist.
 */
interface RibbonSlice {
  readonly edgeA: Vec2;
  readonly edgeB: Vec2;
}

/**
 * Slices across a roadway's ribbon, `widthMeters` wide, close enough together
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
function ribbonSlicesBetween(outline: RoadwayOutline): readonly RibbonSlice[] {
  const { from, to, centerlineGeometry, widthMeters } = outline;
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
