import * as THREE from "three";
import { arcCircle, arcPolyline } from "../core/geometry/arc";
import {
  difference,
  distance,
  dot,
  isSamePoint,
  lerp,
  signedArea,
  unitDirection,
  type Vec2,
} from "../core/geometry/point";
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
 */
export function tessellateOutline(outline: Outline): Vec2[] {
  return outline.kind === "junction"
    ? tessellateJunction(outline).map((vertex) => vertex.point)
    : tessellateRoadway(outline).map((vertex) => vertex.point);
}

/**
 * A point of a junction's triangles, placed across the road its triangle is
 * drawn as a slice of (`docs/road-markings.md`, Through junctions).
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
 * How far in from a junction's outline its strip reaches, in meters. Past
 * the edge line's inner side, `EDGE_INSET + LINE_WIDTH` in
 * roadSurface.frag.glsl, with room for a pixel of the line's smoothing.
 */
const STRIP_DEPTH_METERS = 0.5;

/**
 * A junction as a strip along its outline plus a fill
 * (`docs/road-tessellation.md`, Junctions):
 *
 * 1. the outline's corners, its arcs broken into chords
 *    (`junctionOutlineCorners`)
 * 2. the straight stretches between them, each with the line its edge line
 *    keeps its distance from (`outlineStretches`)
 * 3. the outline moved in by `STRIP_DEPTH_METERS` (`movedCorners`)
 * 4. two triangles between each stretch and its moved copy: the strip, which
 *    carries the edge line (`stripTriangles`)
 * 5. the moved outline, triangulated by earcut: the fill, which carries none
 *    (`fillTriangles`)
 *
 * An outline of fewer than three corners covers no ground → no triangles.
 */
export function tessellateJunction(outline: JunctionOutline): JunctionVertex[] {
  const corners = junctionOutlineCorners(outline.pieces);
  if (corners.length < 3) return [];
  const stretches = outlineStretches(corners);
  const moved = movedCorners(stretches, STRIP_DEPTH_METERS);
  return [
    ...stripTriangles(stretches, moved, STRIP_DEPTH_METERS),
    ...fillTriangles(moved, STRIP_DEPTH_METERS),
  ];
}

/**
 * A straight stretch of a junction's outline, from `a` to `b`, with the line
 * its edge line keeps its distance from at each end, given as the unit normal
 * pointing into the junction:
 *
 * - curb: the stretch's own line, the same at both ends
 * - roadway end: that road's edge at each end. The cut is square to the
 *   road, so the normal is the cut's own direction, toward its other end.
 */
interface OutlineStretch {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly edge: OutlineEdgeKind;
  readonly normalAtA: Vec2;
  readonly normalAtB: Vec2;
}

/**
 * The stretches between neighboring corners: stretch `i` ends at corner `i`.
 *
 * Which side is inside comes from the ring's signed area, not from
 * `Junction.outline` promising counterclockwise, so an outline running
 * backwards still gets normals that agree with each other.
 */
function outlineStretches(
  corners: readonly JunctionOutlineCorner[],
): OutlineStretch[] {
  const turn = signedArea(corners.map((corner) => corner.point)) < 0 ? -1 : 1;
  return corners.map((corner, i) => {
    const a = corners[(i + corners.length - 1) % corners.length].point;
    const b = corner.point;
    const along = unitDirection(a, b);
    if (corner.edge === "roadwayEnd") {
      const back = { x: -along.x, z: -along.z };
      return { a, b, edge: corner.edge, normalAtA: along, normalAtB: back };
    }
    const inward = { x: -turn * along.z, z: turn * along.x };
    return { a, b, edge: corner.edge, normalAtA: inward, normalAtB: inward };
  });
}

/** The outline moved in; see `movedCorners`. */
interface MovedCorners {
  /** Where each stretch's end moves to: stretch `i` ends at `points[i]`. */
  readonly points: readonly Vec2[];
  /** Whether each stretch is kept: a dropped one has both ends at one point. */
  readonly kept: readonly boolean[];
}

