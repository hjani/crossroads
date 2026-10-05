import type { Vec2 } from "../../src/core/geometry/point";
import {
  BAR_PERIOD_METERS,
  DASH_PERIOD_METERS,
  fittedPeriodOf,
} from "../../src/core/layout/markings";
import { CROSSING_DEPTH_METERS } from "../../src/core/layout/roadway";
import { JUNCTION } from "./layoutParts";
import {
  dimension,
  groundFrame,
  MUTED,
  panel,
  picture,
  polygon,
  squareAt,
} from "./svg";

/**
 * docs/road-markings.md: a roadway's markings, ending in a crossing where it
 * meets a junction — edge lines, centerline dashes and crossing bars, spaced
 * by the project's own fitted pattern.
 */

/** roadSurface.frag.glsl: `EDGE_INSET` and `LINE_WIDTH`, in meters. */
const EDGE_INSET = 0.2;
const LINE_WIDTH = 0.1;

const ASPHALT = "#66655f";
const GRASS = "#dde6d2";
const PAINT = "#ffffff";
const WIDTH = 8;
const LENGTH = 22;

export function roadMarkings(): string {
  const half = WIDTH / 2;
  const inner = EDGE_INSET + LINE_WIDTH;
  const rect = (x0: number, x1: number, z0: number, z1: number) =>
    polygon(
      [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
      ],
      "",
    );
  const paint = (shapes: string) => `<g fill="${PAINT}">${shapes}</g>`;

  // The dashed stretch: what the crossing leaves of the roadway.
  const dashEnd = LENGTH - CROSSING_DEPTH_METERS;
  const dashPeriod = fittedPeriodOf(dashEnd, DASH_PERIOD_METERS) ?? dashEnd;
  let dashes = "";
  for (let start = 0; start < dashEnd - 1e-9; start += dashPeriod) {
    dashes += rect(
      start + dashPeriod / 3,
      start + (2 * dashPeriod) / 3,
      -LINE_WIDTH / 2,
      LINE_WIDTH / 2,
    );
  }

  // Crossing bars: a fitted pattern across the road, between the edge lines.
  const barsWidth = WIDTH - 2 * inner;
  const barPeriod = fittedPeriodOf(barsWidth, BAR_PERIOD_METERS) ?? barsWidth;
  let bars = "";
  for (let k = 0; (k + 1) * barPeriod <= barsWidth + 1e-9; k++) {
    const middle = -half + inner + (k + 0.5) * barPeriod;
    bars += rect(
      dashEnd,
      LENGTH,
      middle - barPeriod / 4,
      middle + barPeriod / 4,
    );
  }

  // Grass around the road, so white paint never reads as blank page.
  const road =
    `<g fill="${GRASS}">${rect(-10, LENGTH + 20, -20, 20)}</g>` +
    `<g fill="${ASPHALT}">${rect(-2, LENGTH, -half, half)}</g>` +
    `<g fill="${JUNCTION}">${rect(LENGTH, LENGTH + 8, -half, half)}</g>` +
    paint(
      rect(-2, LENGTH, half - inner, half - EDGE_INSET) +
        rect(-2, LENGTH, -half + EDGE_INSET, -half + inner) +
        dashes +
        bars,
    );

  const text = 0.6;
  const main = { minX: -2, minZ: -6.5, size: 32 };
  const detail = squareAt({ x: LENGTH - 1.2, z: half - 0.6 }, 2);
  const mainContent =
    road +
    groundFrame(detail) +
    dimension(
      { x: dashEnd, z: half + 1 },
      { x: LENGTH, z: half + 1 },
      "D",
      text,
    ) +
    dimension(
      { x: 2 * dashPeriod, z: -half - 1 },
      { x: dashPeriod, z: -half - 1 },
      "P′",
      text,
    ) +
    dimension({ x: 0, z: 1 }, { x: dashPeriod / 3, z: 1 }, "½ gap", text) +
    dimension(
      { x: LENGTH + 2, z: -half + inner },
      { x: LENGTH + 2, z: half - inner },
      "W",
      text,
    ) +
    label({ x: LENGTH + 2.6, z: -half + 1 }, "junction", text) +
    label({ x: -1.6, z: half + 1 }, "roadway", text);

  const detailContent =
    road +
    dimension(
      { x: LENGTH - 1.9, z: half },
      { x: LENGTH - 1.9, z: half - EDGE_INSET },
      "e",
      0.12,
    ) +
    dimension(
      { x: LENGTH - 1.9, z: half - EDGE_INSET },
      { x: LENGTH - 1.9, z: half - inner },
      "ℓ",
      0.12,
    ) +
    label({ x: LENGTH - 1.6, z: half + 0.15 }, "curb", 0.12) +
    label({ x: LENGTH - 1.6, z: half - 0.75 }, "crossing bar", 0.12);

  const width = 900;
  const mainHeight = Math.round((width * 13) / main.size);
  const detailTop = 34 + mainHeight + 30;
  const notes = [
    "e: the edge line's gap from the curb. ℓ: a line's width.",
    "Centerline dashes: a fitted pattern, period P′, the middle third of each",
    "period; half a gap at each end of the dashed stretch.",
    "Crossing: D deep, at an end meeting 3 or more roads. Bars run along the",
    "road, a fitted pattern across W, the width between the edge lines; each",
    "bar is half its period.",
  ];
  return picture(
    width + 40,
    detailTop + 280 + 20,
    "",
    `<text x="20" y="24" font-weight="600">A roadway's end at a junction: edge lines, dashes, a crossing</text>
${panel(20, 34, width, main, mainContent, mainHeight)}
<text x="20" y="${detailTop - 8}" font-weight="600">Detail: the edge line at the curb</text>
${panel(20, detailTop, 280, detail, detailContent)}
${notes
  .map(
    (line, i) => `<text x="330" y="${detailTop + 24 + i * 24}">${line}</text>`,
  )
  .join("\n")}
<text x="330" y="${detailTop + 24 + notes.length * 24 + 12}" font-size="12" fill="${MUTED}">To scale: 8 m road, the project's own constants and fitted pattern.</text>`,
  );
}

function label(at: Vec2, text: string, size: number): string {
  return `<text x="${at.x}" y="${-at.z}" font-size="${size}" fill="${MUTED}">${text}</text>`;
}
