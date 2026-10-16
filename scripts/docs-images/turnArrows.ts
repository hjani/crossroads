import type { Vec2 } from "../../src/core/geometry/point";
import { LANE_WIDTH_METERS } from "../../src/core/lanes/lane";
import type { Turns } from "../../src/core/lanes/turnArrows";
import {
  DASH_PERIOD_METERS,
  TURN_ARROW_LENGTH_METERS,
} from "../../src/core/layout/markings";
import { arrowShape } from "../../src/render/turnArrowShapes";
import { dimension, HIGHLIGHT, MUTED, panel, picture, polygon } from "./svg";

/**
 * docs/road-markings.md: turn arrow shapes, each in a lane, drawn from the
 * outlines the app draws them with.
 */

/** roadSurface.frag.glsl: `LINE_WIDTH`, in meters. */
const LINE_WIDTH = 0.1;

const ASPHALT = "#66655f";
const PAINT = "#ffffff";
/** Labels on the asphalt. */
const ON_ASPHALT = "#e4e2da";

const CASES: readonly { readonly turns: Turns; readonly caption: string }[] = [
  { turns: turns(false, true, false), caption: "straight" },
  { turns: turns(false, false, true), caption: "right" },
  { turns: turns(false, true, true), caption: "straight + right" },
  { turns: turns(true, true, true), caption: "left + straight + right" },
];

export function turnArrows(): string {
  const A = TURN_ARROW_LENGTH_METERS;
  const panelWidth = 280;
  const panelHeight = 320;
  // A lane and a half-meter more each way: the tip 0.5 m from the top.
  const ground = { minX: -1.75, minZ: -A - 0.5, size: 3.5 };
  const text = 0.2;

  const extras = [
    dimension({ x: -1.2, z: -A }, { x: -1.2, z: 0 }, "A", text),
    "",
    label({ x: -0.25, z: -2.2 }, "shaft", "end") +
      label({ x: -0.35, z: -0.5 }, "head", "end") +
      label({ x: 0.4, z: -2.4 }, "branch", "start"),
    "",
  ];
  const panels = CASES.map(({ turns, caption }, i) => {
    const x = 20 + i * (panelWidth + 20);
    const content = lane(turns) + envelope() + extras[i];
    return (
      panel(x, 40, panelWidth, ground, content, panelHeight) +
      `<text x="${x + panelWidth / 2}" y="${40 + panelHeight + 22}" text-anchor="middle">${caption}</text>`
    );
  });

  const notesTop = 40 + panelHeight + 62;
  const notes = [
    "Dashed: the box every arrow fits in, A long. The shaft narrows from the tail.",
    "Straight among the turns: the straight arrow, and a branch per turn, leaving the shaft already angled off it",
    "and curving into a smaller turn head. Turns only: the shaft's end curves into a turn head, the straight head",
    "turned 90°. Left: right mirrored.",
  ];
  const width = 20 + CASES.length * (panelWidth + 20);
  return picture(
    width,
    notesTop + notes.length * 24 + 30,
    "",
    `<text x="20" y="26" font-weight="600">Turn arrows: a shape per set of turns, each in a lane</text>
${panels.join("\n")}
${notes.map((line, i) => `<text x="20" y="${notesTop + i * 24}">${line}</text>`).join("\n")}
<text x="20" y="${notesTop + notes.length * 24 + 12}" font-size="12" fill="${MUTED}">To scale, the outlines the app draws: a ${LANE_WIDTH_METERS} m lane.</text>`,
  );
}

function turns(left: boolean, straight: boolean, right: boolean): Turns {
  return { left, straight, right };
}

/**
 * A lane with an arrow showing `turns`, pointing up: the arrow's frame
 * (`x` forward, `z` right) on the ground as `x` → up, `z` → right.
 */
function lane(turns: Turns): string {
  const half = LANE_WIDTH_METERS / 2;
  const bottom = -TURN_ARROW_LENGTH_METERS - 0.5;
  const dash = DASH_PERIOD_METERS / 3;
  const mark = (x: number) =>
    rect(x - LINE_WIDTH / 2, x + LINE_WIDTH / 2, bottom, bottom + dash);
  const arrow = arrowShape(turns)
    .map((outline) => polygon(outline.map(onGround), ""))
    .join("");
  return (
    `<g fill="${ASPHALT}">${rect(-1.75, 1.75, bottom, 0.5)}</g>` +
    `<g fill="${PAINT}">${mark(-half)}${mark(half)}${arrow}</g>`
  );
}

/** The box every arrow fits in: the bounds of all of them. */
function envelope(): string {
  const every = [0, 1].flatMap((left) =>
    [0, 1].flatMap((straight) =>
      [0, 1].map((right) => turns(!!left, !!straight, !!right)),
    ),
  );
  const points = every
    .filter(({ left, straight, right }) => left || straight || right)
    .flatMap((t) => arrowShape(t).flat())
    .map(onGround);
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minZ, maxZ] = [Math.min(...zs), Math.max(...zs)];
  // Rounded as `svgPoint` rounds.
  const n = (value: number) => value.toFixed(3);
  return (
    `<rect x="${n(minX)}" y="${n(-maxZ)}" width="${n(maxX - minX)}" height="${n(maxZ - minZ)}" ` +
    `fill="none" stroke="${HIGHLIGHT}" stroke-width="1" stroke-dasharray="4 3" ` +
    `vector-effect="non-scaling-stroke"/>`
  );
}

/** A point of the arrow's frame on the ground: forward up, right right. */
function onGround({ x, z }: Vec2): Vec2 {
  return { x: z, z: x };
}

function rect(x0: number, x1: number, z0: number, z1: number): string {
  return polygon(
    [
      { x: x0, z: z0 },
      { x: x1, z: z0 },
      { x: x1, z: z1 },
      { x: x0, z: z1 },
    ],
    "",
  );
}

function label(at: Vec2, text: string, anchor: "start" | "end"): string {
  return `<text x="${at.x}" y="${-at.z}" font-size="0.16" text-anchor="${anchor}" fill="${ON_ASPHALT}">${text}</text>`;
}