/**
 * The outline moved in by `depth`: the moved copy of stretch `i` runs from
 * `points[i − 1]` to `points[i]`.
 *
 * Symbols: `v` a corner, `n₁` and `n₂` the inward unit normals of the two
 * lines meeting there (`normalAtB` of the stretch ending at `v`, `normalAtA`
 * of the one starting there), `d` the depth.
 *
 * - the moved corner `p` is `d` from both lines, on their inner side:
 *
 *       n₁·(p − v) = d,   n₂·(p − v) = d
 *
 * - the conditions are symmetric in `n₁`, `n₂` → `p − v = k·(n₁ + n₂)`, and
 *   then `n₁·(p − v) = k·(1 + n₁·n₂) = d`:
 *
 *       p = v + d·(n₁ + n₂) / (1 + n₁·n₂)
 *
 *   - `p` is on the corner's bisector, `d` from both lines → the two strip
 *     quads meeting at `v` share the edge `vp`, and their edge lines meet on
 *     it in a clean miter
 *   - `n₁ = n₂`, one line through the corner: `p = v + d·n₁`
 *   - `n₁·n₂ → −1`, the outline folding back on itself: no such point, taken
 *     as `v + d·n₁`
 * - a short stretch next to a corner that turns inward can come out running
 *   backwards, from `a′` to `b′`:
 *
 *       (b′ − a′)·(b − a) < 0
 *
 *   It is dropped, and the moved lines of its kept neighbors meet directly.
 *   With `qᵢ` a point of each line and `cᵢ = nᵢ·qᵢ + d`, that is where
 *   `n₁·p = c₁` and `n₂·p = c₂`. By Cramer's rule, with
 *   `D = n₁.x·n₂.z − n₁.z·n₂.x`:
 *
 *       p = ((c₁·n₂.z − c₂·n₁.z) / D,  (n₁.x·c₂ − n₂.x·c₁) / D)
 *
 *   - `D = 0`, parallel lines: the midpoint of the two moved points instead
 *   - repeated until no stretch runs backwards, keeping at least three
 */
function movedCorners(
  stretches: readonly OutlineStretch[],
  depth: number,
): MovedCorners {
  const count = stretches.length;
  const next = (i: number) => (i + 1) % count;
  const previous = (i: number) => (i + count - 1) % count;
  const points = stretches.map((stretch, i) =>
    miterPoint(
      stretch.b,
      stretch.normalAtB,
      stretches[next(i)].normalAtA,
      depth,
    ),
  );
  const kept = stretches.map(() => true);
  const runsBackwards = (i: number) => {
    const { a, b } = stretches[i];
    const moved = difference(points[previous(i)], points[i]);
    return dot(moved, difference(a, b)) < 0;
  };

  for (let left = count; left > 3; left--) {
    const dropped = kept.findIndex((isKept, i) => isKept && runsBackwards(i));
    if (dropped < 0) break;
    kept[dropped] = false;
    let before = previous(dropped);
    while (!kept[before]) before = previous(before);
    let after = next(dropped);
    while (!kept[after]) after = next(after);
    const meeting =
      movedLinesCrossing(
        stretches[before].b,
        stretches[before].normalAtB,
        stretches[after].a,
        stretches[after].normalAtA,
        depth,
      ) ?? lerp(points[before], points[previous(after)], 0.5);
    for (let i = before; i !== after; i = next(i)) points[i] = meeting;
  }
  return { points, kept };
}

/** The point `depth` in from both lines through `v`; see `movedCorners`. */
function miterPoint(v: Vec2, n1: Vec2, n2: Vec2, depth: number): Vec2 {
  const denominator = 1 + dot(n1, n2);
  if (denominator < 1e-9) {
    return { x: v.x + depth * n1.x, z: v.z + depth * n1.z };
  }
  const k = depth / denominator;
  return { x: v.x + k * (n1.x + n2.x), z: v.z + k * (n1.z + n2.z) };
}

/**
 * Where the lines through `q1` and `q2`, each moved in by `depth`, cross, or
 * null if they are parallel; see `movedCorners`.
 */
