import { arcViaLeaving } from "../core/geometry/arc";
import { biarcBetween } from "../core/geometry/biarc";
import {
  lineDirectionAt,
  pointOnLine,
  STRAIGHT,
  type Line,
  type LineGeometry,
} from "../core/geometry/lineGeometry";
import { unitDirection, type Vec2 } from "../core/geometry/point";
import { lineCrossing } from "../core/geometry/segment";
import type { RoadLayout } from "../core/layout/RoadLayout";
import { applyRoadPlan, planRoad } from "../core/layout/roadPlan";
import { positionOf } from "../core/network/queries";
import type { Endpoint, RoadNetwork } from "../core/network/RoadNetwork";
import type { RoadProfile } from "../core/network/types";
import { ONE_LANE_PROFILE } from "../input/SectionSettings";

/**
 * Drawing tools for the sample towns.
 *
 * Every road goes through `planRoad`, so it obeys the same rules as one
 * built by hand: crossings become junctions, and a refused road is skipped
 * with a warning.
 */

/** Where a road reached, and which way it was heading. */
export interface Place {
  readonly at: Endpoint;
  readonly position: Vec2;
  readonly heading: Vec2;
}

/** A new pen at `at`, heading `heading`; one-lane roads by default. */
export type PenFactory = (
  at: Endpoint,
  heading: Vec2,
  profile?: RoadProfile,
) => Pen;

export function pens(network: RoadNetwork, layout: RoadLayout): PenFactory {
  return (at, heading, profile = ONE_LANE_PROFILE) =>
    new Pen(network, layout, at, heading, profile);
}

/**
 * Draws a road as a chain of sections, each starting where the last ended
 * and heading the way it arrived. `heading` is a unit vector.
 */
export class Pen {
  private last: Line | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    private at: Endpoint,
    private heading: Vec2,
    private readonly profile: RoadProfile,
  ) {}

  /** Where the pen is: a node, unless the last section was refused. */
  get place(): Place {
    return {
      at: this.at,
      position: positionOf(this.network, this.at),
      heading: this.heading,
    };
  }

  /** The point a fraction `t` along the last line drawn. */
  along(t: number): Vec2 {
    if (this.last === null) {
      throw new Error("Sample town: nothing drawn yet");
    }
    return pointOnLine(this.last.from, this.last.to, this.last.geometry, t);
  }

  forward(length: number): this {
    const p = positionOf(this.network, this.at);
    return this.lineTo({
      x: p.x + length * this.heading.x,
      z: p.z + length * this.heading.z,
    });
  }

  lineTo(to: Endpoint): this {
    return this.draw(to, STRAIGHT);
  }

  /**
   * Along a circle of `radius`, turning `degrees`: right if positive, left
   * if negative.
   *
   * - `n` the right of the heading, `s = ±1` the side turned to
   * - center `c = p + s·r·n`; the arc is `p − c` rotated about `c` by
   *   `φ`, from +x toward +z — which is a right turn for `φ > 0`
   * - ends at `c + R(φ)(p − c)`, passes `c + R(φ/2)(p − c)` halfway
   */
  turn(radius: number, degrees: number): this {
    const p = positionOf(this.network, this.at);
    const n = rightOf(this.heading);
    const side = Math.sign(degrees);
    const c = { x: p.x + side * radius * n.x, z: p.z + side * radius * n.z };
    const around = (phi: number): Vec2 => {
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const x = p.x - c.x;
      const z = p.z - c.z;
      return { x: c.x + x * cos - z * sin, z: c.z + x * sin + z * cos };
    };
    const phi = (degrees * Math.PI) / 180;
    return this.draw(around(phi), { kind: "arc", via: around(phi / 2) });
  }

  /** On the one arc leaving along the heading and ending at `to`. */
  arcTo(to: Endpoint): this {
    const via = arcViaLeaving(
      positionOf(this.network, this.at),
      this.heading,
      positionOf(this.network, to),
    );
    if (via === null) {
      throw new Error("Sample town: no arc leaves that way toward its end");
    }
    return this.draw(to, { kind: "arc", via });
  }

  /** Smoothly to `to`, arriving heading `arriving`: a biarc. */
  connectTo(to: Endpoint, arriving: Vec2): this {
    const biarc = biarcBetween(
      positionOf(this.network, this.at),
      this.heading,
      positionOf(this.network, to),
      arriving,
    );
    if (biarc === null) {
      throw new Error("Sample town: no biarc between those ends");
    }
    return this.draw(to, { kind: "biarc", biarc });
  }

  private draw(to: Endpoint, geometry: LineGeometry): this {
    const from = positionOf(this.network, this.at);
    const end = positionOf(this.network, to);
    const plan = planRoad(
      this.network,
      this.layout,
      this.at,
      to,
      geometry,
      this.profile,
    );
    if (plan.buildable) {
      this.at = applyRoadPlan(this.network, plan);
    } else {
      console.warn(
        `Sample town: ${geometry.kind} refused, ` +
          `(${from.x.toFixed(0)}, ${from.z.toFixed(0)}) → ` +
          `(${end.x.toFixed(0)}, ${end.z.toFixed(0)})`,
      );
      this.at = to;
    }
    this.heading = lineDirectionAt(from, end, geometry, 1);
    this.last = { from, to: end, geometry };
    return this;
  }
}

