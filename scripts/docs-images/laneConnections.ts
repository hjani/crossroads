import {
  lineDirectionAt,
  STRAIGHT,
} from "../../src/core/geometry/lineGeometry";
import type { Vec2 } from "../../src/core/geometry/point";
import type { Connection } from "../../src/core/lanes/connection";
import type { Lane } from "../../src/core/lanes/lane";
import { LaneGraph } from "../../src/core/lanes/LaneGraph";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import type {
  NodeId,
  RoadProfile,
  SectionId,
} from "../../src/core/network/types";
import {
  ONE_LANE_PROFILE,
  TWO_LANE_PROFILE,
} from "../../src/input/SectionSettings";
import { polylineBetween } from "../../src/render/tessellate";
import {
  junctionShape,
  LAYOUT_STYLE,
  roadwayShapes,
  toward,
} from "./layoutParts";
import { HIGHLIGHT, MUTED, panel, picture, squareAt, svgPoint } from "./svg";

/**
 * docs/lanes.md, Which lanes connect: one panel per rule — two roads, a
 * junction, no dead lanes — each the lane graph of a small network.
 *
 * Drawn with +z down, as the app shows the ground (`Viewport`), not up as
 * `svgPoint` puts it: mirrored, right-hand traffic would read as left-hand.
 */

/** Three lanes each way: no preset has it, the app builds up to two. */
const THREE_LANE_PROFILE: RoadProfile = { width: 22, lanesPerDirection: 3 };

/** How far each road runs from the node, in meters. */
const ROAD_METERS = 22;
const NUMBER_METERS = 1.8;
const NAME_METERS = 2.6;
const PANEL_PIXELS = 300;
const PANEL_METERS = 50;

type LinkStyle = "link" | "fill";

export function laneConnections(): string {
  const join = roadsAround([
    { degrees: 180, profile: THREE_LANE_PROFILE },
    { degrees: 0, profile: TWO_LANE_PROFILE },
  ]);
  const cross = roadsAround([
    { degrees: 90, profile: THREE_LANE_PROFILE },
    { degrees: 270, profile: TWO_LANE_PROFILE },
    { degrees: 180, profile: ONE_LANE_PROFILE },
    { degrees: 0, profile: ONE_LANE_PROFILE },
  ]);
  const tee = roadsAround([
    { degrees: 90, profile: THREE_LANE_PROFILE },
    { degrees: 180, profile: ONE_LANE_PROFILE },
    { degrees: 0, profile: ONE_LANE_PROFILE },
  ]);
  const crossA = cross.sections[0];
  const teeA = tee.sections[0];

  const column = (i: number) => 20 + i * (PANEL_PIXELS + 30);
  const bottom = 34 + PANEL_PIXELS;
  return picture(
    column(3) - 10,
    bottom + 110,
    `${LAYOUT_STYLE}
     .lane { fill: none; stroke: #ffffff; stroke-width: 1px; vector-effect: non-scaling-stroke; marker-end: url(#arrow); }
     .link { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 2px; vector-effect: non-scaling-stroke; }
     .fill { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 2px; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="1.6" markerHeight="1.6" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ffffff"/></marker></defs>
<text x="${column(0)}" y="24" font-weight="600">Two roads</text>
<text x="${column(1)}" y="24" font-weight="600">Junction</text>
<text x="${column(2)}" y="24" font-weight="600">No dead lanes</text>
${zDownPanel(
  column(0),
  { x: 0, z: 0 },
  laneScene(join.network, join.node, () => "link"),
  name({ x: -14, z: 15 }, "A") + name({ x: 14, z: 12 }, "B"),
)}
${zDownPanel(
  column(1),
  { x: 0, z: 0 },
  laneScene(cross.network, cross.node, (c) =>
    c.incoming.id.section === crossA ? "link" : null,
  ),
  name({ x: -15, z: 20 }, "A") +
    name({ x: -12, z: -19 }, "S") +
    name({ x: -19, z: -7 }, "L") +
    name({ x: 19, z: 8 }, "R"),
)}
${zDownPanel(
  column(2),
  { x: 0, z: 5 },
  // Lane 2 is the one in no window (docs/lanes.md, Junction).
  laneScene(tee.network, tee.node, (c) =>
    c.incoming.id.section !== teeA
      ? null
      : Math.abs(c.incoming.id.index) === 2
        ? "fill"
        : "link",
  ),
  name({ x: -15, z: 24 }, "A") +
    name({ x: -19, z: -7 }, "L") +
    name({ x: 19, z: 8 }, "R"),
)}
<text x="${column(0)}" y="${bottom + 26}">Wider spread over narrower, both ways:</text>
<text x="${column(0)}" y="${bottom + 46}">3 into 2 → 1→1, 2→2, 3→2.</text>
<text x="${column(1)}" y="${bottom + 26}">A window per turn group: left 1 lane,</text>
<text x="${column(1)}" y="${bottom + 46}">straight 2 in the middle, right 1.</text>
<text x="${column(2)}" y="${bottom + 26}">Lane 2 is in no window: it takes the</text>
<text x="${column(2)}" y="${bottom + 46}">connections of lane 3 (dashed).</text>
<text x="${column(0)}" y="${bottom + 84}" font-size="12" fill="${MUTED}">Lanes numbered from the centerline, right-hand traffic. Panels 2 and 3 draw only the connections from A.</text>`,
  );
}

