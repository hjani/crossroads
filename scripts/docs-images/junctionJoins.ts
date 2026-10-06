import { ONE_LANE_PROFILE } from "../../src/input/SectionSettings";
import {
  arcCircle,
  arcPolyline,
  arcViaLeaving,
  type ArcCircle,
} from "../../src/core/geometry/arc";
import {
  STRAIGHT,
  type LineGeometry,
} from "../../src/core/geometry/lineGeometry";
import { distance, type Vec2 } from "../../src/core/geometry/point";
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
  MUTED,
  panel,
  picture,
  squareAt,
  svgPoint,
} from "./svg";

/**
 * docs/road-layout.md, Junction: how a junction's outline joins each gap, one
 * numbered case per panel, which the note refers to by number.
 */

interface Road {
  /** The direction it leaves the node, in degrees from +x toward +z. */
  readonly degrees: number;
  readonly width: number;
  /**
   * The radius it curves at, turning counterclockwise (+) or clockwise (−)
   * as it leaves the node. Straight without one.
   */
  readonly turning?: number;
}

interface Case {
  readonly caption: readonly string[];
  readonly roads: readonly Road[];
  /** Labels the outline doesn't show by itself. */
  readonly marks?: readonly { readonly at: Vec2; readonly text: string }[];
}

const CASES: readonly Case[] = [
  {
    caption: ["Equal widths: a corner at P on one", "side, round on the other"],
    roads: [
      { degrees: 0, width: 8 },
      { degrees: 70, width: 8 },
    ],
  },
  {
    caption: ["A dead end: one gap of 360°,", "a round cap"],
    roads: [{ degrees: 0, width: 8 }],
  },
  {
    caption: [
      "90° bend: the circle slides by s",
      "until it touches the narrower curb",
    ],
    roads: [
      { degrees: 0, width: 16 },
      { degrees: 90, width: 8 },
    ],
  },
  {
    caption: [
      "70° bend: the narrower curb runs on",
      "past the node to the circle",
    ],
    roads: [
      { degrees: 0, width: 16 },
      { degrees: 110, width: 8 },
    ],
  },
  {
    caption: [
      "30° bend: the circle rounds off the",
      "T–X piece, outside and inside",
    ],
    roads: [
      { degrees: 0, width: 16 },
      { degrees: 150, width: 8 },
    ],
  },
  {
    caption: ["Straight: the T–X piece on both", "sides alike, a taper"],
    roads: [
      { degrees: 0, width: 16 },
      { degrees: 180, width: 8 },
    ],
  },
  {
    caption: [
      "A curving road: the T–X piece is",
      "its curb swung about X, not straight",
    ],
    roads: [
      { degrees: 0, width: 16 },
      { degrees: 200, width: 8, turning: -16 },
    ],
  },
  {
    caption: [
      "A road set back further than a gap",
      "asks follows its curb back to P",
    ],
    roads: [
      { degrees: 0, width: 8 },
      { degrees: 60, width: 8 },
      { degrees: 180, width: 8 },
    ],
    marks: [{ at: { x: -4 / Math.sqrt(3), z: 4 }, text: "P" }],
  },
  {
    caption: [
      "120° gap: where the corner turns",
      "round, P, T and X are one point",
    ],
    roads: [
      { degrees: 0, width: 16 },
      { degrees: 120, width: 8 },
    ],
    marks: [
      { at: { x: 0, z: 8 }, text: "P" },
      { at: { x: 0, z: 8 }, text: "X" },
    ],
  },
];

/** The order labels at one point are read in: "P = T = X". */
const LABEL_ORDER = ["N", "P", "T", "X", "O"];

/** A slide shorter than this has its center labeled, but no dimension. */
const MIN_DIMENSIONED_SLIDE = 3;

const ORIGIN: Vec2 = { x: 0, z: 0 };

/** How far each road runs from the node: past the panel's edge. */
const ROAD_LENGTH = 30;

