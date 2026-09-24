import { describe, expect, it } from "vitest";
import type { Vec2 } from "./point";
import { nearestPointsBetweenSegments } from "./segment";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

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
