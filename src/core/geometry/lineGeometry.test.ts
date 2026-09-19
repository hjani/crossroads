import { describe, expect, it } from "vitest";
import { lineLength, STRAIGHT } from "./lineGeometry";
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
