import { arcPolyline } from "../../src/core/geometry/arc";
import { biarcBetween } from "../../src/core/geometry/biarc";
import type { LineGeometry } from "../../src/core/geometry/lineGeometry";
import type { Vec2 } from "../../src/core/geometry/point";
import {
  dimension,
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
 * docs/road-network.md, Biarcs: where `J` goes. Each piece rounds off a
 * corner, `Q0` or `Q1`, and `J` is placed so both corners are the same
 * distance `d` from their ends.
 */

const FIRST_COLOR = "#2f6fdb";
const SECOND_COLOR = "#2b9348";
const TEXT_METERS = 1.4;

export function biarc(): string {
  const from = { x: 0, z: 0 };
  const leaving = { x: 1, z: 0 };
  const to = { x: 40, z: 20 };
  const arriving = { x: 0, z: 1 };
  const shape = biarcBetween(from, leaving, to, arriving);
  if (shape === null) {
    throw new Error("biarc picture: no biarc between its ends");
  }
  const { join } = shape;

  // The corner of the first piece: on its leaving line, as far from `from`
  // as from `J` → d = |c|² / 2(c·t0), with c = J − from.
  const chordX = join.x - from.x;
  const chordZ = join.z - from.z;
  const d =
    (chordX * chordX + chordZ * chordZ) /
    (2 * (chordX * leaving.x + chordZ * leaving.z));
  const q0 = { x: from.x + d * leaving.x, z: from.z + d * leaving.z };
  const q1 = { x: to.x - d * arriving.x, z: to.z - d * arriving.z };

  const piece = (a: Vec2, b: Vec2, geometry: LineGeometry, color: string) => {
    const points =
      geometry.kind === "arc" ? arcPolyline(a, b, geometry.via, 0.01) : [a, b];
    return `<polyline class="piece" stroke="${color}" points="${points.map(svgPoint).join(" ")}"/>`;
  };
  const dot = (p: Vec2, color: string, r: number) =>
    `<circle cx="${p.x}" cy="${-p.z}" r="${r}" fill="${color}"/>`;
  const label = (
    p: Vec2,
    text: string,
    dx: number,
    dz: number,
    anchor = "start",
  ) =>
    `<text x="${p.x + dx}" y="${-(p.z + dz)}" font-size="${TEXT_METERS}" ` +
    `text-anchor="${anchor}" dominant-baseline="middle">${text}</text>`;
  const arrow = (a: Vec2, b: Vec2) =>
    `<path class="arrow" d="M${svgPoint(a)} L${svgPoint(b)}" marker-end="url(#head)"/>`;

  // Each dimension goes the way that puts its label outside the corner.
  const content =
    `<defs><marker id="head" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="1.4" ` +
    `markerHeight="1.4" markerUnits="userSpaceOnUse" orient="auto">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker></defs>` +
    dimension(q0, from, "d", TEXT_METERS) +
    dimension(join, q0, "d", TEXT_METERS) +
    dimension(q1, join, "d", TEXT_METERS) +
    dimension(to, q1, "d", TEXT_METERS) +
    piece(from, join, shape.first, FIRST_COLOR) +
    piece(join, to, shape.second, SECOND_COLOR) +
    arrow({ x: from.x - 5, z: from.z }, { x: from.x - 0.6, z: from.z }) +
    arrow({ x: to.x, z: to.z + 0.6 }, { x: to.x, z: to.z + 5 }) +
    dot(q0, MUTED, 0.35) +
    dot(q1, MUTED, 0.35) +
    dot(from, INK, 0.5) +
    dot(to, INK, 0.5) +
    dot(join, INK, 0.5) +
    label(from, "P0", -0.4, 1.4, "end") +
    label({ x: from.x - 5, z: from.z }, "t0", 0, -1.4) +
    label(to, "P1", -0.8, -0.4, "end") +
    label({ x: to.x, z: to.z + 5 }, "t1", 0.8, -0.6) +
    label(q0, "Q0", 0, -1.4, "middle") +
    label(q1, "Q1", 0.8, 0) +
    label(join, "J", -0.4, 1.4, "end");

  const size = 520;
  const ground = squareAround([from, to, { x: from.x - 5, z: from.z }], 4);
  // Wider than tall: show only as much height as the drawing needs, t1 included.
  const height = Math.round((size * (to.z + 7 - ground.minZ)) / ground.size);
  return picture(
    size + 40,
    34 + height + 110,
    `.piece { fill: none; stroke-width: 3px; vector-effect: non-scaling-stroke; }
     .arrow { fill: none; stroke: ${INK}; stroke-width: 1.5px; vector-effect: non-scaling-stroke; }`,
    `<text x="20" y="24" font-weight="600">A biarc: J where both pieces' tangent lengths d are equal</text>
${panel(20, 34, size, ground, content, height)}
${legend(20, 34 + height + 30, 260, [
  { fill: FIRST_COLOR, label: "First piece, P0 to J" },
  { fill: SECOND_COLOR, label: "Second piece, J to P1" },
])}
<text x="20" y="${34 + height + 70}">Each piece rounds off a corner, Q0 or Q1. J is the midpoint of Q0–Q1.</text>
<text x="20" y="${34 + height + 94}" font-size="12" fill="${MUTED}">Leaving P0 heading t0, arriving at P1 heading t1. <tspan fill="${HIGHLIGHT}">d</tspan>: the same on all four stretches.</text>`,
  );
}
