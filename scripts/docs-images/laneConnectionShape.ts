import { arcCircle } from "../../src/core/geometry/arc";
import { biarcBetween, biarcPrimitives } from "../../src/core/geometry/biarc";
import {
  lineDirectionAt,
  nearestPointOnLine,
  pointOnLine,
  type Line,
  type PrimitiveLine,
} from "../../src/core/geometry/lineGeometry";
import {
  distance,
  lerp,
  unitDirection,
  type Vec2,
} from "../../src/core/geometry/point";
import { lineCrossing } from "../../src/core/geometry/segment";
import type { Connection } from "../../src/core/lanes/connection";
import { CONNECTION_CLEARANCE_METERS } from "../../src/core/lanes/connectionLine";
import { LaneGraph } from "../../src/core/lanes/LaneGraph";
import type { JunctionOutline } from "../../src/core/layout/outline";
import { RoadLayout } from "../../src/core/layout/RoadLayout";
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
  roadsAround,
  roadwayShapes,
} from "./layoutParts";
import { HIGHLIGHT, MUTED, picture, svgPoint, zDownPanel } from "./svg";

/**
 * docs/lanes.md, Shape: how a connection crosses a junction, one panel per
 * case, each the lane graph of a small network.
 *
 * Drawn with +z down, as the app shows the ground (`zDownPanel`).
 */

const PANEL_PIXELS = 300;
const GAP_PIXELS = 40;
const COLUMNS = 3;
/** From one row's panel top to the next: the panel, its caption, a title. */
const ROW_PIXELS = PANEL_PIXELS + 130;

/** The curve a connection would be without the rule, refused. */
const REFUSED = "#e8590c";
/** Sizes measured on the ground. */
const SIZE = "#2f6fdb";

const STYLE = `${LAYOUT_STYLE}
  .lane { fill: none; stroke: #ffffff; stroke-width: 1px; vector-effect: non-scaling-stroke; marker-end: url(#arrow); }
  .link { fill: none; stroke: ${HIGHLIGHT}; stroke-width: 2.5px; vector-effect: non-scaling-stroke; }
  .refused { fill: none; stroke: ${REFUSED}; stroke-width: 2px; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
  .helper { fill: none; stroke: ${MUTED}; stroke-width: 1px; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
  .size { fill: none; stroke: ${SIZE}; stroke-width: 1.2px; vector-effect: non-scaling-stroke; }`;

const ARROW = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="1.6" markerHeight="1.6" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ffffff"/></marker></defs>`;

/** One panel: a title, the ground it shows, and a caption under it. */
interface Panel {
  readonly title: string;
  /** The ground shown: `meters` square around `center`. */
  readonly center: Vec2;
  readonly meters: number;
  /** Drawn z up, flipped by `zDownPanel`. */
  readonly ground: string;
  /** Placed at `(x, z)` as it is: text. */
  readonly upright: string;
  readonly caption: readonly string[];
}

export function laneConnectionShape(): string {
  const panels = [
    longSetback(),
    theTurn(),
    aCross(),
    pastARoad(),
    sideBySide(),
    noCorner(),
  ];

  const rows = Math.ceil(panels.length / COLUMNS);
  const left = (i: number) => 20 + (i % COLUMNS) * (PANEL_PIXELS + GAP_PIXELS);
  const top = (i: number) => 40 + Math.floor(i / COLUMNS) * ROW_PIXELS;
  const drawn = panels.map((p, i) => {
    const x = left(i);
    const y = top(i);
    const caption = p.caption
      .map(
        (line, l) =>
          `<text x="${x}" y="${y + PANEL_PIXELS + 24 + l * 20}">${line}</text>`,
      )
      .join("");
    return (
      `<text x="${x}" y="${y - 12}" font-weight="600">${i + 1} · ${p.title}</text>` +
      zDownPanel(x, y, PANEL_PIXELS, p.center, p.meters, p.ground, p.upright) +
      caption
    );
  });

  const bottom = top(0) + rows * ROW_PIXELS - 30;
  return picture(
    left(COLUMNS - 1) + PANEL_PIXELS + 20,
    bottom + 50,
    STYLE,
    `${ARROW}
${drawn.join("\n")}
<text x="20" y="${bottom}" font-size="12" fill="${MUTED}">Right-hand traffic. Pink: connection. Orange, dashed: one curve from exit to entry, refused. Gray, dashed: lane line on to K, clearance c around a corner. Blue: sizes.</text>`,
  );
}

