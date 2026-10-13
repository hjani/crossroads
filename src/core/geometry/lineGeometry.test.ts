import { describe, expect, it } from "vitest";
import { arcCircle, type ArcCircle } from "./arc";
import { biarcBetween } from "./biarc";
import {
  lineDirectionAt,
  lineLength,
  lineSweep,
  nearestPointsBetweenLines,
  offsetLine,
  STRAIGHT,
  type Line,
  type LineGeometry,
} from "./lineGeometry";
import type { Vec2 } from "./point";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

describe("lineLength", () => {
  it("measures a straight across", () => {
    expect(lineLength(vec(0, 0), vec(3, 4), STRAIGHT)).toBeCloseTo(5);
  });

  it("measures an arc along its curve", () => {
    // The quarter of the unit circle from due east to due north: π/2, where
    // the chord between the same ends is √2.
    const length = lineLength(vec(1, 0), vec(0, 1), {
      kind: "arc",
      via: vec(Math.SQRT1_2, Math.SQRT1_2),
    });

    expect(length).toBeCloseTo(Math.PI / 2);
    expect(length).toBeGreaterThan(Math.SQRT2);
  });

  it("takes an arc the long way round when `via` is on the far side", () => {
    // Same ends, the other three quarters: `via` is what tells them apart.
    expect(
      lineLength(vec(1, 0), vec(0, 1), {
        kind: "arc",
        via: vec(-Math.SQRT1_2, -Math.SQRT1_2),
      }),
    ).toBeCloseTo((3 * Math.PI) / 2);
  });
});

describe("lineSweep", () => {
  const diagonal = 10 * Math.SQRT1_2;

  it("sweeps nothing along a straight", () => {
    expect(lineSweep(vec(0, 0), vec(3, 4), STRAIGHT)).toBe(0);
  });

  it("sweeps an arc's turn", () => {
    expect(
      lineSweep(vec(1, 0), vec(0, 1), {
        kind: "arc",
        via: vec(Math.SQRT1_2, Math.SQRT1_2),
      }),
    ).toBeCloseTo(Math.PI / 2);
  });

  it("adds up a biarc's two pieces turning the same way", () => {
    // A U-turn around (0, 10), radius 10: two quarter circles joined at
    // (10, 10).
    const sweep = lineSweep(vec(0, 0), vec(0, 20), {
      kind: "biarc",
      biarc: {
        join: vec(10, 10),
        first: { kind: "arc", via: vec(diagonal, 10 - diagonal) },
        second: { kind: "arc", via: vec(diagonal, 10 + diagonal) },
      },
    });

    expect(sweep).toBeCloseTo(Math.PI);
  });

  it("adds up an S-curve's two pieces, though it ends up heading as it began", () => {
    // A quarter left around (0, 10), then a quarter right around (20, 10):
    // east at both ends.
    const sweep = lineSweep(vec(0, 0), vec(20, 20), {
      kind: "biarc",
      biarc: {
        join: vec(10, 10),
        first: { kind: "arc", via: vec(diagonal, 10 - diagonal) },
        second: { kind: "arc", via: vec(20 - diagonal, 10 + diagonal) },
      },
    });

    expect(sweep).toBeCloseTo(Math.PI);
  });
});

describe("nearestPointsBetweenLines", () => {
  // The upper half of the unit circle, and a level road 1 m above its top.
  const arc = { kind: "arc", via: vec(0, 1) } as const;

  it("gives the first line's point first, whichever is the arc", () => {
    const [onArc, onStraight] = nearestPointsBetweenLines(
      vec(-1, 0),
      vec(1, 0),
      arc,
      vec(-2, 2),
      vec(2, 2),
      STRAIGHT,
    );

    expect(onArc.z).toBeCloseTo(1);
    expect(onStraight.z).toBeCloseTo(2);
  });
});

