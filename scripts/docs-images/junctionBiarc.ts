import { ONE_LANE_PROFILE } from "../../src/input/SectionSettings";
import { arcCircle, arcPolyline } from "../../src/core/geometry/arc";
import { biarcBetween } from "../../src/core/geometry/biarc";
import {
  lineDirectionAt,
  lineLength,
  pointOnLine,
  primitivesOf,
  STRAIGHT,
  type PrimitiveLine,
} from "../../src/core/geometry/lineGeometry";
import { distance, lerp, type Vec2 } from "../../src/core/geometry/point";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
import { applySectionPlan, planSection } from "../../src/core/network/edits";
import { RoadNetwork } from "../../src/core/network/RoadNetwork";
import { junctionShape, LAYOUT_STYLE, roadwayShapes } from "./layoutParts";
import {
  dimension,
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
 * docs/road-layout.md, Junction: a biarc crossed a few meters before its
 * join `J`, its setback running past `J`.
 *
 * 1. The junction covers the whole first piece, from the node `N` to `J`,
 *    and the roadway begins on the second.
 * 2. The junction is worked out again on the second piece, continued back
 *    from `J`: that misses `N`, and the curb found on it runs a little off
 *    the road's own.
 *
 * A gentle first piece and a tight second, crossed at a sharp angle, so both
 * show at picture scale.
 */

const SECOND_PIECE = "#1c7ed6";
/** How far before `J` the straight crosses, along the road. */
const CROSSING_BEFORE_JOIN = 6;
/** The angle between the straight and the biarc where they cross. */
const CROSSING_DEGREES = 50;
const HALF_WIDTH = ONE_LANE_PROFILE.width / 2;

export function junctionBiarc(): string {
  const network = new RoadNetwork();
  const start = { x: 0, z: 0 };
  const end = { x: 40, z: 20 };
  const biarc = biarcBetween(start, { x: 1, z: 0 }, end, { x: 0, z: 1 });
  if (biarc === null) {
    throw new Error("No biarc to draw");
  }
  const original = { kind: "biarc", biarc } as const;
  network.addSection(start, end, original, ONE_LANE_PROFILE);

  // A straight across the first piece, turned clockwise of the road so it
  // doesn't meet the tight second piece as well.
  const t =
    (lineLength(start, biarc.join, biarc.first) - CROSSING_BEFORE_JOIN) /
    lineLength(start, end, original);
  const crossing = pointOnLine(start, end, original, t);
  const heading = lineDirectionAt(start, end, original, t);
  const angle = (CROSSING_DEGREES * Math.PI) / 180;
  const along = {
    x: heading.x * Math.cos(angle) + heading.z * Math.sin(angle),
    z: heading.z * Math.cos(angle) - heading.x * Math.sin(angle),
  };
  const plan = planSection(
    network,
    { x: crossing.x - 25 * along.x, z: crossing.z - 25 * along.z },
    { x: crossing.x + 25 * along.x, z: crossing.z + 25 * along.z },
    STRAIGHT,
    ONE_LANE_PROFILE,
  );
  if (!plan.buildable) {
    throw new Error("The crossing can't be built");
  }
  applySectionPlan(network, plan);

  // What is left of the biarc past the crossing, from the crossing's node.
  const cut = [...network.allSections()].find(
    (section) => section.centerlineGeometry.kind === "biarc",
  );
  if (cut === undefined) {
    throw new Error("The crossing left no biarc");
  }
  const node = network.getNode(cut.from).position;
  const [firstPiece, secondPiece] = primitivesOf(
    node,
    network.getNode(cut.to).position,
    cut.centerlineGeometry,
  );
  const join = firstPiece.to;
  const layout = new RoadLayout(network);
  const ground =
    roadwayShapes(layout) +
    junctionShape(layout.junctionAt(cut.from).outline());

  // 1: the whole picture.
  const overview =
    ground +
    line(pointsOf(primitivesOf(start, join, biarc.first)[0]), MUTED, 1, "4 3") +
    line(pointsOf(firstPiece), HIGHLIGHT, 3) +
    line(pointsOf(secondPiece), SECOND_PIECE, 3) +
    dot(node, 0.5) +
    dot(join, 0.5) +
    label({ x: node.x - 0.8, z: node.z - 1.8 }, "N", 2.2, "end") +
    label({ x: join.x - 0.4, z: join.z + 2 }, "J", 2.2, "end");

  // 2: the second piece continued back from J, past N, beside the road from
  // N to J with the curbs of both.
  const back = continuedBack(secondPiece, distance(node, join) + 3);
  const missed = nearestOnCircle(back, node);
  const zoom =
    ground +
    [-1, 0, 1]
      .map(
        (side) =>
          line(offset(pointsOf(firstPiece), firstPiece, side), HIGHLIGHT, 2) +
          line(offset(back.points, back.piece, side), SECOND_PIECE, 2, "5 3"),
      )
      .join("") +
    dimension(node, missed, "misses N", 0.45) +
    // Both curbs on the side the second piece curves to, beside N.
    dimension(
      offset([node], firstPiece, -1)[0],
      nearestOnCircle(
        {
          points: offset(back.points, back.piece, -1),
          piece: back.piece,
        },
        offset([node], firstPiece, -1)[0],
      ),
      "curb off",
      0.45,
    ) +
    dot(node, 0.12) +
    dot(join, 0.12) +
    label({ x: node.x - 0.3, z: node.z - 0.4 }, "N", 0.55, "end") +
    label({ x: join.x - 0.2, z: join.z + 0.5 }, "J", 0.55, "end");

  const size = 420;
  const legendTop = 34 + size + 30;
  const notesTop = legendTop + 26 + 18;
  const notes = [
    "1: the biarc is crossed before its join J, and its setback runs past J: the junction covers the whole",
    "first piece, and the roadway begins on the second, where the junction ends.",
    "2: the junction is worked out again on the second piece, continued back from J. That misses N, and",
    "the curb found on it runs off the road's own between N and J; the roadway's end still lies on the road.",
  ];
  return picture(
    2 * size + 60,
    notesTop + notes.length * 20,
    LAYOUT_STYLE,
    `<text x="20" y="24" font-weight="600">1. The whole first piece in the junction</text>
<text x="${size + 40}" y="24" font-weight="600">2. Measured on the second piece</text>
${panel(20, 34, size, squareAt(lerp(node, join, 0.5), 50), overview)}
${panel(size + 40, 34, size, squareAt(lerp(node, join, 0.4), 11), zoom)}
${legend(20, legendTop, 300, [
  { fill: HIGHLIGHT, label: "first piece, node N to J, and its curbs" },
  {
    fill: SECOND_PIECE,
    label: "second piece, and its continuation back from J",
  },
])}
${notes
  .map(
    (text, i) =>
      `<text x="20" y="${notesTop + i * 20}" font-size="12" fill="${MUTED}">${text}</text>`,
  )
  .join("\n")}`,
  );
}

/** A straight or an arc as points, fine enough to draw. */
function pointsOf(piece: PrimitiveLine): Vec2[] {
  const { from, to, geometry } = piece;
  return geometry.kind === "arc"
    ? arcPolyline(from, to, geometry.via, 0.005)
    : [from, to];
}

/**
 * An arc piece continued back past its start by `meters`, as points ending
 * at its start, with the piece it continues.
 */
function continuedBack(
  piece: PrimitiveLine,
  meters: number,
): { points: Vec2[]; piece: PrimitiveLine } {
  const { from, to, geometry } = piece;
  if (geometry.kind !== "arc") {
    const d = lineDirectionAt(from, to, geometry, 0);
    return {
      points: [{ x: from.x - meters * d.x, z: from.z - meters * d.z }, from],
      piece,
    };
  }
  const circle = arcCircle(from, to, geometry.via);
  if (circle === null) {
    throw new Error("No circle to continue");
  }
  const { center, radius } = circle;
  const d = lineDirectionAt(from, to, geometry, 0);
  const startAngle = Math.atan2(from.z - center.z, from.x - center.x);
  // Counterclockwise when the heading turns left of the radius out.
  const turn = Math.sign((from.x - center.x) * d.z - (from.z - center.z) * d.x);
  const steps = 60;
  const points = Array.from({ length: steps + 1 }, (_, k) => {
    const a = startAngle - (turn * meters * (1 - k / steps)) / radius;
    return {
      x: center.x + radius * Math.cos(a),
      z: center.z + radius * Math.sin(a),
    };
  });
  return { points, piece };
}

/** The point of a continued piece's circle, or line, nearest `p`. */
function nearestOnCircle(
  back: { points: Vec2[]; piece: PrimitiveLine },
  p: Vec2,
): Vec2 {
  return back.points.reduce((best, q) =>
    distance(q, p) < distance(best, p) ? q : best,
  );
}

/**
 * Points of a piece's centerline moved `side · w/2` across it: one of its
 * curbs, or the centerline itself at 0. Square to the piece: out from an
 * arc's center, or along a straight's normal.
 */
function offset(
  points: readonly Vec2[],
  piece: PrimitiveLine,
  side: number,
): Vec2[] {
  const { from, to, geometry } = piece;
  const circle =
    geometry.kind === "arc" ? arcCircle(from, to, geometry.via) : null;
  if (circle === null) {
    const d = lineDirectionAt(from, to, geometry, 0);
    return points.map((p) => ({
      x: p.x - side * HALF_WIDTH * d.z,
      z: p.z + side * HALF_WIDTH * d.x,
    }));
  }
  return points.map((p) => {
    const r = distance(p, circle.center);
    const scale = (r + side * HALF_WIDTH) / r;
    return {
      x: circle.center.x + (p.x - circle.center.x) * scale,
      z: circle.center.z + (p.z - circle.center.z) * scale,
    };
  });
}

function line(
  points: readonly Vec2[],
  color: string,
  width: number,
  dashes = "none",
): string {
  return (
    `<polyline points="${points.map(svgPoint).join(" ")}" fill="none" ` +
    `stroke="${color}" stroke-width="${width}" stroke-dasharray="${dashes}" ` +
    `vector-effect="non-scaling-stroke"/>`
  );
}

function dot(p: Vec2, radius: number): string {
  return `<circle cx="${p.x}" cy="${-p.z}" r="${radius}" fill="${INK}"/>`;
}

function label(
  at: Vec2,
  text: string,
  size: number,
  anchor: "start" | "end",
): string {
  return (
    `<text x="${at.x}" y="${-at.z}" font-size="${size}" font-weight="600" ` +
    `text-anchor="${anchor}" dominant-baseline="middle" fill="${INK}">${text}</text>`
  );
}
