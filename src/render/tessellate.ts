import { arcCircle, arcPolyline } from "../core/geometry/arc";
import {
  distance,
  isSamePoint,
  unitDirection,
  type Vec2,
} from "../core/geometry/point";
import { distanceToLine } from "../core/geometry/segment";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { LineGeometry } from "../core/geometry/lineGeometry";
import type { Section } from "../core/network/types";
import type {
  JunctionOutline,
  Outline,
  OutlineEdgeKind,
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
    ? tessellateJunction(outline).map((vertex) => vertex.point)
    : tessellateRoadway(outline).map((vertex) => vertex.point);
}

/**
 * A point of a junction's fan, placed across the road its triangle is drawn
 * as a slice of (`docs/road-markings.md`, Through junctions).
 *
 * `side` and `halfWidth` mean what they do on a roadway: `side · halfWidth`
 * is the signed distance from that road's centerline, and `halfWidth` runs
 * from the centerline to the curb.
 */
export interface JunctionVertex {
  readonly point: Vec2;
  readonly side: number;
  readonly halfWidth: number;
}

/**
 * A junction as a fan: a triangle `N, a, b` from the center `N` out to each
 * pair of neighboring corners, the last pair wrapping back to the first.
 *
 * Each triangle is a slice of a road, by what the stretch `ab` borders:
 *
 * - roadway end → that roadway, carried on to `N`. The end is cut square
 *   across it, so `|ab|` is its width:
 *
 *       halfWidth = |ab| / 2,          side = +1 at a, −1 at b, 0 at N
 *
 *   - which end gets +1 doesn't matter: only `|side · halfWidth|` is read
 * - curb → a road with its centerline through `N`, parallel to `ab`:
 *
 *       halfWidth = dist(N, line ab),  side = 1 at a and b, 0 at N
 *
 * - `halfWidth` is the same at all three → `side · halfWidth` is a distance
 *   in meters across the whole triangle
 * - `N` on the line `ab` → `halfWidth = 0` → nothing marked
 *
 * The fan is how a junction is drawn, not what it is: on a tight arc beside a
 * sharp gap a triangle can flip over and pave a sliver of grass
 * (`docs/road-surface.md`, Limits). The surface is double-sided, so a flipped
 * triangle still draws.
 */
export function tessellateJunction(outline: JunctionOutline): JunctionVertex[] {
  const { center } = outline;
  const corners = junctionOutlineCorners(outline.pieces);
  return corners.flatMap((corner, i) => {
    const next = corners[(i + 1) % corners.length];
    const a = corner.point;
    const b = next.point;
    if (next.edge === "roadwayEnd") {
      const halfWidth = distance(a, b) / 2;
      return [
        { point: center, side: 0, halfWidth },
        { point: a, side: 1, halfWidth },
        { point: b, side: -1, halfWidth },
      ];
    }
    const halfWidth = distanceToLine(center, a, b);
    return [
      { point: center, side: 0, halfWidth },
      { point: a, side: 1, halfWidth },
      { point: b, side: 1, halfWidth },
    ];
  });
}

/**
 * A corner of a junction's drawn outline, and what the stretch arriving at it
 * borders.
 */
interface JunctionOutlineCorner {
  readonly point: Vec2;
  readonly edge: OutlineEdgeKind;
}

/**
 * The corners a junction's outline is drawn through, with its arcs broken into
 * chords.
 *
 * A piece runs from the piece before it — the last one for the first piece,
 * the outline being closed — and each drawn piece gives back both of its ends,
 * so every piece contributes all but its first point. Each chord borders
 * what its piece does.
 */
function junctionOutlineCorners(
  pieces: readonly OutlinePiece[],
): JunctionOutlineCorner[] {
  return pieces.flatMap((piece, index) => {
    const before = index === 0 ? pieces[pieces.length - 1] : pieces[index - 1];
    return polylineBetween(before.point, piece.point, piece.incomingGeometry)
      .slice(1)
      .map((point) => ({ point, edge: piece.edge }));
  });
}

/**
 * A point on one of a ribbon's two edges.
 *
 * `side` is `+1` on one edge and `−1` on the other. `along` is how far down
 * the ribbon its slice is, as a fraction of the length: `0` at `from`, `1`
 * at `to`.
 */
export interface RibbonVertex {
  readonly point: Vec2;
  readonly side: number;
  readonly along: number;
}

/**
 * A roadway as a strip: two triangles between each pair of neighboring
 * slices.
 */
export function tessellateRoadway(outline: RoadwayOutline): RibbonVertex[] {
  return tessellateRibbon(
    outline.from,
    outline.to,
    outline.centerlineGeometry,
    outline.widthMeters,
  );
}

/**
 * A strip following lineGeometry, `widthMeters` wide, broken into triangles.
 */
export function tessellateRibbon(
  from: Vec2,
  to: Vec2,
  lineGeometry: LineGeometry,
  widthMeters: number,
): RibbonVertex[] {
  const slices = ribbonSlicesBetween(from, to, lineGeometry, widthMeters);
  const triangles: RibbonVertex[] = [];
  for (let i = 1; i < slices.length; i++) {
    const back = slices[i - 1];
    const front = slices[i];
    const backA = { point: back.edgeA, side: 1, along: back.along };
    const backB = { point: back.edgeB, side: -1, along: back.along };
    const frontA = { point: front.edgeA, side: 1, along: front.along };
    const frontB = { point: front.edgeB, side: -1, along: front.along };
    triangles.push(backB, frontB, frontA);
    triangles.push(backB, frontA, backA);
  }
  return triangles;
}

/**
 * A cut straight across a ribbon, from one edge to the other.
 *
 * `edgeA` is on the same edge in every slice of a section, so the ribbon
 * between two slices doesn't twist. `along` is as on `RibbonVertex`.
 */
interface RibbonSlice {
  readonly edgeA: Vec2;
  readonly edgeB: Vec2;
  readonly along: number;
}

/**
 * Slices across a ribbon, `widthMeters` wide, with a level of detail that the
 * edges stay within `ARC_SAG_METERS` of their curve.
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
 * - `arcPolyline` steps the angle evenly, and arc length is `r · angle` →
 *   equal steps of length too → slice `i` of `k` chords is exactly at:
 *
 *       along = i / k
 *
 * A `via` in line with the ends has no circle → sliced as a straight, at
 * `along = 0` and `1`.
 *
 * Ends at the same place → no slices, and an error logged.
 */
function ribbonSlicesBetween(
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
      const points = arcPolyline(from, to, centerlineGeometry.via, sagMeters);
      const k = points.length - 1;
      return points.map((p, i) =>
        sliceAt(p, unitDirection(circle.center, p), widthMeters, i / k),
      );
    }
  }

  const d = unitDirection(from, to);
  const n = { x: d.z, z: -d.x };
  return [sliceAt(from, n, widthMeters, 0), sliceAt(to, n, widthMeters, 1)];
}

/** The slice through `p` along the unit normal `n`: `p ± (w/2)·n`. */
function sliceAt(p: Vec2, n: Vec2, w: number, along: number): RibbonSlice {
  const h = w / 2;
  return {
    edgeA: { x: p.x + h * n.x, z: p.z + h * n.z },
    edgeB: { x: p.x - h * n.x, z: p.z - h * n.z },
    along,
  };
}