export function junctionJoins(): string {
  const size = 290;
  const across = size + 25;
  const down = size + 78;
  const top = 34;
  const panels = CASES.map((c, i) =>
    casePanel(
      20 + (i % 3) * across,
      top + Math.floor(i / 3) * down,
      size,
      c,
      i + 1,
    ),
  ).join("\n");
  const bottom = top + 3 * down;
  return picture(
    20 + 2 * across + size + 20,
    bottom + 40,
    `${LAYOUT_STYLE}
     .guide { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 1px; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }
     .chord { fill: none; stroke: ${MUTED}; stroke-width: 1.2px; stroke-dasharray: 2 3; vector-effect: non-scaling-stroke; }`,
    `<text x="20" y="22" font-weight="600">How a junction's outline joins each gap</text>
${panels}
<text x="20" y="${bottom}" font-size="12" fill="${MUTED}">N: the node. P: a corner. T: beside the node on the wider road. X: where the narrower curb crosses the circle about N with the wider road's w/2.</text>
<text x="20" y="${bottom + 20}" font-size="12" fill="${MUTED}">O: the center of a slid circle, s its slide. Thick: where each roadway ends. Dashed: centerlines, and each round join's circle. Dotted: the T–X straight.</text>`,
  );
}

/** One case: the junction where its roads meet, labeled, and its caption. */
function casePanel(
  x: number,
  y: number,
  pixels: number,
  c: Case,
  number: number,
): string {
  const network = new RoadNetwork();
  const shapes = c.roads.map(shapeOf);
  const first = network.addSection(ORIGIN, shapes[0].end, shapes[0].geometry, {
    ...ONE_LANE_PROFILE,
    width: c.roads[0].width,
  });
  const node = first.from;
  c.roads.slice(1).forEach((road, i) => {
    const { end, geometry } = shapes[i + 1];
    network.addSection(node, end, geometry, {
      ...ONE_LANE_PROFILE,
      width: road.width,
    });
  });
  const layout = new RoadLayout(network);
  const { pieces } = layout.junctionAt(node).outline();
  const radius = Math.max(...c.roads.map((road) => road.width)) / 2;

  let content =
    roadwayShapes(layout) + junctionShape(layout.junctionAt(node).outline());
  content += shapes
    .map(({ end, geometry }) => {
      const run =
        geometry.kind === "arc"
          ? arcPolyline(ORIGIN, end, geometry.via, 0.005)
          : [ORIGIN, end];
      return `<polyline class="guide" points="${run.map(svgPoint).join(" ")}"/>`;
    })
    .join("");

  // Each round join's circle: the arcs of the wider road's w/2. Slid off the
  // node, its center O and the slide s.
  const circles: ArcCircle[] = [];
  pieces.forEach((piece, i) => {
    const geometry = piece.incomingGeometry;
    if (geometry.kind !== "arc") {
      return;
    }
    const from = pieces[(i + pieces.length - 1) % pieces.length].point;
    const circle = arcCircle(from, piece.point, geometry.via);
    if (
      circle !== null &&
      Math.abs(circle.radius - radius) < 0.01 &&
      !circles.some((seen) => distance(seen.center, circle.center) < 0.01)
    ) {
      circles.push(circle);
    }
  });

  const labels = new Map<string, { at: Vec2; texts: string[] }>();
  const label = (at: Vec2, text: string) => {
    const key = `${at.x.toFixed(2)},${at.z.toFixed(2)}`;
    const entry = labels.get(key) ?? { at, texts: [] };
    if (!entry.texts.includes(text)) {
      entry.texts.push(text);
    }
    labels.set(key, entry);
  };

  for (const { center } of circles) {
    content += `<circle class="guide" cx="${center.x}" cy="${-center.z}" r="${radius}"/>`;
    const slide = distance(center, ORIGIN);
    if (slide > 0.01) {
      if (slide >= MIN_DIMENSIONED_SLIDE) {
        content += dimension(ORIGIN, center, "s", 1.2);
      }
      label(center, "O");
    }
  }

  // P where two roadway ends meet; T at a road's curb beside the node; X
  // where the narrower curb meets the circle about the node, with the T–X
  // straight it would run along unswung and unrounded: from the wider road's
  // T on the side of X's own gap.
  const besideNode = c.roads.flatMap((road) => [
    toward(road.degrees + 90, road.width / 2),
    toward(road.degrees - 90, road.width / 2),
  ]);
  const wider = c.roads.find((road) => road.width / 2 === radius);
  const narrower = c.roads.find((road) => road.width / 2 < radius);
  pieces.forEach((piece, i) => {
    const before = pieces[(i + pieces.length - 1) % pieces.length];
    if (piece.edge === "roadwayEnd" && before.edge === "roadwayEnd") {
      label(before.point, "P");
    }
    if (besideNode.some((t) => distance(t, piece.point) < 0.01)) {
      label(piece.point, "T");
    } else if (
      wider !== undefined &&
      narrower !== undefined &&
      Math.abs(distance(ORIGIN, piece.point) - radius) < 0.01
    ) {
      // Counterclockwise from the wider road, X's gap runs on to the
      // narrower one, or comes back to the wider one from it.
      const round = (degrees: number) => ((degrees % 360) + 360) % 360;
      const ofX = round(
        (Math.atan2(piece.point.z, piece.point.x) * 180) / Math.PI -
          wider.degrees,
      );
      const ofNarrower = round(narrower.degrees - wider.degrees);
      const t = toward(wider.degrees + (ofX < ofNarrower ? 90 : -90), radius);
      content += `<path class="chord" d="M${svgPoint(t)} L${svgPoint(piece.point)}"/>`;
      label(t, "T");
      label(piece.point, "X");
    }
  });
  for (const mark of c.marks ?? []) {
    label(mark.at, mark.text);
  }
  label(ORIGIN, "N");

  // N's text to its left, O's under the centerline: a short slide puts them
  // close together.
  for (const { at, texts } of labels.values()) {
    texts.sort((a, b) => LABEL_ORDER.indexOf(a) - LABEL_ORDER.indexOf(b));
    const text = texts.join(" = ");
    const [dx, dz, anchor] =
      text === "N"
        ? [-0.5, 0.5, "end"]
        : text === "O"
          ? [0.4, -1.7, "start"]
          : [0.5, 0.5, "start"];
    content +=
      `<circle cx="${at.x}" cy="${-at.z}" r="0.3" fill="${HIGHLIGHT}"/>` +
      `<text x="${at.x + dx}" y="${-(at.z + dz)}" font-size="1.4" font-weight="600" text-anchor="${anchor}" fill="${HIGHLIGHT}">${text}</text>`;
  }

  const captionTop = y + pixels + 22;
  return (
    panel(x, y, pixels, squareAt(ORIGIN, 30), content) +
    `<circle cx="${x + 11}" cy="${captionTop - 5}" r="11" fill="${HIGHLIGHT}"/>` +
    `<text x="${x + 11}" y="${captionTop}" font-weight="600" fill="#ffffff" text-anchor="middle">${number}</text>` +
    c.caption
      .map(
        (line, i) =>
          `<text x="${x + 30}" y="${captionTop + i * 19}">${line}</text>`,
      )
      .join("")
  );
}

/** Where a road ends, and how it runs there from the node. */
function shapeOf(road: Road): { end: Vec2; geometry: LineGeometry } {
  if (road.turning === undefined) {
    return { end: toward(road.degrees, ROAD_LENGTH), geometry: STRAIGHT };
  }

  // The center lies square to the leaving direction, on the side it turns
  // to; from there the road runs ROAD_LENGTH round the circle.
  const radius = Math.abs(road.turning);
  const turn = Math.sign(road.turning);
  const center = toward(road.degrees + turn * 90, radius);
  const start = Math.atan2(-center.z, -center.x);
  const angle = start + (turn * ROAD_LENGTH) / radius;
  const end = {
    x: center.x + radius * Math.cos(angle),
    z: center.z + radius * Math.sin(angle),
  };
  const via = arcViaLeaving(ORIGIN, toward(road.degrees, 1), end);
  if (via === null) {
    throw new Error(`No arc leaving at ${road.degrees}° to its end`);
  }
  return { end, geometry: { kind: "arc", via } };
}
