import { describe, expect, it } from "vitest";
import { arcCircle, arcLength, pointOnArc, type ArcCircle } from "./arcs";
import type { Vec2 } from "./types";

function at(x: number, z: number): Vec2 {
  return { x, z };
}

// The quarter of the unit circle running counterclockwise from due east to
// due north, and the three quarters covering the rest of it. Same ends, same
// circle: only `via` tells them apart, which is the whole point of naming an
// arc by a position it passes through.
const east = at(1, 0);
const north = at(0, 1);
const northeast = at(Math.SQRT1_2, Math.SQRT1_2);
const southwest = at(-Math.SQRT1_2, -Math.SQRT1_2);

function expectAt(point: Vec2, x: number, z: number): void {
  expect(point.x).toBeCloseTo(x);
  expect(point.z).toBeCloseTo(z);
}

/** The circle, or a failure saying so rather than one about null. */
function circleThrough(from: Vec2, to: Vec2, via: Vec2): ArcCircle {
  const circle = arcCircle(from, to, via);
  if (circle === null) {
    throw new Error("expected a circle through the three positions");
  }
  return circle;
}

describe("arcCircle", () => {
  it("finds the circle three positions lie on", () => {
    const circle = circleThrough(east, north, northeast);

    expectAt(circle.center, 0, 0);
    expect(circle.radius).toBeCloseTo(1);
  });

  it("finds the same circle whichever side the via is", () => {
    const circle = circleThrough(east, north, southwest);

    expectAt(circle.center, 0, 0);
    expect(circle.radius).toBeCloseTo(1);
  });

  it("finds the same circle whichever end is first", () => {
    const circle = circleThrough(north, east, northeast);

    expectAt(circle.center, 0, 0);
    expect(circle.radius).toBeCloseTo(1);
  });

  it("stays exact far from the world origin", () => {
    // A half circle on the diagonal, shifted a kilometer out. Squaring
    // positions that size is what measuring from `from` avoids.
    const circle = circleThrough(
      at(1001, 1000),
      at(1000, 1001),
      at(1000, 1000),
    );

    expectAt(circle.center, 1000.5, 1000.5);
    expect(circle.radius).toBeCloseTo(Math.SQRT1_2);
  });

  it("is null for three positions in a line", () => {
    expect(arcCircle(at(0, 0), at(10, 0), at(5, 0))).toBeNull();
  });

  it("is null for a via off the ends but still in line with them", () => {
    expect(arcCircle(at(0, 0), at(10, 0), at(20, 0))).toBeNull();
  });

  it("is null for a via sitting on an end", () => {
    expect(arcCircle(east, north, east)).toBeNull();
    expect(arcCircle(east, north, north)).toBeNull();
  });
});

describe("pointOnArc", () => {
  it("starts at one end and finishes at the other", () => {
    expectAt(pointOnArc(east, north, northeast, 0), east.x, east.z);
    expectAt(pointOnArc(east, north, northeast, 1), north.x, north.z);
  });

  it("passes through the via halfway when the via is the midpoint", () => {
    expectAt(
      pointOnArc(east, north, northeast, 0.5),
      northeast.x,
      northeast.z,
    );
  });

  it("goes the other way round for a via on the other side", () => {
    // Halfway along the three-quarter arc is due southwest, not northeast.
    expectAt(
      pointOnArc(east, north, southwest, 0.5),
      southwest.x,
      southwest.z,
    );
  });

  it("mirrors when the ends are swapped", () => {
    const forward = pointOnArc(east, north, northeast, 0.25);
    const backward = pointOnArc(north, east, northeast, 0.75);

    expectAt(backward, forward.x, forward.z);
  });

  it("runs straight between the ends when the three are in a line", () => {
    expectAt(pointOnArc(at(0, 0), at(10, 0), at(5, 0), 0.25), 2.5, 0);
  });
});

describe("arcLength", () => {
  it("measures the short way round", () => {
    expect(arcLength(east, north, northeast)).toBeCloseTo(Math.PI / 2);
  });

  it("measures the long way round for a via on the other side", () => {
    expect(arcLength(east, north, southwest)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it("measures the same whichever end is first", () => {
    expect(arcLength(north, east, northeast)).toBeCloseTo(Math.PI / 2);
  });

  it("is longer than the chord it spans", () => {
    // Why a curved section's length cannot be measured across its ends:
    // 1.57 meters of road between ends 1.41 meters apart.
    expect(arcLength(east, north, northeast)).toBeGreaterThan(Math.SQRT2);
  });

  it("is the straight distance when the three are in a line", () => {
    expect(arcLength(at(0, 0), at(10, 0), at(5, 0))).toBeCloseTo(10);
  });
});
