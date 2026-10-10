import { ONE_LANE_PROFILE } from "../../src/input/SectionSettings";
import { arcPolyline } from "../../src/core/geometry/arc";
import { biarcBetween, biarcPrimitives } from "../../src/core/geometry/biarc";
import { STRAIGHT } from "../../src/core/geometry/lineGeometry";
import { unitDirection, type Vec2 } from "../../src/core/geometry/point";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import { nearestDirection } from "../../src/core/network/directions";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import type { NodeId } from "../../src/core/network/types";
import {
  arrivalDirection,
  offeredDirections,
} from "../../src/input/curvedRoadHelpers";
import type { Placement } from "../../src/input/sectionPointPlacement";
import { junctionShape, LAYOUT_STYLE, roadwayShapes } from "./layoutParts";
import {
  HIGHLIGHT,
  INK,
  legend,
  MUTED,
  panel,
  picture,
  squareAround,
  svgPoint,
} from "./svg";

/**
 * docs/tools.md, Placing a connector: both ends picked from the directions
 * on offer there. At the start, a kink, the flick out of the capture circle
 * picks one leaving it. At the far end, a kink too, the cursor's heading over
 * its last stretch picks the nearest arriving one: the same directions,
 * turned around. The connector is the biarc between the two.
 */

const ROAD_METERS = 13;
const RAY_METERS = 9;
/** How far short of a point an arrow pointing at it stops. */
const ARROW_GAP_METERS = 0.9;
/** The tool's circle is in pixels; here at a size that reads. */
const CAPTURE_METERS = 6;
const TEXT_METERS = 2;