/**
 * A right turn with its lane ends far from the corner: A in from −x, turning
 * into B toward +z, and D and E 30° beside them, which set both far back.
 * Sections in the order A, B, D, E.
 */
function longSetbackJunction(
  profile: RoadProfile,
  length: number,
): LaneJunction {
  return laneJunction(
    [180, 90, 210, 60].map((degrees) => ({ degrees, profile })),
    length,
  );
}

/** Panel 1: lane ends far from the corner. */
function longSetback(): Panel {
  const junction = longSetbackJunction(ONE_LANE_PROFILE, 40);
  const [a, b] = junction.sections;
  const [turn] = connectionsFrom(junction, a, b);
  const { k, arc, c } = turnMarks(junction, turn);
  const exit = turn.incoming.centerline.to;
  const entry = turn.outgoing.centerline.from;
  const setback = junction.layout.junctionAt(junction.node).setbackOf(a);

  const size = 1.3;
  return {
    title: "Long setback: one curve leaves the road",
    center: { x: -6, z: 6 },
    meters: 30,
    ground:
      surfaceOf(junction) +
      piecesPath(curveWithoutRule(turn), "refused") +
      piecesPath(turn.centerline.pieces, "link") +
      clearance(c) +
      dot(k, 0.35) +
      dot(c, 0.35) +
      dot(exit, 0.35) +
      dot(entry, 0.35),
    upright:
      label({ x: k.x + 0.6, z: k.z - 0.6 }, "K", size, "start") +
      label({ x: c.x - 1.6, z: c.z + 1.6 }, "C", size, "end") +
      label({ x: exit.x + 0.6, z: exit.z + 1.4 }, "exit", size, "start") +
      label({ x: entry.x + 0.7, z: entry.z - 1.4 }, "entry", size, "start") +
      label({ x: -18, z: 6.5 }, "A", 2, "middle", 600) +
      label({ x: -6.5, z: 18 }, "B", 2, "middle", 600) +
      label({ x: -18, z: -6 }, "D", 2, "middle", 600) +
      label({ x: 7.5, z: 13.5 }, "E", 2, "middle", 600),
    caption: [
      `Lane ends ${setback.toFixed(1)} m back, set by D and E. One curve`,
      "from exit to entry (dashed) cuts across C. The turn:",
      `straight on, an arc of R = ${arc.radius.toFixed(2)} m near K, straight on.`,
    ],
  };
}

/** Panel 2: panel 1's corner close up — how wide the turn is. */
function theTurn(): Panel {
  const junction = longSetbackJunction(ONE_LANE_PROFILE, 40);
  const [a, b] = junction.sections;
  const [turn] = connectionsFrom(junction, a, b);
  const { k, arc, c } = turnMarks(junction, turn);
  const { center: m, piece } = arc;
  // Where the arc touches the lane lines, and its middle, nearest C.
  const p = piece.from;
  const q = piece.to;
  const middle = pointOnLine(p, q, piece.geometry, 0.5);

  const size = 0.5;
  // T beside each lane line, on the side away from the arc's center.
  const outP = unitDirection(m, p);
  const outQ = unitDirection(m, q);
  const beside = (point: Vec2, out: Vec2, meters: number): Vec2 => ({
    x: point.x + meters * out.x,
    z: point.z + meters * out.z,
  });
  const marks = [
    measure(
      beside(p, outP, 0.7),
      beside(k, outP, 0.7),
      "T",
      size,
      beside({ x: 0, z: 0 }, outP, 0.6),
    ),
    measure(
      beside(k, outQ, 0.7),
      beside(q, outQ, 0.7),
      "T",
      size,
      beside({ x: 0, z: 0 }, outQ, 0.6),
    ),
    measure(m, c, "R − c", size, sideOf(c, m)),
    measure(c, middle, "c", size, sideOf(m, c)),
  ];

  return {
    title: "The turn: the largest R that fits",
    center: lerp(m, k, 0.5),
    meters: 12,
    ground:
      surfaceOf(junction) +
      piecesPath(turn.centerline.pieces, "link") +
      `<polyline class="helper" points="${[p, k, q].map(svgPoint).join(" ")}"/>` +
      clearance(c) +
      marks.map((mark) => mark.ground).join("") +
      dot(k, 0.12) +
      dot(c, 0.12) +
      dot(m, 0.12),
    upright:
      marks.map((mark) => mark.upright).join("") +
      label({ x: k.x - 0.3, z: k.z + 0.4 }, "K", size, "end") +
      label({ x: c.x - 0.45, z: c.z - 0.45 }, "C", size, "end") +
      label({ x: m.x - 0.25, z: m.z + 0.35 }, "M", size, "end"),
    caption: [
      "An arc tangent to both lane lines, T = R·tan(θ/2)",
      "before and after K. R: the largest with T ≤ a,",
      `T ≤ b, c clear of every curb and corner: ${arc.radius.toFixed(2)} m.`,
    ],
  };
}

