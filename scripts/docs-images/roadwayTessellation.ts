import { ONE_LANE_PROFILE } from "../../src/input/SectionSettings";
import { arcCircle } from "../../src/core/geometry/arc";
import { biarcBetween, type Biarc } from "../../src/core/geometry/biarc";
import {
  STRAIGHT,
  type LineGeometry,
  type PrimitiveLineGeometry,
} from "../../src/core/geometry/lineGeometry";
import type { Vec2 } from "../../src/core/geometry/point";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import { tessellateRoadway } from "../../src/render/tessellate";
import {
  EDGE,
  HIGHLIGHT,
  MUTED,
  panel,
  picture,
  polygon,
  squareAround,
  svgPoint,
  triangles,
} from "./svg";

/**
 * docs/road-tessellation.md, Roadways: a straight roadway as one quad, an arc
 * as quads between slices along its radii, and a biarc as its two pieces'
 * quads, sharing the slice at the join.
 */

const ARC_RADIUS = 12;
const TONES = ["#9a9993", "#b9b8b1"];

/** An S: leaving east, arriving 20° below east, its two arcs unlike. */
const S_FROM = { x: 0, z: 0 };
const S_TO = { x: 24, z: 10 };
const S_LEAVING = { x: 1, z: 0 };
const S_ARRIVING = { x: Math.cos(-Math.PI / 9), z: Math.sin(-Math.PI / 9) };

export function roadwayTessellation(): string {
  const straight = roadwayTriangles({ x: 0, z: 0 }, { x: 24, z: 0 }, STRAIGHT);
  const arc = roadwayTriangles(onArc(-90), onArc(0), {
    kind: "arc",
    via: onArc(-45),
  });
  // A ribbon's triangles come in pairs, one pair per quad; the third
  // vertex of a pair's first triangle is a slice's outer end.
  const guides = [arc[4][2], arc[12][2]]
    .map((p) => `M0,0 L${svgPoint(p)}`)
    .join(" ");

  const s = sCurve();
  const sTriangles = roadwayTriangles(S_FROM, S_TO, {
    kind: "biarc",
    biarc: s,
  });
  const { join } = s;

  const size = 400;
  const middle = 20 + size + 40;
  const right = middle + size + 40;
  return picture(
    right + size + 20,
    size + 110,
    `.tri { stroke: ${EDGE}; stroke-width: 0.8px; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
     .guide { stroke: ${HIGHLIGHT}; stroke-width: 1px; stroke-dasharray: 4 4; fill: none; vector-effect: non-scaling-stroke; }`,
    `<text x="20" y="24" font-weight="600">Straight: one slice at each end, one quad</text>
<text x="${middle}" y="24" font-weight="600">Arc: slices along the radii</text>
<text x="${right}" y="24" font-weight="600">Biarc: each piece sliced on its own</text>
${panel(20, 34, size, { minX: -2, minZ: -14, size: 28 }, shaded(straight))}
${panel(
  middle,
  34,
  size,
  { minX: -2, minZ: -18, size: 20 },
  shaded(arc) +
    `<path class="guide" d="${guides}"/>` +
    `<circle r="0.3" fill="${HIGHLIGHT}"/>` +
    `<text x="0.6" y="-0.6" font-size="1.1" fill="${HIGHLIGHT}">arc center</text>`,
)}
${panel(
  right,
  34,
  size,
  squareAround(sTriangles.flat(), 2),
  shaded(sTriangles) +
    `<circle cx="${join.x}" cy="${-join.z}" r="0.4" fill="${HIGHLIGHT}"/>` +
    `<text x="${join.x + 0.8}" y="${-join.z - 0.8}" font-size="1.6" font-weight="600" fill="${HIGHLIGHT}">J</text>`,
)}
<text x="20" y="${size + 64}">Two triangles between each pair of neighboring slices; the shades alternate per quad. A biarc's pieces share the slice at J.</text>
<text x="20" y="${size + 88}" font-size="12" fill="${MUTED}">Arc slices are spaced so the outer edge strays at most 5 cm from its circle. 8 m roads, arc R = ${ARC_RADIUS} m, biarc R = ${radiusOf(S_FROM, join, s.first)} m and ${radiusOf(join, S_TO, s.second)} m.</text>`,
  );
}

/** The triangles of the roadway along a lone section: nothing set back. */
function roadwayTriangles(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
): Vec2[][] {
  const network = new RoadNetwork();
  const section = network.addSection(from, to, geometry, ONE_LANE_PROFILE);
  const roadway = new RoadLayout(network).roadwayAlong(section.id);
  return triangles(tessellateRoadway(roadway.outline)).map((tri) =>
    tri.map((v) => v.point),
  );
}

/** Each quad, its two triangles, in the next of the alternating tones. */
function shaded(tris: readonly Vec2[][]): string {
  return tris
    .map((tri, i) =>
      polygon(tri, `class="tri" fill="${TONES[Math.floor(i / 2) % 2]}"`),
    )
    .join("");
}

/** The point on the arc's centerline circle at `degrees`. */
function onArc(degrees: number): Vec2 {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: ARC_RADIUS * Math.cos(angle),
    z: ARC_RADIUS * Math.sin(angle),
  };
}

/** The S biarc, or a failure saying there is none. */
function sCurve(): Biarc {
  const biarc = biarcBetween(S_FROM, S_LEAVING, S_TO, S_ARRIVING);
  if (biarc === null) {
    throw new Error("No biarc for the S");
  }
  return biarc;
}

/** A piece's radius in whole meters, for the caption. */
function radiusOf(from: Vec2, to: Vec2, piece: PrimitiveLineGeometry): string {
  const circle = piece.kind === "arc" ? arcCircle(from, to, piece.via) : null;
  return circle === null ? "∞" : circle.radius.toFixed(0);
}
