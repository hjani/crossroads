import { ONE_LANE_PROFILE } from "../../src/input/SectionSettings";
import { arcPolyline } from "../../src/core/geometry/arc";
import { STRAIGHT } from "../../src/core/geometry/lineGeometry";
import type { Vec2 } from "../../src/core/geometry/point";
import { Junction } from "../../src/core/layout/junction";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import type { NodeId, SectionId } from "../../src/core/network/types";
import {
  JUNCTION,
  junctionShape,
  LAYOUT_STYLE,
  roadwayShapes,
  toward,
} from "./layoutParts";
import {
  EDGE,
  HIGHLIGHT,
  MUTED,
  panel,
  picture,
  polygon,
  squareAt,
  svgPoint,
} from "./svg";

/**
 * docs/road-layout.md, Three or more roads: a 16 m road crossed by an 8 m
 * one at 30°. Each pair of its four legs makes the junction the two would
 * make alone, run along both roads to where their roadways begin; the
 * junction covers what any of them covers.
 */

interface Leg {
  readonly name: string;
  /** The direction it leaves the node, in degrees from +x toward +z. */
  readonly degrees: number;
  readonly width: number;
}

const LEGS: readonly Leg[] = [
  { name: "A'", degrees: 0, width: 16 },
  { name: "B", degrees: 30, width: 8 },
  { name: "A", degrees: 180, width: 16 },
  { name: "B'", degrees: 210, width: 8 },
];

/** Every pair of legs, by index, with what its own junction is. */
const PAIRS: readonly {
  readonly legs: readonly [number, number];
  readonly caption: readonly [string, string];
}[] = [
  {
    legs: [0, 1],
    caption: [
      "Neighbors 30° apart: a corner",
      "far out, where their curbs cross",
    ],
  },
  { legs: [0, 2], caption: ["The 16 m road going on:", "a straight band"] },
  {
    legs: [0, 3],
    caption: ["A bend between two widths,", "rounded on both sides"],
  },
  {
    legs: [1, 2],
    caption: ["The same bend, turned round —", "with the dip on top"],
  },
  { legs: [1, 3], caption: ["The 8 m road going on:", "a straight band"] },
  {
    legs: [2, 3],
    caption: [
      "Neighbors 30° apart: a corner",
      "far out, where their curbs cross",
    ],
  },
];

const ORIGIN: Vec2 = { x: 0, z: 0 };

/** How far each road runs from the node: past every panel's edge. */
const ROAD_LENGTH = 60;

const GROUND = squareAt(ORIGIN, 64);

/** The legs meeting at the origin, as a network, and their sections. */
function networkOf(legs: readonly Leg[]): {
  network: RoadNetwork;
  node: NodeId;
  ids: SectionId[];
} {
  const network = new RoadNetwork();
  const profile = (width: number) => ({ ...ONE_LANE_PROFILE, width });
  const first = network.addSection(
    ORIGIN,
    toward(legs[0].degrees, ROAD_LENGTH),
    STRAIGHT,
    profile(legs[0].width),
  );
  const ids = [first.id];
  for (const leg of legs.slice(1)) {
    ids.push(
      network.addSection(
        first.from,
        toward(leg.degrees, ROAD_LENGTH),
        STRAIGHT,
        profile(leg.width),
      ).id,
    );
  }
  return { network, node: first.from, ids };
}

const crossing = networkOf(LEGS);
const layout = new RoadLayout(crossing.network);
const junction = layout.junctionAt(crossing.node);
const setbacks = LEGS.map((_, i) => junction.setbackOf(crossing.ids[i]));

/** A junction's outline as a polygon, its arcs as fine chords. */
function ringOf(of: Junction): Vec2[] {
  const { pieces } = of.outline();
  return pieces.flatMap((piece, i) => {
    const from = pieces[(i + pieces.length - 1) % pieces.length].point;
    const run =
      piece.incomingGeometry.kind === "arc"
        ? arcPolyline(from, piece.point, piece.incomingGeometry.via, 0.005)
        : [from, piece.point];
    return run.slice(1);
  });
}

/** A leg's road, full width, from `from` to `to` meters out. */
function strip(leg: Leg, from: number, to: number): Vec2[] {
  const side = toward(leg.degrees + 90, leg.width / 2);
  const near = toward(leg.degrees, from);
  const far = toward(leg.degrees, to);
  return [
    { x: near.x + side.x, z: near.z + side.z },
    { x: far.x + side.x, z: far.z + side.z },
    { x: far.x - side.x, z: far.z - side.z },
    { x: near.x - side.x, z: near.z - side.z },
  ];
}

/**
 * The ground one pair covers: the junction its two legs make alone, and
 * each of the two roads on from where that junction ends it to where the
 * crossing's roadway begins.
 */
function pairShapes(i: number, j: number): Vec2[][] {
  const pair = networkOf([LEGS[i], LEGS[j]]);
  const alone = new Junction(pair.network, pair.node);
  const shapes = [ringOf(alone)].filter((ring) => ring.length >= 3);
  [i, j].forEach((leg, k) => {
    const own = alone.setbackOf(pair.ids[k]);
    if (setbacks[leg] > own) {
      shapes.push(strip(LEGS[leg], own, setbacks[leg]));
    }
  });
  return shapes;
}

