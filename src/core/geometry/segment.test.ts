import { describe, expect, it } from "vitest";
import { distance, type Vec2 } from "./point";
import { distanceToLine, nearestPointsBetweenSegments } from "./segment";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

describe("distanceToLine", () => {
  it("measures square to the line, on either side", () => {
    // The line z = x, through (0, 0) and (1, 1). (0, 2) and (2, 0) are
    // mirror images across it, each √2 away.
    expect(distanceToLine(vec(0, 2), vec(0, 0), vec(1, 1))).toBeCloseTo(
      Math.SQRT2,
    );
    expect(distanceToLine(vec(2, 0), vec(0, 0), vec(1, 1))).toBeCloseTo(
      Math.SQRT2,
    );
  });

  it("runs the line on past its two points", () => {
    // The foot of the perpendicular, (10, 0), is far past b = (1, 0); a
    // segment would measure to b instead.
    expect(distanceToLine(vec(10, 3), vec(0, 0), vec(1, 0))).toBeCloseTo(3);
  });

  it("gives 0 for a point on the line", () => {
    expect(distanceToLine(vec(-5, -5), vec(0, 0), vec(1, 1))).toBeCloseTo(0);
  });

  it("measures to the point when the two points are the same", () => {
    expect(distanceToLine(vec(3, 4), vec(0, 0), vec(0, 0))).toBe(5);
  });
});

describe("nearestPointsBetweenSegments", () => {
  it("gives the crossing twice where the segments cross", () => {
    expect(
      nearestPointsBetweenSegments(
        vec(-1, 0),
        vec(1, 0),
        vec(0, -1),
        vec(0, 1),
      ),
    ).toEqual([vec(0, 0), vec(0, 0)]);
  });

  it("pairs an end with the middle of a parallel segment beside it", () => {
    // Any pair straight across the overlap would do; an end is the one found.
    const [onA, onB] = nearestPointsBetweenSegments(
      vec(0, 0),
      vec(10, 0),
      vec(2, 3),
      vec(8, 3),
    );

    expect(onA.z).toBe(0);
    expect(onB.z).toBe(3);
    expect(onA.x).toBeCloseTo(onB.x);
  });

  it("gives one point twice for segments lying on top of each other", () => {
    const [onA, onB] = nearestPointsBetweenSegments(
      vec(0, 0),
      vec(10, 0),
      vec(5, 0),
      vec(15, 0),
    );

    expect(onA).toEqual(onB);
  });

  it("pairs an end with the middle of the other", () => {
    // A T whose stem stops 2 m short of the bar.
    expect(
      nearestPointsBetweenSegments(
        vec(-5, 0),
        vec(5, 0),
        vec(1, 2),
        vec(1, 10),
      ),
    ).toEqual([vec(1, 0), vec(1, 2)]);
  });

  it("pairs end with end where neither reaches past the other", () => {
    // The second runs away from the first's end, a 3–4–5 step off it.
    expect(
      nearestPointsBetweenSegments(
        vec(0, 0),
        vec(1, 0),
        vec(4, 4),
        vec(10, 12),
      ),
    ).toEqual([vec(1, 0), vec(4, 4)]);
  });

  it("measures two pieces of one straight apart, despite rounding", () => {
    // The outer roadways of a straight cut at two crossings, as the layout
    // placed them: on one line only up to rounding, so their cross product
    // is a little off 0. Once taken for a crossing, at the first one's end.
    const a1 = vec(-226.21018511450438, 116.12946834091228);
    const a2 = vec(-54.5706486146445, 103.19027647766333);
    const b1 = vec(59.470576152130626, 94.59318213874681);
    const b2 = vec(257.16616865152525, 79.68973242061945);

    const [onA, onB] = nearestPointsBetweenSegments(a1, a2, b1, b2);

    expect(distance(onA, onB)).toBeCloseTo(distance(a2, b1));
  });

  it("pairs a segment of no length, as a point, with its nearest point", () => {
    expect(
      nearestPointsBetweenSegments(
        vec(3, 4),
        vec(3, 4),
        vec(-10, 0),
        vec(10, 0),
      ),
    ).toEqual([vec(3, 4), vec(3, 0)]);
  });
});
