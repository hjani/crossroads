import { ONE_LANE_PROFILE } from "../../src/input/SectionSettings";
import { STRAIGHT } from "../../src/core/geometry/lineGeometry";
import { distance, lerp, type Vec2 } from "../../src/core/geometry/point";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import {
  junctionShape,
  LAYOUT_STYLE,
  roadwayShapes,
  toward,
} from "./layoutParts";
import {
  dimension,
  HIGHLIGHT,
  INK,
  MUTED,
  panel,
  picture,
  squareAt,
  svgPoint,
} from "./svg";

/**
 * docs/road-layout.md, Junction: the parts of a junction and their names —
 * node, legs, gaps, setbacks, roadway ends, corners, a round join, curbs.
 *
 * Three 8 m roads, so that every part shows: two gaps under a half turn,
 * joined at corners, and one over it, joined round.
 */

const LEGS = [0, 55, 125];
const TEXT = 1.05;

export function junctionAnatomy(): string {
  const network = new RoadNetwork();
  const first = network.addSection(
    { x: 0, z: 0 },
    toward(LEGS[0], 30),
    STRAIGHT,
    ONE_LANE_PROFILE,
  );
  const node = first.from;
  const sections = [
    first,
    ...LEGS.slice(1).map((degrees) =>
      network.addSection(node, toward(degrees, 30), STRAIGHT, ONE_LANE_PROFILE),
    ),
  ];
  const layout = new RoadLayout(network);
  const junction = layout.junctionAt(node);
  const outline = junction.outline();
  const { pieces } = outline;

  let content =
    roadwayShapes(layout) +
    junctionShape(outline) +
    LEGS.map(
      (degrees) =>
        `<path class="guide" d="M0,0 L${svgPoint(toward(degrees, 30))}"/>`,
    ).join("");

  // The setback of the first leg, along its centerline.
  const setback = junction.setbackOf(sections[0].id);
  content += dimension({ x: setback, z: 0 }, { x: 0, z: 0 }, "setback", TEXT);

  // The gap between the second and third legs.
  const gapRadius = 12;
  const gapArc = Array.from({ length: 31 }, (_, k) =>
    toward(LEGS[1] + ((LEGS[2] - LEGS[1]) * k) / 30, gapRadius),
  );
  content += `<polyline class="angle" points="${gapArc.map(svgPoint).join(" ")}"/>`;
  content += text(
    toward((LEGS[1] + LEGS[2]) / 2, gapRadius + 1.4),
    "gap",
    "middle",
  );

  // Corners: where the curbs on a narrow gap's side cross.
  for (let i = 0; i + 1 < LEGS.length; i++) {
    const p = edgesCrossing(LEGS[i], LEGS[i + 1]);
    content += point(p) + text(away(p, 1.6), "corner P", "middle");
  }

  // The round join, its ends where the curbs touch the circle, and the
  // longest straight curb.
  let longestCurb: { from: Vec2; to: Vec2 } | null = null;
  pieces.forEach((piece, i) => {
    const from = pieces[(i + pieces.length - 1) % pieces.length].point;
    if (piece.incomingGeometry.kind === "arc") {
      content += point(from) + point(piece.point);
      content += text(away(from, 1.2), "T", "middle");
      content += text(away(piece.point, 1.2), "T", "middle");
      content += text(
        away(piece.incomingGeometry.via, 3.2),
        "round join",
        "middle",
      );
    }
    if (
      piece.edge === "curb" &&
      piece.incomingGeometry.kind === "straight" &&
      (longestCurb === null ||
        distance(from, piece.point) >
          distance(longestCurb.from, longestCurb.to))
    ) {
      longestCurb = { from, to: piece.point };
    }
  });
  const curb = longestCurb as { from: Vec2; to: Vec2 } | null;
  if (curb) {
    content += text(away(lerp(curb.from, curb.to, 0.5), 1.3), "curb", "middle");
  }

  // The second leg's roadway end, at its setback.
  const endMiddle = toward(LEGS[1], junction.setbackOf(sections[1].id));
  content += text(away(endMiddle, 1.6), "roadway end", "start", 1.5);

  content +=
    point({ x: 0, z: 0 }) +
    text({ x: -0.8, z: 0.9 }, "node N", "end") +
    text(toward(LEGS[1], 22), "leg", "start", 2.2) +
    text(toward(LEGS[2], 19), "roadway", "middle", 0, MUTED) +
    text(toward(215, 2.2), "junction", "middle", 0, MUTED);

  const size = 520;
  const notes = [
    "Three 8 m roads. Dashed: each leg's centerline. Thick: where each roadway",
    "ends; teal: the junction's curbs. The leg at 55° is set back by its narrower",
    "gap, so a curb runs from its end back to the corner of its wider one.",
  ];
  return picture(
    size + 40,
    34 + size + 30 + notes.length * 20,
    `${LAYOUT_STYLE}
     .guide { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 1px; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }
     .angle { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 1.5px; vector-effect: non-scaling-stroke; }`,
    `<text x="20" y="24" font-weight="600">The parts of a junction</text>
${panel(20, 34, size, squareAt({ x: 1, z: 5 }, 32), content)}
${notes
  .map(
    (line, i) =>
      `<text x="20" y="${34 + size + 24 + i * 20}" font-size="12" fill="${MUTED}">${line}</text>`,
  )
  .join("\n")}`,
  );
}

/**
 * Where the curb on the counterclockwise side of the leg at `first` crosses
 * the curb on the clockwise side of the leg at `second`: straight legs from
 * the origin, each edge `ONE_LANE_PROFILE.width / 2` beside its centerline.
 */
function edgesCrossing(first: number, second: number): Vec2 {
  const half = ONE_LANE_PROFILE.width / 2;
  const p1 = toward(first + 90, half);
  const d1 = toward(first, 1);
  const p2 = toward(second - 90, half);
  const d2 = toward(second, 1);
  const t =
    ((p2.x - p1.x) * d2.z - (p2.z - p1.z) * d2.x) / (d1.x * d2.z - d1.z * d2.x);
  return { x: p1.x + t * d1.x, z: p1.z + t * d1.z };
}

function point(p: Vec2): string {
  return `<circle cx="${p.x}" cy="${-p.z}" r="0.3" fill="${HIGHLIGHT}"/>`;
}

/** `p` moved `meters` further from the node, so a label clears the outline. */
function away(p: Vec2, meters: number): Vec2 {
  const length = Math.hypot(p.x, p.z) || 1;
  return {
    x: p.x + (p.x / length) * meters,
    z: p.z + (p.z / length) * meters,
  };
}

function text(
  at: Vec2,
  label: string,
  anchor: "start" | "middle" | "end",
  dx = 0,
  color = INK,
): string {
  return (
    `<text x="${at.x + dx}" y="${-at.z}" font-size="${TEXT}" font-weight="600" ` +
    `text-anchor="${anchor}" dominant-baseline="middle" fill="${color}">${label}</text>`
  );
}