/** Panel 3: a cross of four roads, every turn from S. */
function aCross(): Panel {
  // S toward +z (down), W toward −x, N toward −z, E toward +x.
  const junction = laneJunction(
    [90, 180, 270, 0].map((degrees) => ({
      degrees,
      profile: ONE_LANE_PROFILE,
    })),
    22,
  );
  const [s, w, n, e] = junction.sections;
  const [left] = connectionsFrom(junction, s, w);
  const [right] = connectionsFrom(junction, s, e);
  const [straight] = connectionsFrom(junction, s, n);
  const corners = junction.layout
    .junctionAt(junction.node)
    .outline()
    .pieces.map(({ point }) => point);

  return {
    title: "A cross: every turn from S",
    center: { x: 0, z: 0 },
    meters: 18,
    ground:
      surfaceOf(junction) +
      [left, right, straight]
        .map(({ centerline }) => piecesPath(centerline.pieces, "link"))
        .join("") +
      corners.map(clearance).join(""),
    upright:
      label({ x: 5.5, z: 8 }, "S", 1.3, "middle", 600) +
      label({ x: -8, z: 5.5 }, "W", 1.3, "middle", 600) +
      label({ x: -5.5, z: -8 }, "N", 1.3, "middle", 600) +
      label({ x: 8, z: -5.5 }, "E", 1.3, "middle", 600),
    caption: [
      `Left round the far corner, R = ${arcOf(left).radius.toFixed(1)} m; right`,
      `round the near one, R = ${arcOf(right).radius.toFixed(1)} m. Only roadway`,
      "ends meet here: the corners alone keep it clear.",
    ],
  };
}

/** Panel 4: a turn past a road, with its corners on the inside. */
function pastARoad(): Panel {
  // S toward +z (down), W toward −x, NW up and to the left.
  const junction = laneJunction(
    [90, 180, 225].map((degrees) => ({ degrees, profile: ONE_LANE_PROFILE })),
    22,
  );
  const [s, , nw] = junction.sections;
  const [turn] = connectionsFrom(junction, s, nw);
  const outline = junction.layout.junctionAt(junction.node).outline();
  const corners = insideCorners(outline, turn);

  return {
    title: "A turn past a road",
    center: { x: -3, z: -1 },
    meters: 26,
    ground:
      surfaceOf(junction) +
      piecesPath(turn.centerline.pieces, "link") +
      corners.map(clearance).join("") +
      corners.map((corner) => dot(corner, 0.3)).join(""),
    upright:
      label({ x: 6, z: 9 }, "S", 1.8, "middle", 600) +
      label({ x: -13, z: 6.5 }, "W", 1.8, "middle", 600) +
      label({ x: -3, z: -12 }, "NW", 1.8, "start", 600),
    caption: [
      `S into NW, past W: R = ${arcOf(turn).radius.toFixed(1)} m. Every corner on`,
      "the inside keeps it clear; W's mouth between",
      "them is road, so a turn may cut across it.",
    ],
  };
}

