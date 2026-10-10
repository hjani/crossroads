import { describe, expect, it } from "vitest";
import {
  lineLength,
  lineSweep,
  nearestPointsBetweenLines,
  STRAIGHT,
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