function movedLinesCrossing(
  q1: Vec2,
  n1: Vec2,
  q2: Vec2,
  n2: Vec2,
  depth: number,
): Vec2 | null {
  const c1 = dot(n1, q1) + depth;
  const c2 = dot(n2, q2) + depth;
  const determinant = n1.x * n2.z - n1.z * n2.x;
  if (Math.abs(determinant) < 1e-9) return null;
  return {
    x: (c1 * n2.z - c2 * n1.z) / determinant,
    z: (n1.x * c2 - n2.x * c1) / determinant,
  };
}

/**
 * Two triangles between each stretch and its moved copy, each vertex carrying
 * where it lies on the road the stretch is a slice of
 * (`docs/road-markings.md`, Through junctions).
 *
 * - each quad is split along the diagonal that keeps both triangles turning
 *   the outline's way, so a quad bent at a sharp corner is still covered
 * - a dropped stretch has a single moved point → a single triangle
 */
function stripTriangles(
  stretches: readonly OutlineStretch[],
  moved: MovedCorners,
  depth: number,
): JunctionVertex[] {
  const count = stretches.length;
  const turn = signedArea(stretches.map((stretch) => stretch.b)) < 0 ? -1 : 1;
  const turnsOutlineWay = (p: Vec2, q: Vec2, r: Vec2) =>
    turn * signedArea([p, q, r]) > 0;
  return stretches.flatMap((stretch, i) => {
    const vertexAt = slicePlacement(stretch, depth);
    const { a, b } = stretch;
    const movedA = moved.points[(i + count - 1) % count];
    const movedB = moved.points[i];
    if (!moved.kept[i]) return [a, b, movedB].map(vertexAt);
    const quad =
      turnsOutlineWay(a, b, movedB) && turnsOutlineWay(a, movedB, movedA)
        ? [a, b, movedB, a, movedB, movedA]
        : [a, b, movedA, b, movedB, movedA];
    return quad.map(vertexAt);
  });
}

/**
 * Where a point lies on the road a strip quad is a slice of, as `side` and
 * `halfWidth`. With `D` the strip's depth and `d(p)` the distance in from the
 * stretch's line:
 *
 * - curb: a road whose centerline is the moved copy:
 *
 *       halfWidth = D,   side = 1 − d(p)/D
 *
 *   → `halfWidth − |side · halfWidth| = d(p)` for `0 ≤ d(p) ≤ D`, the value
 *   the shader's edge line reads: `side` 1 on the stretch, 0 on its copy
 * - roadway end: that roadway carried on. With `m` the cut's midpoint and `ŝ`
 *   the unit direction from `b` to `a`:
 *
 *       halfWidth = |ab| / 2,   side = (p − m)·ŝ / halfWidth
 *
 *   → `side · halfWidth` is the distance across the road, as on the roadway
 */
function slicePlacement(
  stretch: OutlineStretch,
  depth: number,
): (point: Vec2) => JunctionVertex {
  const { a, b } = stretch;
  if (stretch.edge === "roadwayEnd") {
    const halfWidth = distance(a, b) / 2;
    const middle = lerp(a, b, 0.5);
    const across = unitDirection(b, a);
    return (point) => ({
      point,
      side: dot(across, difference(middle, point)) / halfWidth,
      halfWidth,
    });
  }
  const inward = stretch.normalAtA;
  return (point) => ({
    point,
    side: 1 - dot(inward, difference(a, point)) / depth,
    halfWidth: depth,
  });
}

/**
 * The moved outline, triangulated by earcut, drawn with no line. With `D` the
 * strip's depth:
 *
 *     side = 0,   halfWidth = D   →   halfWidth − |side · halfWidth| = D
 *
 * everywhere: past the edge line, and equal to the strip's value along the
 * moved outline. Earcut keeps inside the polygon, and its thin triangles do
 * no harm: nothing is drawn in them.
 */
function fillTriangles(moved: MovedCorners, depth: number): JunctionVertex[] {
  const ring = moved.points.filter((_, i) => moved.kept[i]);
  if (ring.length < 3) return [];
  const faces = THREE.ShapeUtils.triangulateShape(
    ring.map((point) => new THREE.Vector2(point.x, point.z)),
    [],
  );
  return faces.flatMap((face) =>
    face.map((i) => ({ point: ring[i], side: 0, halfWidth: depth })),
  );
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