/** Panel 5: two lanes turning side by side, one shape moved. */
function sideBySide(): Panel {
  const junction = longSetbackJunction(TWO_LANE_PROFILE, 50);
  const [a, b] = junction.sections;
  // Lane 1, then lane 2: turning right, lane 2 is the inner one.
  const [outer, inner] = connectionsFrom(junction, a, b);
  const { k, arc, c } = turnMarks(junction, inner);
  const outerArc = arcOf(outer);
  const m = arc.center;
  const middleOf = ({ from, to, geometry }: PrimitiveLine) =>
    pointOnLine(from, to, geometry, 0.5);
  const innerMiddle = middleOf(arc.piece);
  const outerMiddle = middleOf(outerArc.piece);

  const size = 0.9;
  const marks = [
    measure(m, innerMiddle, "R", size, sideOf(m, innerMiddle)),
    measure(innerMiddle, outerMiddle, "v", size, sideOf(m, innerMiddle)),
  ];
  return {
    title: "Side by side: one turn, moved",
    center: lerp(m, k, 0.5),
    meters: 24,
    ground:
      surfaceOf(junction) +
      piecesPath(outer.centerline.pieces, "link") +
      piecesPath(inner.centerline.pieces, "link") +
      clearance(c) +
      marks.map((mark) => mark.ground).join("") +
      dot(m, 0.25) +
      dot(c, 0.25),
    upright:
      marks.map((mark) => mark.upright).join("") +
      label({ x: m.x - 0.5, z: m.z + 0.7 }, "M", size, "end") +
      label({ x: c.x - 0.7, z: c.z - 0.7 }, "C", size, "end") +
      label({ x: m.x - 4, z: 0.4 }, "1", size) +
      label({ x: m.x - 4, z: 3.2 }, "2", size),
    caption: [
      `Lane 2 turns at R = ${arc.radius.toFixed(2)} m, as wide as C allows;`,
      `lane 1 is it moved by v: ${outerArc.radius.toFixed(2)} m round the same`,
      "M, v apart all along.",
    ],
  };
}

/** Panel 6: lane lines that make no corner — a biarc. */
function noCorner(): Panel {
  // A in from −x with two lanes, B on toward +x with one.
  const junction = laneJunction(
    [
      { degrees: 180, profile: TWO_LANE_PROFILE },
      { degrees: 0, profile: ONE_LANE_PROFILE },
    ],
    22,
  );
  const [a, b] = junction.sections;
  // 1→1 straight on, then 2→1 merging.
  const [, merge] = connectionsFrom(junction, a, b);
  const join = merge.centerline.pieces[0].to;
  const exit = merge.incoming.centerline.to;
  const h = headingAt(merge.incoming.centerline, 1);
  const onward = {
    x: exit.x + 9 * h.x,
    z: exit.z + 9 * h.z,
  };

  const size = 0.9;
  return {
    title: "No corner ahead: a biarc",
    center: { x: 2.4, z: 1 },
    meters: 20,
    ground:
      surfaceOf(junction) +
      `<polyline class="helper" points="${[exit, onward].map(svgPoint).join(" ")}"/>` +
      connectionsFrom(junction, a, b)
        .map(({ centerline }) => piecesPath(centerline.pieces, "link"))
        .join("") +
      dot(join, 0.2),
    upright:
      label({ x: join.x, z: join.z - 0.9 }, "J", size) +
      label({ x: -6.5, z: 0.7 }, "1", size) +
      label({ x: -6.5, z: 3.1 }, "2", size) +
      label({ x: -6, z: 9.5 }, "A", 1.3, "middle", 600) +
      label({ x: 10, z: 6 }, "B", 1.3, "middle", 600),
    caption: [
      "Lane lines parallel: no corner to cut. A biarc,",
      "as the Connector builds; here lane 2 merges",
      "into B's only lane. A U-turn is one too.",
    ],
  };
}

/** A small network of straight roads round a node, laid out, with its lanes. */
interface LaneJunction {
  readonly layout: RoadLayout;
  readonly graph: LaneGraph;
  readonly node: NodeId;
  /** In the order of the roads asked for. */
  readonly sections: readonly SectionId[];
}