/**
 * Straight roads leaving a node at the origin, each `degrees` from +x toward
 * +z, `ROAD_METERS` long; `sections` in the order of `roads`.
 */
function roadsAround(
  roads: readonly { degrees: number; profile: RoadProfile }[],
): { network: RoadNetwork; node: NodeId; sections: SectionId[] } {
  const network = new RoadNetwork();
  const [first, ...rest] = roads;
  const firstSection = network.addSection(
    { x: 0, z: 0 },
    toward(first.degrees, ROAD_METERS),
    STRAIGHT,
    first.profile,
  );
  const node = firstSection.from;
  const sections = [
    firstSection.id,
    ...rest.map(
      ({ degrees, profile }) =>
        network.addSection(
          node,
          toward(degrees, ROAD_METERS),
          STRAIGHT,
          profile,
        ).id,
    ),
  ];
  return { network, node, sections };
}

/**
 * The lane graph at `node`: the road surface, every lane with an arrowhead at
 * its exit, and the connections `styleOf` gives a style. `labels` numbers the
 * lanes those connect, past their far ends, at `(x, z)` as `zDownPanel`
 * places them.
 */
function laneScene(
  network: RoadNetwork,
  node: NodeId,
  styleOf: (connection: Connection) => LinkStyle | null,
): { ground: string; labels: string } {
  const layout = new RoadLayout(network);
  const graph = new LaneGraph(network, layout);
  let ground =
    roadwayShapes(layout) + junctionShape(layout.junctionAt(node).outline());
  for (const { centerline } of graph.allLanes()) {
    const { from, to, geometry } = centerline;
    const points = polylineBetween(from, to, geometry).map(svgPoint);
    ground += `<polyline class="lane" points="${points.join(" ")}"/>`;
  }

  const numbered = new Map<Lane, "entry" | "exit">();
  for (const connection of graph.connectionsAt(node)) {
    const style = styleOf(connection);
    if (style === null) {
      continue;
    }
    const { incoming, outgoing } = connection;
    ground += `<polyline class="${style}" points="${svgPoint(incoming.centerline.to)} ${svgPoint(outgoing.centerline.from)}"/>`;
    // Each lane's far end from the node: an incoming lane's entry, an
    // outgoing lane's exit.
    numbered.set(incoming, "entry");
    numbered.set(outgoing, "exit");
  }

  let labels = "";
  for (const [lane, end] of numbered) {
    const { from, to, geometry } = lane.centerline;
    const t = end === "entry" ? 0 : 1;
    const heading = lineDirectionAt(from, to, geometry, t);
    // Back from the entry, on past the exit.
    const step = end === "entry" ? -1.6 : 1.6;
    const at = end === "entry" ? from : to;
    labels += text(
      { x: at.x + step * heading.x, z: at.z + step * heading.z },
      String(Math.abs(lane.id.index)),
      NUMBER_METERS,
      400,
    );
  }
  return { ground, labels };
}

/**
 * A panel `PANEL_METERS` square around `center`, with +z down: `scene.ground`,
 * drawn z up by `svgPoint`, flipped back; `scene.labels` and `names` placed
 * at `(x, z)` as they are, so text reads the right way round.
 *
 * - flipped, a ground point shows at `y = z`
 * - `panel`'s square shows `y` from `−(minZ + size)` to `−minZ`
 * - → centered on `y = center.z` for the square around `(x, −center.z)`
 */
function zDownPanel(
  x: number,
  center: Vec2,
  scene: { ground: string; labels: string },
  names: string,
): string {
  return panel(
    x,
    34,
    PANEL_PIXELS,
    squareAt({ x: center.x, z: -center.z }, PANEL_METERS),
    `<g transform="scale(1,-1)">${scene.ground}</g>${scene.labels}${names}`,
  );
}

/** A road's name, at `(x, z)` on a `zDownPanel`. */
function name(at: Vec2, label: string): string {
  return text(at, label, NAME_METERS, 600);
}

function text(at: Vec2, label: string, size: number, weight: number): string {
  return (
    `<text x="${at.x}" y="${at.z}" font-size="${size}" font-weight="${weight}" ` +
    `text-anchor="middle" dominant-baseline="middle">${label}</text>`
  );
}
