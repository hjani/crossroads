import { ONE_LANE_PROFILE } from "../../src/input/SectionSettings";
import { STRAIGHT } from "../../src/core/geometry/lineGeometry";
import type { Vec2 } from "../../src/core/geometry/point";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import {
  tessellateJunction,
  tessellateRoadway,
} from "../../src/render/tessellate";
import { toward } from "./layoutParts";
import {
  EDGE,
  groundFrame,
  HIGHLIGHT,
  legend,
  MUTED,
  panel,
  picture,
  polygon,
  squareAround,
  squareAt,
  triangles,
} from "./svg";

/**
 * docs/road-tessellation.md, Junctions: a junction as a strip along its
 * outline plus a fill, with a detail where the strip is visible.
 *
 * The junction from the bug report this was built for: two straight roads in
 * line at the bottom, one at the upper left, and an arc between them that
 * turns away from it.
 */

const ARC_RADIUS = 64;
const DETAIL_METERS = 6;

const FILL = {
  curb: "#3aa7b3",
  cut: "#e39a36",
  fill: "#c9cfd6",
  road: "#9a9993",
};

export function junctionTessellation(): string {
  const network = new RoadNetwork();
  const first = network.addSection(
    { x: 0, z: 0 },
    toward(12, 40),
    STRAIGHT,
    ONE_LANE_PROFILE,
  );
  const node = first.from;
  network.addSection(node, toward(101, 40), STRAIGHT, ONE_LANE_PROFILE);
  network.addSection(node, toward(192, 40), STRAIGHT, ONE_LANE_PROFILE);
  const arc = arcLeaving(93, ARC_RADIUS);
  network.addSection(
    node,
    arc(45),
    { kind: "arc", via: arc(22.5) },
    ONE_LANE_PROFILE,
  );

  const layout = new RoadLayout(network);
  const outline = layout.junctionAt(node).outline();

  let shapes = "";
  // A strip quad at a roadway end has a vertex across the road's center
  // (side < 0); a curb quad's sides run from 0 to 1; the fill's are all 0.
  for (const tri of triangles(tessellateJunction(outline))) {
    const kind = tri.every((v) => v.side === 0)
      ? "fill"
      : tri.some((v) => v.side < -0.5)
        ? "cut"
        : "curb";
    shapes += polygon(
      tri.map((v) => v.point),
      `class="tri" fill="${FILL[kind]}"`,
    );
  }
  for (const roadway of layout.allRoadways()) {
    for (const tri of triangles(tessellateRoadway(roadway.outline))) {
      shapes += polygon(
        tri.map((v) => v.point),
        `class="tri" fill="${FILL.road}"`,
      );
    }
  }

  // Detail: the corner where the arc's inner curb starts.
  const pieces = outline.pieces;
  const arcCurb = pieces.findIndex(
    (p, i) => i > 0 && p.edge === "curb" && p.incomingGeometry.kind === "arc",
  );
  const detail = squareAt(pieces[arcCurb - 1].point, DETAIL_METERS);
  const whole = squareAround(
    pieces.map((p) => p.point),
    6,
  );

  const size = 420;
  const right = 20 + size + 40;
  const bottom = 34 + size;
  return picture(
    right + size + 20,
    bottom + 104,
    `.tri { stroke: ${EDGE}; stroke-width: 0.6px; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
     .detail .tri { stroke-width: 1.2px; }`,
    `<text x="20" y="24" font-weight="600">Whole junction</text>
<text x="${right}" y="24" font-weight="600">Detail: ${DETAIL_METERS} m around the corner where the arc's inner curb starts</text>
${panel(20, 34, size, whole, shapes + groundFrame(detail) + `<circle r="${whole.size / 140}" fill="${HIGHLIGHT}"/>`)}
<g class="detail">${panel(right, 34, size, detail, shapes)}</g>
<rect x="${right}" y="34" width="${size}" height="${size}" fill="none" stroke="${HIGHLIGHT}" stroke-width="1.5"/>
<text x="20" y="${bottom + 22}" font-size="12" fill="${MUTED}">Red dot: the node. 8 m roads, arc R = ${ARC_RADIUS} m.</text>
${legend(20, bottom + 52, 440, [
  { fill: FILL.curb, label: "Strip, curb: side 1 → 0 across the strip" },
  {
    fill: FILL.cut,
    label: "Strip, roadway end: joins the road's edge lines to the curb's",
  },
  { fill: FILL.fill, label: "Fill, earcut: no line" },
  { fill: FILL.road, label: "Roadway ribbon: slices square to the road" },
])}`,
  );
}

/**
 * Points along an arc of `radius` leaving the origin at `degrees` and turning
 * clockwise, by the distance along it.
 */
function arcLeaving(degrees: number, radius: number): (s: number) => Vec2 {
  const angle = (degrees * Math.PI) / 180;
  const center = { x: radius * Math.sin(angle), z: -radius * Math.cos(angle) };
  const start = Math.atan2(-center.z, -center.x);
  return (s) => ({
    x: center.x + radius * Math.cos(start - s / radius),
    z: center.z + radius * Math.sin(start - s / radius),
  });
}
