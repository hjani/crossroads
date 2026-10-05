import type { Vec2 } from "../../src/core/geometry/point";

/**
 * SVG plumbing shared by the documentation pictures: ground points in meters
 * become SVG coordinates, and a picture is panels plus a legend on a white
 * ground.
 */

export const INK = "#1d2125";
export const MUTED = "#5b6168";
export const EDGE = "#2b2f33";
export const HIGHLIGHT = "#d6336c";

/** A ground point as SVG coordinates: x to the right, z up. */
export function svgPoint(p: Vec2): string {
  return `${p.x.toFixed(3)},${(-p.z).toFixed(3)}`;
}

export function polygon(points: readonly Vec2[], attributes = ""): string {
  return `<polygon points="${points.map(svgPoint).join(" ")}" ${attributes}/>`;
}

/** A flat triangle list, every three vertices one triangle, as triangles. */
export function triangles<T>(vertices: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    out.push(vertices.slice(i, i + 3));
  }
  return out;
}

/** A square of ground in meters: its corner of least x and z, and its side. */
export interface GroundSquare {
  readonly minX: number;
  readonly minZ: number;
  readonly size: number;
}

/** The smallest square holding all points, `pad` meters clear of them. */
export function squareAround(
  points: readonly Vec2[],
  pad: number,
): GroundSquare {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs) - pad;
  const minZ = Math.min(...zs) - pad;
  const size = Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ) + pad;
  return { minX, minZ, size };
}

/** The square of ground `size` meters wide, centered on `center`. */
export function squareAt(center: Vec2, size: number): GroundSquare {
  return { minX: center.x - size / 2, minZ: center.z - size / 2, size };
}

/**
 * A panel `pixels` wide at (`x`, `y`) on the picture, showing `ground`.
 * Strokes inside need `vector-effect: non-scaling-stroke`, or they scale
 * with the ground.
 *
 * Square unless `heightPixels` says otherwise: then it shows `ground`'s full
 * width, and from its bottom edge as much as that height holds at the same
 * scale.
 */
export function panel(
  x: number,
  y: number,
  pixels: number,
  ground: GroundSquare,
  content: string,
  heightPixels = pixels,
): string {
  const heightMeters = (ground.size * heightPixels) / pixels;
  // z is up on the picture → the top edge is at −(minZ + height).
  const top = -(ground.minZ + heightMeters);
  return (
    `<svg x="${x}" y="${y}" width="${pixels}" height="${heightPixels}" ` +
    `viewBox="${ground.minX} ${top} ${ground.size} ${heightMeters}">${content}</svg>`
  );
}

/** The outline of `ground`, drawn on a panel that shows it. */
export function groundFrame(ground: GroundSquare): string {
  return (
    `<rect x="${ground.minX}" y="${-(ground.minZ + ground.size)}" ` +
    `width="${ground.size}" height="${ground.size}" fill="none" ` +
    `stroke="${HIGHLIGHT}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
  );
}

/**
 * A labeled distance from `a` to `b` on the ground: a line with a tick across
 * each end, and `text` beside its middle, on the left going from `a` to `b`.
 * `size` is the text height in meters, so it follows the panel's scale.
 */
export function dimension(
  a: Vec2,
  b: Vec2,
  text: string,
  size: number,
): string {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const across = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
  const tick = (p: Vec2) =>
    `M${svgPoint({ x: p.x - across.x * size * 0.4, z: p.z - across.z * size * 0.4 })} ` +
    `L${svgPoint({ x: p.x + across.x * size * 0.4, z: p.z + across.z * size * 0.4 })}`;
  const middle = {
    x: (a.x + b.x) / 2 + across.x * size * 0.9,
    z: (a.z + b.z) / 2 + across.z * size * 0.9,
  };
  // Beside a mostly upright line, the text runs away from it from the end
  // facing it; along a mostly level one, it is centered over it.
  const upright = Math.abs(b.z - a.z) > Math.abs(b.x - a.x);
  const anchor = !upright ? "middle" : across.x < 0 ? "end" : "start";
  return (
    `<path d="M${svgPoint(a)} L${svgPoint(b)} ${tick(a)} ${tick(b)}" fill="none" ` +
    `stroke="${HIGHLIGHT}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` +
    `<text x="${middle.x}" y="${-middle.z}" font-size="${size}" font-weight="600" ` +
    `text-anchor="${anchor}" dominant-baseline="middle" fill="${HIGHLIGHT}">${text}</text>`
  );
}

export interface LegendEntry {
  readonly fill: string;
  readonly label: string;
}

/** Swatches with labels, in two columns from (`x`, `y`). */
export function legend(
  x: number,
  y: number,
  columnWidth: number,
  entries: readonly LegendEntry[],
): string {
  return entries
    .map(({ fill, label }, i) => {
      const left = x + (i % 2) * columnWidth;
      const baseline = y + Math.floor(i / 2) * 26;
      return (
        `<rect x="${left}" y="${baseline - 12}" width="18" height="14" ` +
        `fill="${fill}" stroke="${EDGE}" stroke-width="0.6"/>` +
        `<text x="${left + 26}" y="${baseline}">${label}</text>`
      );
    })
    .join("");
}

/** A whole picture: a white ground, a style sheet, and the content. */
export function picture(
  width: number,
  height: number,
  style: string,
  content: string,
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="14" fill="${INK}">\n` +
    `<style>${style}</style>\n` +
    `<rect width="100%" height="100%" fill="#ffffff"/>\n` +
    `${content}\n</svg>\n`
  );
}
