import { ONE_LANE_PROFILE } from "../../src/input/SectionSettings";
import { STRAIGHT } from "../../src/core/geometry/lineGeometry";
import type { Vec2 } from "../../src/core/geometry/point";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import type { NodeId } from "../../src/core/network/types";
import { junctionShape, LAYOUT_STYLE, roadwayShapes } from "./layoutParts";
import { dimension, HIGHLIGHT, MUTED, panel, picture, squareAt } from "./svg";

/**
 * docs/intersections.md, Clearance: the three pairings, each measured on a
 * real layout — junction and junction, junction and roadway, roadway and
 * roadway.
 */

const TEXT_METERS = 1.6;

export function clearanceRules(): string {
  const size = 300;
  const column = (i: number) => 20 + i * (size + 30);
  const bottom = 34 + size;
  return picture(
    column(3) - 10,
    bottom + 110,
    `${LAYOUT_STYLE}
     .reach { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 1px; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }`,
    `<text x="${column(0)}" y="24" font-weight="600">Junction ↔ junction</text>
<text x="${column(1)}" y="24" font-weight="600">Junction ↔ roadway</text>
<text x="${column(2)}" y="24" font-weight="600">Roadway ↔ roadway</text>
${panel(column(0), 34, size, squareAt({ x: 0, z: 0 }, 36), betweenJunctions())}
${panel(column(1), 34, size, squareAt({ x: 0, z: 0 }, 36), junctionAndRoadway())}
${panel(column(2), 34, size, squareAt({ x: 0, z: 2 }, 36), betweenRoadways())}
<text x="${column(0)}" y="${bottom + 26}">Nodes at least R₁ + R₂ apart:</text>
<text x="${column(0)}" y="${bottom + 46}">the circles don't overlap.</text>
<text x="${column(1)}" y="${bottom + 26}">Centerline at least R + w/2 from</text>
<text x="${column(1)}" y="${bottom + 46}">the node: the band stays off the circle.</text>
<text x="${column(2)}" y="${bottom + 26}">Centerlines at least w₁/2 + w₂/2</text>
<text x="${column(2)}" y="${bottom + 46}">apart: the bands don't overlap.</text>
<text x="${column(0)}" y="${bottom + 84}" font-size="12" fill="${MUTED}">Dashed: each junction's circle, radius R, around its node, wide enough to cover its outline. 8 m roads. Parts sharing a node are exempt.</text>`,
  );
}

/** Two T-junctions along one road. */
function betweenJunctions(): string {
  const network = new RoadNetwork();
  const a = network.addSection(
    { x: -30, z: 0 },
    { x: -7, z: 0 },
    STRAIGHT,
    ONE_LANE_PROFILE,
  ).to;
  const b = network.addSection(
    a,
    { x: 7, z: 0 },
    STRAIGHT,
    ONE_LANE_PROFILE,
  ).to;
  network.addSection(b, { x: 30, z: 0 }, STRAIGHT, ONE_LANE_PROFILE);
  network.addSection(a, { x: -7, z: -30 }, STRAIGHT, ONE_LANE_PROFILE);
  network.addSection(b, { x: 7, z: 30 }, STRAIGHT, ONE_LANE_PROFILE);
  const layout = new RoadLayout(network);
  const [ra, rb] = [radiusAt(layout, a), radiusAt(layout, b)];
  const pa = network.getNode(a).position;
  const pb = network.getNode(b).position;
  return (
    junctionScene(layout, [a, b]) +
    circleLabel(pa, ra, "R₁") +
    circleLabel(pb, rb, "R₂") +
    dimension(
      { x: pa.x, z: pa.z - 9 },
      { x: pb.x, z: pb.z - 9 },
      "≥ R₁ + R₂",
      TEXT_METERS,
    )
  );
}

/** A T-junction, and a road passing it by without meeting it. */
function junctionAndRoadway(): string {
  const network = new RoadNetwork();
  const n = network.addSection(
    { x: -30, z: -8 },
    { x: 0, z: -8 },
    STRAIGHT,
    ONE_LANE_PROFILE,
  ).to;
  network.addSection(n, { x: 30, z: -8 }, STRAIGHT, ONE_LANE_PROFILE);
  network.addSection(n, { x: 0, z: -30 }, STRAIGHT, ONE_LANE_PROFILE);
  network.addSection(
    { x: -30, z: 6 },
    { x: 30, z: 6 },
    STRAIGHT,
    ONE_LANE_PROFILE,
  );
  const layout = new RoadLayout(network);
  const p = network.getNode(n).position;
  return (
    junctionScene(layout, [n]) +
    circleLabel(p, radiusAt(layout, n), "R") +
    dimension(p, { x: p.x, z: 6 }, "≥ R + w/2", TEXT_METERS)
  );
}

/** A straight road, and an arc bulging toward it. */
function betweenRoadways(): string {
  const network = new RoadNetwork();
  network.addSection(
    { x: -30, z: -6 },
    { x: 30, z: -6 },
    STRAIGHT,
    ONE_LANE_PROFILE,
  );
  network.addSection(
    { x: -24, z: 16 },
    { x: 24, z: 16 },
    { kind: "arc", via: { x: 0, z: 6 } },
    ONE_LANE_PROFILE,
  );
  const layout = new RoadLayout(network);
  return (
    roadwayShapes(layout) +
    dimension({ x: 0, z: -6 }, { x: 0, z: 6 }, "≥ w₁/2 + w₂/2", TEXT_METERS)
  );
}

/** The roadways, and the junctions at `nodes` with their circles. */
function junctionScene(layout: RoadLayout, nodes: readonly NodeId[]): string {
  return (
    roadwayShapes(layout) +
    nodes
      .map((node) => {
        const junction = layout.junctionAt(node);
        const c = junction.center();
        return (
          junctionShape(junction.outline()) +
          `<circle class="reach" cx="${c.x}" cy="${-c.z}" r="${junction.boundingRadius()}"/>` +
          `<circle cx="${c.x}" cy="${-c.z}" r="0.35" fill="${HIGHLIGHT}"/>`
        );
      })
      .join("")
  );
}

function radiusAt(layout: RoadLayout, node: NodeId): number {
  return layout.junctionAt(node).boundingRadius();
}

/** `text` just outside the top of the circle of `radius` about `center`. */
function circleLabel(center: Vec2, radius: number, text: string): string {
  return (
    `<text x="${center.x + radius * 0.75}" y="${-(center.z + radius * 0.75)}" ` +
    `font-size="${TEXT_METERS}" font-weight="600" fill="${HIGHLIGHT}">${text}</text>`
  );
}