describe("offsetLine", () => {
  function expectAt(point: Vec2, x: number, z: number): void {
    expect(point.x).toBeCloseTo(x);
    expect(point.z).toBeCloseTo(z);
  }

  /** The moved line, or a failure saying so rather than one about null. */
  function moved(
    from: Vec2,
    to: Vec2,
    geometry: LineGeometry,
    offset: number,
  ): Line {
    const line = offsetLine(from, to, geometry, offset);
    if (line === null) {
      throw new Error("expected a moved line");
    }
    return line;
  }

  /** The circle a moved arc runs on. */
  function circleOf(line: Line): ArcCircle {
    const circle =
      line.geometry.kind === "arc"
        ? arcCircle(line.from, line.to, line.geometry.via)
        : null;
    if (circle === null) {
      throw new Error("expected an arc");
    }
    return circle;
  }

  // A quarter of the circle of radius 10 around the origin, turning from +x
  // toward +z: its right is inward.
  const start = vec(10, 0);
  const end = vec(0, 10);
  const quarter: LineGeometry = {
    kind: "arc",
    via: vec(10 * Math.SQRT1_2, 10 * Math.SQRT1_2),
  };

  it("moves a straight square to itself: heading +x, its right is +z", () => {
    const right = moved(vec(0, 0), vec(10, 0), STRAIGHT, 2);
    expectAt(right.from, 0, 2);
    expectAt(right.to, 10, 2);
    expect(right.geometry).toBe(STRAIGHT);

    const left = moved(vec(0, 0), vec(10, 0), STRAIGHT, -2);
    expectAt(left.from, 0, -2);
    expectAt(left.to, 10, -2);
  });

  it("moves an arc around its own center, inward to its right", () => {
    const inward = circleOf(moved(start, end, quarter, 2));
    expectAt(inward.center, 0, 0);
    expect(inward.radius).toBeCloseTo(8);

    const outward = circleOf(moved(start, end, quarter, -2));
    expectAt(outward.center, 0, 0);
    expect(outward.radius).toBeCloseTo(12);
  });

  it("moves an arc turning the other way outward to its right", () => {
    // The same quarter, run from +z to +x.
    expect(circleOf(moved(end, start, quarter, 2)).radius).toBeCloseTo(12);
  });

  it("keeps an arc's sweep: `via` stays between the ends", () => {
    const line = moved(start, end, quarter, 2);
    expectAt(line.from, 8, 0);
    expectAt(line.to, 0, 8);
    expect(lineSweep(line.from, line.to, line.geometry)).toBeCloseTo(
      Math.PI / 2,
    );
  });

  it("gives no arc where moving it would pass its center", () => {
    expect(offsetLine(start, end, quarter, 9.9)).not.toBeNull();
    expect(offsetLine(start, end, quarter, 15)).toBeNull();
    // Run the other way, the center lies to its left.
    expect(offsetLine(end, start, quarter, -15)).toBeNull();
  });

  it("moves a biarc's join square to it, the pieces still tangent there", () => {
    // An S-curve, heading +x at both ends.
    const from = vec(0, 0);
    const to = vec(40, 20);
    const biarc = biarcBetween(from, vec(1, 0), to, vec(1, 0));
    if (biarc === null) {
      throw new Error("expected a biarc");
    }
    const line = moved(from, to, { kind: "biarc", biarc }, 3);
    if (line.geometry.kind !== "biarc") {
      throw new Error("expected a biarc");
    }
    const { join, first, second } = line.geometry.biarc;

    expectAt(line.from, 0, 3);
    expectAt(line.to, 40, 23);

    const heading = lineDirectionAt(from, biarc.join, biarc.first, 1);
    expectAt(join, biarc.join.x - 3 * heading.z, biarc.join.z + 3 * heading.x);

    const arriving = lineDirectionAt(line.from, join, first, 1);
    const leaving = lineDirectionAt(join, line.to, second, 0);
    expectAt(arriving, leaving.x, leaving.z);
  });
});