/**
 * Shapes drawn as one: each outlined in `strokeMeters`, then all filled on
 * top, which covers every outline but the outer half of the shared one.
 */
function together(
  shapes: readonly Vec2[][],
  fill: string,
  strokeMeters: number,
): string {
  return (
    shapes
      .map((shape) =>
        polygon(
          shape,
          `fill="none" stroke="${EDGE}" stroke-width="${strokeMeters}" stroke-linejoin="round"`,
        ),
      )
      .join("") +
    shapes
      .map((shape) =>
        polygon(shape, `fill="${fill}" stroke="${fill}" stroke-width="0.15"`),
      )
      .join("")
  );
}

/** Every leg's centerline, and its name, the given ones picked out. */
function legGuides(picked: readonly number[], textSize: number): string {
  return LEGS.map((leg, i) => {
    const color = picked.includes(i) ? HIGHLIGHT : MUTED;
    const at = toward(leg.degrees, 27);
    return (
      `<path class="guide" d="M${svgPoint(ORIGIN)} L${svgPoint(toward(leg.degrees, ROAD_LENGTH))}" stroke="${color}"/>` +
      `<text x="${at.x}" y="${-at.z + textSize / 3}" font-size="${textSize}" font-weight="600" text-anchor="middle" fill="${color}">${leg.name}</text>`
    );
  }).join("");
}

/** The corners the junction turns at, where the curbs of A and B meet. */
function corners(textSize: number): string {
  const near = 8 * Math.sqrt(3) - 8;
  const far = 8 * Math.sqrt(3) + 8;
  return [
    { x: near, z: 8 },
    { x: far, z: 8 },
    { x: -near, z: -8 },
    { x: -far, z: -8 },
  ]
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${-p.z}" r="${textSize / 4}" fill="${HIGHLIGHT}"/>`,
    )
    .join("");
}

export function junctionPairs(): string {
  const small = 220;
  const large = 350;
  const left = 20;
  const top = 46;
  const smallDown = small + 54;
  const smallText = 4;
  const largeText = 3;
  const smallStroke = 2.4 / (small / GROUND.size);
  const caption = (x: number, y: number, n: number, lines: readonly string[]) =>
    `<circle cx="${x + 11}" cy="${y - 5}" r="11" fill="${HIGHLIGHT}"/>` +
    `<text x="${x + 11}" y="${y}" font-weight="600" fill="#ffffff" text-anchor="middle">${n}</text>` +
    lines
      .map(
        (line, i) =>
          `<text x="${x + 30}" y="${y + i * 17}" font-size="13">${line}</text>`,
      )
      .join("");

  const pairPanels = PAIRS.map(({ legs: [i, j], caption: lines }, n) => {
    const x = left + (n % 3) * (small + 20);
    const y = top + Math.floor(n / 3) * smallDown;
    const content =
      together(pairShapes(i, j), JUNCTION, smallStroke) +
      legGuides([i, j], smallText);
    return (
      panel(x, y, small, GROUND, content) +
      caption(x, y + small + 20, n + 1, lines)
    );
  }).join("\n");

  const bottom = top + 2 * smallDown;
  const overlaid =
    roadwayShapes(layout) +
    PAIRS.flatMap(({ legs: [i, j] }) => pairShapes(i, j))
      .map((shape) => polygon(shape, `fill="${HIGHLIGHT}" fill-opacity="0.12"`))
      .join("") +
    polygon(
      ringOf(junction),
      `fill="none" stroke="${EDGE}" stroke-width="1.5" vector-effect="non-scaling-stroke"`,
    ) +
    legGuides([], largeText);
  const result =
    roadwayShapes(layout) +
    junctionShape(junction.outline()) +
    corners(largeText) +
    legGuides([], largeText);
  const secondX = left + large + 30;

  return picture(
    secondX + large + 20,
    bottom + large + 104,
    `${LAYOUT_STYLE}
     .guide { fill: none; stroke-width: 1px; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }`,
    `<text x="${left}" y="28" font-weight="600">A 16 m road crossed by an 8 m one at 30°: every two of its four legs, alone, then all together</text>
${pairPanels}
${panel(left, bottom, large, GROUND, overlaid)}
${caption(left, bottom + large + 20, 7, ["All six together: darker where more of", "them cover the ground. Line: their outline"])}
${panel(secondX, bottom, large, GROUND, result)}
${caption(secondX, bottom + large + 20, 8, ["The junction, cut back to the roadways:", "four corners, where the curbs cross"])}
<text x="${left}" y="${bottom + large + 70}" font-size="12" fill="${MUTED}">Dashed: each leg's centerline, the pair's own in color. Light: a junction. Dark: the roadways,</text>
<text x="${left}" y="${bottom + large + 88}" font-size="12" fill="${MUTED}">where they begin in the crossing. Dots: the corners.</text>`,
  );
}