/**
 * A grid line: where it sits across the grid, and the stretches it runs as
 * index ranges of the lines crossing it. No spans → a line already built.
 */
export interface GridLine {
  readonly at: number;
  readonly spans: readonly (readonly [number, number])[];
  readonly profile?: RoadProfile;
}

/**
 * Streets on a frame of their own: `u` along `along` from `origin`, `v` to
 * its right. Each line is tilted by up to `jitter` meters at either end, so
 * blocks are not quite rectangles.
 */
export class Grid {
  private readonly colEnds: (readonly [Vec2, Vec2])[];
  private readonly rowEnds: (readonly [Vec2, Vec2])[];

  constructor(
    private readonly pen: PenFactory,
    origin: Vec2,
    along: Vec2,
    jitter: number,
    random: () => number,
    private readonly cols: readonly GridLine[],
    private readonly rows: readonly GridLine[],
  ) {
    const across = rightOf(along);
    const at = (u: number, v: number): Vec2 => ({
      x: origin.x + u * along.x + v * across.x,
      z: origin.z + u * along.z + v * across.z,
    });
    const tilt = (): number => jitter * (2 * random() - 1);
    const [uFirst, uLast] = [cols[0].at, cols[cols.length - 1].at];
    const [vFirst, vLast] = [rows[0].at, rows[rows.length - 1].at];
    this.rowEnds = rows.map(
      ({ at: v }) => [at(uFirst, v + tilt()), at(uLast, v + tilt())] as const,
    );
    this.colEnds = cols.map(
      ({ at: u }) => [at(u + tilt(), vFirst), at(u + tilt(), vLast)] as const,
    );
  }

  /** Where column `col` crosses row `row`. */
  crossing(col: number, row: number): Vec2 {
    const [a1, a2] = this.colEnds[col];
    const [b1, b2] = this.rowEnds[row];
    const crossing = lineCrossing(a1, a2, b1, b2);
    if (crossing === null) {
      throw new Error(`Sample town: column ${col} misses row ${row}`);
    }
    return crossing.point;
  }

  /** Along a row, toward its last column. */
  rowDirection(row: number): Vec2 {
    return unitDirection(...this.rowEnds[row]);
  }

  /** Along a column, toward its last row. */
  colDirection(col: number): Vec2 {
    return unitDirection(...this.colEnds[col]);
  }

  /**
   * Rows first, each in one piece. Then columns, stopping at every row:
   * a stop welds onto the row within a centimeter, cutting it or joining its
   * end. Passing through a row's end instead can miss it by a rounding
   * error, since a crossing counts only within the row's own length.
   */
  build(): void {
    this.rows.forEach((row, r) => {
      for (const [first, last] of row.spans) {
        this.pen(
          this.crossing(first, r),
          this.rowDirection(r),
          row.profile,
        ).lineTo(this.crossing(last, r));
      }
    });
    this.cols.forEach((col, c) => {
      for (const [first, last] of col.spans) {
        const pen = this.pen(
          this.crossing(c, first),
          this.colDirection(c),
          col.profile,
        );
        for (let r = first + 1; r <= last; r++) {
          pen.lineTo(this.crossing(c, r));
        }
      }
    });
  }
}

/**
 * A closed ring of arcs through a point at each of `degrees`, ascending
 * from +x toward +z: a ring road or a roundabout. Returns each point as a
 * place heading outward, for the roads leaving it.
 */
export function circle(
  pen: PenFactory,
  center: Vec2,
  radius: number,
  degrees: readonly number[],
  profile?: RoadProfile,
): Place[] {
  const points = degrees.map((d) => polar(center, d, radius));
  // On a circle the heading is the tangent, a quarter turn on from the
  // radius → every arc drawn along it stays on the circle.
  const ring = pen(points[0], headingOf(degrees[0] + 90), profile);
  // reached[i] is the node at points[i + 1]; the last is back at points[0].
  const reached = [...points.slice(1), points[0]].map(
    (point) => ring.arcTo(point).place.at,
  );
  return degrees.map((d, i) => ({
    at: reached[(i + reached.length - 1) % reached.length],
    position: points[i],
    heading: headingOf(d),
  }));
}

/** The unit vector `degrees` from +x toward +z. */
export function headingOf(degrees: number): Vec2 {
  const angle = (degrees * Math.PI) / 180;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

/** The point `radius` meters from `center`, `degrees` from +x toward +z. */
export function polar(center: Vec2, degrees: number, radius: number): Vec2 {
  const d = headingOf(degrees);
  return { x: center.x + radius * d.x, z: center.z + radius * d.z };
}

/** `d` rotated by `degrees`, from +x toward +z. */
export function turned(d: Vec2, degrees: number): Vec2 {
  const r = headingOf(degrees);
  return { x: d.x * r.x - d.z * r.z, z: d.x * r.z + d.z * r.x };
}

export function negate(d: Vec2): Vec2 {
  return { x: -d.x, z: -d.z };
}

export function rightOf(d: Vec2): Vec2 {
  return { x: -d.z, z: d.x };
}

export function leftOf(d: Vec2): Vec2 {
  return { x: d.z, z: -d.x };
}

/** Mulberry32: a small, fast generator, the same numbers for the same seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
