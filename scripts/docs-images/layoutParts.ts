import { arcPolyline } from "../../src/core/geometry/arc";
import type { Vec2 } from "../../src/core/geometry/point";
import type { JunctionOutline } from "../../src/core/layout/outline";
import type { RoadLayout } from "../../src/core/layout/RoadLayout";
import { tessellateRoadway } from "../../src/render/tessellate";
import { EDGE, polygon, svgPoint, triangles } from "./svg";

/**
 * Parts of a road layout as plain shapes, for pictures about the layout
 * rather than about its tessellation: roadways filled, junctions filled with
 * their outline drawn.
 */

export const ROAD = "#9a9993";
export const JUNCTION = "#c9cfd6";
/** The curb strip's color in the junction tessellation picture. */
export const CURB = "#3aa7b3";

/** The point `length` meters from the origin, `degrees` from +x toward +z. */
export function toward(degrees: number, length: number): Vec2 {
  const angle = (degrees * Math.PI) / 180;
  return { x: length * Math.cos(angle), z: length * Math.sin(angle) };
}

/** The classes the shapes here use. */
export const LAYOUT_STYLE = `
  .curb { fill: none; stroke: ${CURB}; stroke-width: 2px; vector-effect: non-scaling-stroke; }
  .cut { fill: none; stroke: ${EDGE}; stroke-width: 3px; vector-effect: non-scaling-stroke; }`;

/** Every roadway of the layout, filled. */
export function roadwayShapes(layout: RoadLayout): string {
  let shapes = "";
  for (const roadway of layout.allRoadways()) {
    for (const tri of triangles(tessellateRoadway(roadway.outline))) {
      // Stroked in their own fill, so neighboring triangles show no seam.
      shapes += polygon(
        tri.map((v) => v.point),
        `fill="${ROAD}" stroke="${ROAD}" stroke-width="0.05"`,
      );
    }
  }
  return shapes;
}

/**
 * A junction, filled, with its outline: where a roadway ends thick (`cut`),
 * curbs thin (`curb`). Arcs are drawn as true curves, not the renderer's
 * chords.
 */
export function junctionShape(outline: JunctionOutline): string {
  const { pieces } = outline;
  const ring: Vec2[] = [];
  let lines = "";
  pieces.forEach((piece, i) => {
    const from = pieces[(i + pieces.length - 1) % pieces.length].point;
    const run =
      piece.incomingGeometry.kind === "arc"
        ? arcPolyline(from, piece.point, piece.incomingGeometry.via, 0.005)
        : [from, piece.point];
    ring.push(...run.slice(1));
    const cls = piece.edge === "roadwayEnd" ? "cut" : "curb";
    lines += `<polyline class="${cls}" points="${run.map(svgPoint).join(" ")}"/>`;
  });
  return polygon(ring, `fill="${JUNCTION}"`) + lines;
}