export function connector(): string {
  const network = new RoadNetwork();
  const start = { x: 0, z: 0 };
  const farEnd = { x: 36, z: 30 };
  const startNode = kink(network, start, 180, 250);
  const endNode = kink(network, farEnd, 45, 160);
  const layout = new RoadLayout(network);

  const startPlacement: Placement = {
    kind: "node",
    node: startNode,
    position: start,
  };
  const endPlacement: Placement = {
    kind: "node",
    node: endNode,
    position: farEnd,
  };
  const leavingOnOffer = offeredDirections(network, startPlacement);
  const arrivingOnOffer = offeredDirections(network, endPlacement).map((d) => ({
    x: -d.x,
    z: -d.z,
  }));

  // The cursor's way from the start to the far end: out of the capture circle
  // first, and its last stretch is the heading.
  const path: Vec2[] = [
    start,
    { x: 1.5, z: 0.6 },
    { x: 3.5, z: -0.2 },
    { x: 6.6, z: 0.4 },
    { x: 12, z: 2.5 },
    { x: 18, z: 6.5 },
    { x: 23, z: 11.5 },
    { x: 27, z: 17 },
    { x: 30.5, z: 24.3 },
    farEnd,
  ];
  const exit = onBearing(start, 3, CAPTURE_METERS);
  const leaving = nearestDirection(leavingOnOffer, exit);
  const stretchFrom = path[path.length - 2];
  const heading = unitDirection(stretchFrom, farEnd);
  const arriving = arrivalDirection(network, endPlacement, heading);
  const shape =
    leaving === null || arriving === null
      ? null
      : biarcBetween(start, leaving, farEnd, arriving);
  if (leaving === null || arriving === null || shape === null) {
    throw new Error("connector picture: no biarc between the two kinks");
  }

  const planned = biarcPrimitives(start, farEnd, shape).flatMap((piece, i) => {
    const points =
      piece.geometry.kind === "arc"
        ? arcPolyline(piece.from, piece.to, piece.geometry.via, 0.01)
        : [piece.from, piece.to];
    return i === 0 ? points : points.slice(1);
  });

  const arrow = (from: Vec2, to: Vec2, cls: string) =>
    `<path class="${cls}" d="M${svgPoint(from)} L${svgPoint(to)}" marker-end="url(#${cls})"/>`;
  // A direction on offer at the start, as an arrow leaving it that way.
  const leavingArrow = (direction: Vec2, cls: string) =>
    arrow(
      along(start, direction, ARROW_GAP_METERS),
      along(start, direction, RAY_METERS),
      cls,
    );
  // One on offer at the far end, as an arrow arriving at it heading that way.
  const arrivingArrow = (direction: Vec2, cls: string) =>
    arrow(
      along(farEnd, direction, -RAY_METERS),
      along(farEnd, direction, -ARROW_GAP_METERS),
      cls,
    );
  const dot = (p: Vec2, color: string, r = 0.6) =>
    `<circle cx="${p.x}" cy="${-p.z}" r="${r}" fill="${color}"/>`;
  const label = (p: Vec2, text: string, dx: number, dz: number, color = INK) =>
    `<text x="${p.x + dx}" y="${-(p.z + dz)}" font-size="${TEXT_METERS}" ` +
    `fill="${color}" dominant-baseline="middle">${text}</text>`;
  const marker = (id: string, color: string) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="1.8" ` +
    `markerHeight="1.8" markerUnits="userSpaceOnUse" orient="auto">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;

  const content =
    `<defs>${marker("offer", MUTED)}${marker("picked", HIGHLIGHT)}${marker("heading", INK)}</defs>` +
    roadwayShapes(layout) +
    junctionShape(layout.junctionAt(startNode).outline()) +
    junctionShape(layout.junctionAt(endNode).outline()) +
    `<polyline class="planned" points="${planned.map(svgPoint).join(" ")}"/>` +
    leavingOnOffer.map((d) => leavingArrow(d, "offer")).join("") +
    arrivingOnOffer.map((d) => arrivingArrow(d, "offer")).join("") +
    leavingArrow(leaving, "picked") +
    arrivingArrow(arriving, "picked") +
    `<circle class="circle" cx="${start.x}" cy="${-start.z}" r="${CAPTURE_METERS}"/>` +
    `<polyline class="cursor" points="${path.slice(0, -1).map(svgPoint).join(" ")}"/>` +
    arrow(stretchFrom, along(farEnd, heading, -ARROW_GAP_METERS), "heading") +
    dot(exit, INK, 0.45) +
    dot(start, INK) +
    dot(farEnd, INK) +
    dot(shape.join, HIGHLIGHT) +
    label(start, "start", -7, 2) +
    label(farEnd, "far end", 1.6, -1.6) +
    label(shape.join, "J", -3, 0.8, HIGHLIGHT) +
    label(exit, "flick", 0.8, -1.8) +
    label(stretchFrom, "heading", 1, -2);

  const size = 520;
  const ground = squareAround(
    [
      onBearing(start, 180, ROAD_METERS),
      onBearing(start, 250, ROAD_METERS),
      onBearing(farEnd, 45, ROAD_METERS),
      onBearing(farEnd, 160, ROAD_METERS),
    ],
    6,
  );
  return picture(
    size + 240,
    34 + size + 130,
    `${LAYOUT_STYLE}
     .offer { fill: none; stroke: ${MUTED}; stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
     .picked { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 3px; vector-effect: non-scaling-stroke; }
     .heading { fill: none; stroke: ${INK}; stroke-width: 2px; vector-effect: non-scaling-stroke; }
     .circle { fill: none; stroke: ${INK}; stroke-width: 1px; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }
     .cursor { fill: none; stroke: ${INK}; stroke-width: 1.5px; stroke-dasharray: 2 3; vector-effect: non-scaling-stroke; }
     .planned { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 3px; vector-effect: non-scaling-stroke; }`,
    `<text x="20" y="24" font-weight="600">A connector: both ends picked from the directions on offer there</text>
${panel(20, 34, size, ground, content)}
${legend(20, 34 + size + 30, 440, [
  {
    fill: MUTED,
    label: "On offer: leaving the start, arriving at the far end",
  },
  { fill: HIGHLIGHT, label: "The ones picked, and the connector" },
])}
<text x="20" y="${34 + size + 72}">Dotted: the cursor. Leaving the capture circle picks the start's; its last stretch, as the end welds, the far end's.</text>
<text x="20" y="${34 + size + 96}" font-size="12" fill="${MUTED}">The far end offers the directions a start there would, turned around. Sliding on carries its pick; pulling away drops it.</text>`,
  );
}

/** A node at `at` where two straight roads meet, leaving it at the bearings. */
function kink(
  network: RoadNetwork,
  at: Vec2,
  firstDegrees: number,
  secondDegrees: number,
): NodeId {
  const node = network.addSection(
    at,
    onBearing(at, firstDegrees, ROAD_METERS),
    STRAIGHT,
    ONE_LANE_PROFILE,
  ).from;
  network.addSection(
    node,
    onBearing(at, secondDegrees, ROAD_METERS),
    STRAIGHT,
    ONE_LANE_PROFILE,
  );
  return node;
}

/** The point `length` meters from `p`, `degrees` from +x toward +z. */
function onBearing(p: Vec2, degrees: number, length: number): Vec2 {
  const angle = (degrees * Math.PI) / 180;
  return along(p, { x: Math.cos(angle), z: Math.sin(angle) }, length);
}

/** `p` moved `length` meters along the unit vector `direction`. */
function along(p: Vec2, direction: Vec2, length: number): Vec2 {
  return { x: p.x + length * direction.x, z: p.z + length * direction.z };
}
