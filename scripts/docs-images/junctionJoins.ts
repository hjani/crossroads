import { STRAIGHT } from "../../src/core/geometry/lineGeometry";
import { distance, type Vec2 } from "../../src/core/geometry/point";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import {
  junctionShape,
  LAYOUT_STYLE,
  roadwayShapes,
  toward,
} from "./layoutParts";
import { HIGHLIGHT, MUTED, panel, picture, squareAt, svgPoint } from "./svg";

/**
 * docs/road-layout.md, Junction: how a junction's outline joins each gap
 * between two roads — at a corner `P` where their curbs cross, or round along
 * the circle about the node, which the wider road's curb touches at `T` and a
 * narrower road's crosses at `X`.
 */

interface Road {
  readonly degrees: number;
  readonly width: number;
}

export function junctionJoins(): string {
  const size = 420;
  const right = 20 + size + 40;
  return picture(
    right + size + 20,
    34 + size + 120,
    `${LAYOUT_STYLE}
     .guide { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 1px; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }`,
    `<text x="20" y="24" font-weight="600">Equal widths: a corner, and a round join</text>
<text x="${right}" y="24" font-weight="600">Different widths: round joins</text>
${junctionPanel(20, 34, size, [
  { degrees: 0, width: 8 },
  { degrees: 70, width: 8 },
])}
${junctionPanel(right, 34, size, [
  { degrees: 0, width: 16 },
  { degrees: 150, width: 8 },
])}
<text x="20" y="${34 + size + 26}"><tspan font-weight="600">P</tspan>: the curbs on the gap's side cross ahead of the node → both roads end square through P.</text>
<text x="20" y="${34 + size + 50}"><tspan font-weight="600">T</tspan>: the wider road's curb touches the circle about N, radius its w/2 → not set back.</text>
<text x="20" y="${34 + size + 74}"><tspan font-weight="600">X</tspan>: a narrower road's curb crosses that circle → it ends square through X.</text>
<text x="20" y="${34 + size + 100}" font-size="12" fill="${MUTED}">Thick lines: where each roadway ends. Dashed: centerlines, and the circle round joins follow.</text>`,
  );
}

/** One junction where `roads` meet, with its outline's points labeled. */
function junctionPanel(
  x: number,
  y: number,
  pixels: number,
  roads: readonly Road[],
): string {
  const network = new RoadNetwork();
  const first = network.addSection(
    { x: 0, z: 0 },
    toward(roads[0].degrees, 30),
    STRAIGHT,
    roads[0].width,
  );
  const node = first.from;
  for (const road of roads.slice(1)) {
    network.addSection(node, toward(road.degrees, 30), STRAIGHT, road.width);
  }
  const layout = new RoadLayout(network);
  const outline = layout.junctionAt(node).outline();
  const { pieces } = outline;
  const radius = Math.max(...roads.map((road) => road.width)) / 2;

  let content = roadwayShapes(layout) + junctionShape(outline);
  content +=
    `<circle class="guide" r="${radius}"/>` +
    roads
      .map(
        (road) =>
          `<path class="guide" d="M0,0 L${svgPoint(toward(road.degrees, 30))}"/>`,
      )
      .join("");

  // Labels: P where two roadway ends meet; at each end of a round join's
  // arc, T where a widest road's curb touches the circle (w/2 square to its
  // centerline, at the node), X where a narrower one's crosses it.
  const label = (p: Vec2, text: string) =>
    `<circle cx="${p.x}" cy="${-p.z}" r="0.25" fill="${HIGHLIGHT}"/>` +
    `<text x="${p.x + 0.45}" y="${-p.z - 0.45}" font-size="1.3" font-weight="600" fill="${HIGHLIGHT}">${text}</text>`;
  const touching = roads
    .filter((road) => road.width / 2 === radius)
    .flatMap((road) => [
      toward(road.degrees + 90, radius),
      toward(road.degrees - 90, radius),
    ]);
  pieces.forEach((piece, i) => {
    const before = pieces[(i + pieces.length - 1) % pieces.length];
    if (piece.edge === "roadwayEnd" && before.edge === "roadwayEnd") {
      content += label(before.point, "P");
    }
    if (piece.incomingGeometry.kind === "arc") {
      for (const end of [before.point, piece.point]) {
        const isT = touching.some((t) => distance(t, end) < 0.01);
        content += label(end, isT ? "T" : "X");
      }
    }
  });
  content += label({ x: 0, z: 0 }, "N");

  return panel(x, y, pixels, squareAt({ x: 0, z: 2 }, 26), content);
}