/** Straight roads round a node (`roadsAround`), laid out, with their lanes. */
function laneJunction(
  roads: readonly { degrees: number; profile: RoadProfile }[],
  length: number,
): LaneJunction {
  const { network, node, sections } = roadsAround(roads, length);
  const layout = new RoadLayout(network);
  return { layout, graph: new LaneGraph(network, layout), node, sections };
}

/** The road surface and every lane on it, an arrowhead at each exit. */
function surfaceOf({ layout, graph, node }: LaneJunction): string {
  let ground =
    roadwayShapes(layout) + junctionShape(layout.junctionAt(node).outline());
  for (const { centerline } of graph.allLanes()) {
    const { from, to, geometry } = centerline;
    ground += piecesPath([{ from, to, geometry }], "lane");
  }
  return ground;
}

/** The connections at the node from section `from` into section `to`. */
function connectionsFrom(
  { graph, node }: LaneJunction,
  from: SectionId,
  to: SectionId,
): Connection[] {
  return graph
    .connectionsAt(node)
    .filter(
      (c) => c.incoming.id.section === from && c.outgoing.id.section === to,
    );
}

/**
 * What a picture marks on a turn round a corner: `K`, its arc, and `C`, the
 * corner of the junction nearest the arc.
 */
function turnMarks(
  { layout, node }: LaneJunction,
  turn: Connection,
): { k: Vec2; arc: ReturnType<typeof arcOf>; c: Vec2 } {
  const arc = arcOf(turn);
  return {
    k: cornerOf(turn),
    arc,
    c: cornerNearest(layout.junctionAt(node).outline(), arc.piece),
  };
}

/** Lines end to end as one polyline of class `cls`. */
function piecesPath(pieces: readonly Line[], cls: string): string {
  const points = pieces.flatMap(({ from, to, geometry }, index) =>
    // Each piece after the first starts where the one before ends.
    polylineBetween(from, to, geometry).slice(index === 0 ? 0 : 1),
  );
  return `<polyline class="${cls}" points="${points.map(svgPoint).join(" ")}"/>`;
}

/** Which way a line heads a fraction `t` along it. */
function headingAt({ from, to, geometry }: Line, t: number): Vec2 {
  return lineDirectionAt(from, to, geometry, t);
}

/**
 * `K`: where a connection's lane lines cross — the exit's carried on, the
 * entry's carried back (`docs/lanes.md`, Shape).
 */
function cornerOf({ incoming, outgoing }: Connection): Vec2 {
  const exit = incoming.centerline.to;
  const h = headingAt(incoming.centerline, 1);
  const entry = outgoing.centerline.from;
  const e = headingAt(outgoing.centerline, 0);
  const crossing = lineCrossing(
    exit,
    { x: exit.x + h.x, z: exit.z + h.z },
    { x: entry.x - e.x, z: entry.z - e.z },
    entry,
  );
  if (crossing === null) {
    throw new Error("The lane lines are parallel: no corner");
  }
  return crossing.point;
}

/** A connection's one arc, and the circle it runs on. */
function arcOf({ centerline }: Connection): {
  piece: PrimitiveLine;
  center: Vec2;
  radius: number;
} {
  for (const piece of centerline.pieces) {
    const { from, to, geometry } = piece;
    const circle =
      geometry.kind === "arc" ? arcCircle(from, to, geometry.via) : null;
    if (circle !== null) {
      return { piece, ...circle };
    }
  }
  throw new Error("The connection has no arc");
}

/**
 * The points of `outline`'s ring on the inside of a turn: on the side it
 * bends to of both lane lines. With `σ = sign(h × e)`, as `hasPassed` in
 * `connectionLine.ts`:
 *
 *     σ·(h × (X − exit)) > 0   and   σ·(e × (X − entry)) > 0
 */
