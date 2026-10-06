import { ONE_LANE_PROFILE } from "../../src/input/SectionSettings";
import { arcPolyline } from "../../src/core/geometry/arc";
import { STRAIGHT } from "../../src/core/geometry/lineGeometry";
import type { Vec2 } from "../../src/core/geometry/point";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import {
  bisectorDirectionsAt,
  continuingDirectionsAt,
  geometryLeaving,
  nearestDirection,
  perpendicularDirectionsAt,
} from "../../src/core/network/directions";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import {
  junctionShape,
  LAYOUT_STYLE,
  roadwayShapes,
  toward,
} from "./layoutParts";
import {
  HIGHLIGHT,
  INK,
  legend,
  MUTED,
  panel,
  picture,
  squareAt,
  svgPoint,
} from "./svg";

/**
 * docs/tools.md, Placing a smart arc: the directions a node offers, a flick
 * out of the capture circle picking the nearest one, and the arc planned
 * leaving the node that way.
 */

const RAY_METERS = 13;
/** The tool's circles are in pixels; here at a size that reads. */
const CAPTURE_METERS = 6;
const PICK_METERS = 1.5;
const KIND_COLOR = {
  continuing: "#2f6fdb",
  bisector: "#2b9348",
  perpendicular: "#8e44ad",
};

export function smartArc(): string {
  const network = new RoadNetwork();
  const node = network.addSection(
    { x: 0, z: 0 },
    toward(0, 30),
    STRAIGHT,
    ONE_LANE_PROFILE,
  ).from;
  network.addSection(node, toward(125, 30), STRAIGHT, ONE_LANE_PROFILE);
  const layout = new RoadLayout(network);
  const origin = { x: 0, z: 0 };

  const offered = [
    ...continuingDirectionsAt(network, node).map((d) => ({
      d,
      kind: "continuing" as const,
    })),
    ...bisectorDirectionsAt(network, node).map((d) => ({
      d,
      kind: "bisector" as const,
    })),
    ...perpendicularDirectionsAt(network, node).map((d) => ({
      d,
      kind: "perpendicular" as const,
    })),
  ];
  const rays = offered
    .map(
      ({ d, kind }) =>
        `<path class="ray" stroke="${KIND_COLOR[kind]}" d="M0,0 L${svgPoint({ x: d.x * RAY_METERS, z: d.z * RAY_METERS })}"/>`,
    )
    .join("");

  // The cursor's way out: it wanders, then leaves the capture circle.
  const path: Vec2[] = [
    origin,
    { x: 0.8, z: 0.6 },
    { x: 0.4, z: 2 },
    { x: 1.3, z: 3.6 },
    toward(80, CAPTURE_METERS + 0.6),
    { x: 4, z: 12 },
    { x: 9, z: 17 },
  ];
  const exit = toward(80, CAPTURE_METERS);
  const picked = nearestDirection(
    offered.map((o) => o.d),
    exit,
  );
  const farEnd = path[path.length - 1];
  const geometry = picked ? geometryLeaving(origin, picked, farEnd) : null;
  const planned =
    geometry?.kind === "arc"
      ? arcPolyline(origin, farEnd, geometry.via, 0.01)
      : [origin, farEnd];

  const content =
    roadwayShapes(layout) +
    junctionShape(layout.junctionAt(node).outline()) +
    rays +
    `<circle class="circle" r="${CAPTURE_METERS}"/>` +
    `<circle class="circle" r="${PICK_METERS}"/>` +
    `<polyline class="planned" points="${planned.map(svgPoint).join(" ")}"/>` +
    `<polyline class="cursor" points="${path.map(svgPoint).join(" ")}"/>` +
    `<circle cx="${exit.x}" cy="${-exit.z}" r="0.35" fill="${INK}"/>` +
    `<circle cx="${farEnd.x}" cy="${-farEnd.z}" r="0.45" fill="${HIGHLIGHT}"/>` +
    `<text x="${CAPTURE_METERS * 0.72 + 0.3}" y="${-CAPTURE_METERS * 0.72 - 0.3}" font-size="1.1" fill="${MUTED}">capture circle</text>` +
    `<text x="${farEnd.x + 0.8}" y="${-farEnd.z}" font-size="1.1" fill="${HIGHLIGHT}">far end</text>`;

  const size = 460;
  return picture(
    size + 260,
    34 + size + 150,
    `${LAYOUT_STYLE}
     .ray { stroke-width: 2px; fill: none; vector-effect: non-scaling-stroke; }
     .circle { fill: none; stroke: ${INK}; stroke-width: 1px; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }
     .cursor { fill: none; stroke: ${INK}; stroke-width: 1.5px; stroke-dasharray: 2 3; vector-effect: non-scaling-stroke; }
     .planned { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 3px; vector-effect: non-scaling-stroke; }`,
    `<text x="20" y="24" font-weight="600">A smart arc from a node: offered directions, a flick, the arc</text>
${panel(20, 34, size, squareAt({ x: 2, z: 4 }, 34), content)}
${legend(20, 34 + size + 30, 300, [
  { fill: KIND_COLOR.continuing, label: "A road carried on past the node" },
  { fill: KIND_COLOR.bisector, label: "The middle of a gap" },
  { fill: KIND_COLOR.perpendicular, label: "Square to a road" },
  { fill: HIGHLIGHT, label: "The arc planned to the far end" },
])}
<text x="20" y="${34 + size + 96}">Dotted: the cursor. Where it leaves the capture circle picks the nearest offered direction.</text>
<text x="20" y="${34 + size + 120}" font-size="12" fill="${MUTED}">The capture circle and the pick radius are pixel sizes in the tool, drawn here at a size that reads.</text>`,
  );
}