function insideCorners(
  outline: JunctionOutline,
  { incoming, outgoing }: Connection,
): Vec2[] {
  const exit = incoming.centerline.to;
  const h = headingAt(incoming.centerline, 1);
  const entry = outgoing.centerline.from;
  const e = headingAt(outgoing.centerline, 0);
  const cross = (u: Vec2, v: Vec2) => u.x * v.z - u.z * v.x;
  const bend = Math.sign(cross(h, e));
  return outline.pieces
    .map(({ point }) => point)
    .filter(
      (point) =>
        bend * cross(h, { x: point.x - exit.x, z: point.z - exit.z }) > 0 &&
        bend * cross(e, { x: point.x - entry.x, z: point.z - entry.z }) > 0,
    );
}

/** The point of `outline`'s ring nearest `piece`. */
function cornerNearest(outline: JunctionOutline, piece: PrimitiveLine): Vec2 {
  const gap = (point: Vec2) =>
    distance(
      point,
      nearestPointOnLine(piece.from, piece.to, piece.geometry, point),
    );
  return outline.pieces
    .map(({ point }) => point)
    .reduce((best, point) => (gap(point) < gap(best) ? point : best));
}

/**
 * One curve from a connection's exit to its entry, smooth at both
 * (`biarcBetween`): what it would be with no rule to keep it clear of the
 * curbs.
 */
function curveWithoutRule({ incoming, outgoing }: Connection): PrimitiveLine[] {
  const exit = incoming.centerline.to;
  const entry = outgoing.centerline.from;
  const biarc = biarcBetween(
    exit,
    headingAt(incoming.centerline, 1),
    entry,
    headingAt(outgoing.centerline, 0),
  );
  if (biarc === null) {
    throw new Error("No curve from exit to entry");
  }
  return [...biarcPrimitives(exit, entry, biarc)];
}

/** The clearance `c` around a corner, dashed. */
function clearance(corner: Vec2): string {
  return `<circle class="helper" cx="${corner.x}" cy="${-corner.z}" r="${CONNECTION_CLEARANCE_METERS}"/>`;
}

/** A dot on the ground, `radius` meters. */
function dot(at: Vec2, radius: number): string {
  return `<circle cx="${at.x}" cy="${-at.z}" r="${radius}"/>`;
}

/** The unit vector square to the way from `a` to `b`: `(−d.z, d.x)`. */
function sideOf(a: Vec2, b: Vec2): Vec2 {
  const d = unitDirection(a, b);
  return { x: -d.z, z: d.x };
}

/**
 * A size measured on the ground: a line from `a` to `b` with a tick across
 * each end, and `text` beside its middle, `side` from it.
 */
function measure(
  a: Vec2,
  b: Vec2,
  text: string,
  size: number,
  side: Vec2,
): { ground: string; upright: string } {
  const across = sideOf(a, b);
  const tick = (p: Vec2) =>
    `M${svgPoint({ x: p.x - across.x * size * 0.4, z: p.z - across.z * size * 0.4 })} ` +
    `L${svgPoint({ x: p.x + across.x * size * 0.4, z: p.z + across.z * size * 0.4 })}`;
  const middle = lerp(a, b, 0.5);
  // Beside the line, running away from it: off its end facing it where the
  // side leans left or right, centered where it points up or down.
  const anchor = side.x > 0.3 ? "start" : side.x < -0.3 ? "end" : "middle";
  return {
    ground: `<path class="size" d="M${svgPoint(a)} L${svgPoint(b)} ${tick(a)} ${tick(b)}"/>`,
    upright: label(
      {
        x: middle.x + side.x * size * 1.4,
        z: middle.z + side.z * size * 1.4,
      },
      text,
      size,
      anchor,
      600,
      SIZE,
    ),
  };
}

/** Text at `(x, z)` on a `zDownPanel`, `size` meters high. */
function label(
  at: Vec2,
  text: string,
  size: number,
  anchor: "start" | "middle" | "end" = "middle",
  weight = 400,
  fill = "",
): string {
  const color = fill === "" ? "" : ` fill="${fill}"`;
  return (
    `<text x="${at.x}" y="${at.z}" font-size="${size}" font-weight="${weight}" ` +
    `text-anchor="${anchor}" dominant-baseline="middle"${color}>${text}</text>`
  );
}
