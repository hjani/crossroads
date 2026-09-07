import { describe, expect, it } from "vitest";
import {
  arcCircle,
  arcLength,
  arcPolyline,
  distanceToArc,
  pointOnArc,
  type ArcCircle,
} from "./arcs";
import { distance } from "./points";
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

/**
 * The furthest any chord of the polyline strays from the circle it stands
 * in for — measured at each chord's midpoint, which on a circle is where the
 * gap is widest.
 */
function worstSag(points: readonly Vec2[], circle: ArcCircle): number {
  let worst = 0;
  for (let i = 1; i < points.length; i++) {
    const midpoint = at(
      (points[i - 1].x + points[i].x) / 2,
      (points[i - 1].z + points[i].z) / 2,
    );
    worst = Math.max(worst, circle.radius - distance(circle.center, midpoint));
  }
  return worst;
}

describe("distanceToArc", () => {
  it("is zero on the curve itself", () => {
    expect(distanceToArc(northeast, east, north, northeast)).toBeCloseTo(0);
  });

  it("measures how far off the circle a point is", () => {
    // Twice as far from the center as the curve, along the same direction.
    const outside = at(2 * northeast.x, 2 * northeast.z);
    const inside = at(northeast.x / 2, northeast.z / 2);

    expect(distanceToArc(outside, east, north, northeast)).toBeCloseTo(1);
    expect(distanceToArc(inside, east, north, northeast)).toBeCloseTo(0.5);
  });

  it("measures to the curve rather than to the line between the ends", () => {
    // Halfway along the chord: on the line between the ends, and a sagitta
    // away from the arc that bulges past it.
    const sagitta = 1 - Math.SQRT1_2;

    expect(distanceToArc(at(0.5, 0.5), east, north, northeast)).toBeCloseTo(
      sagitta,
    );
  });

  it("measures to the nearer end from a direction the arc never turns to", () => {
    // Across the circle from the quarter arc, so the nearest place on it is
    // an end and not the point of the circle facing this one.
    expect(distanceToArc(southwest, east, north, northeast)).toBeCloseTo(
      distance(southwest, east),
    );
  });

  it("measures against the way round the via picks", () => {
    // Same ends and same circle as above, the other three quarters: what was
    // on the curve is now off it, and what was off it is on.
    expect(distanceToArc(southwest, east, north, southwest)).toBeCloseTo(0);
    expect(distanceToArc(northeast, east, north, southwest)).toBeCloseTo(
      distance(northeast, east),
    );
  });

  it("measures the radius from the center", () => {
    expect(distanceToArc(at(0, 0), east, north, northeast)).toBeCloseTo(1);
  });

  it("mirrors when the ends are swapped", () => {
    expect(distanceToArc(at(0.5, 0.5), north, east, northeast)).toBeCloseTo(
      distanceToArc(at(0.5, 0.5), east, north, northeast),
    );
  });

  it("measures to the segment when the three are in a line", () => {
    expect(distanceToArc(at(5, 3), at(0, 0), at(10, 0), at(5, 0))).toBeCloseTo(
      3,
    );
  });
});

describe("arcPolyline", () => {
  it("ends exactly on the positions it was given", () => {
    const points = arcPolyline(east, north, northeast, 0.1);

    expect(points[0]).toEqual(east);
    expect(points[points.length - 1]).toEqual(north);
  });

  it("puts every point on the arc's circle", () => {
    const points = arcPolyline(east, north, northeast, 0.01);

    for (const point of points) {
      expect(distance(at(0, 0), point)).toBeCloseTo(1);
    }
  });

  it("keeps every chord within the tolerance asked for", () => {
    const circle = circleThrough(east, north, northeast);

    for (const tolerance of [0.5, 0.1, 0.01, 0.0001]) {
      expect(worstSag(arcPolyline(east, north, northeast, tolerance), circle))
        .toBeLessThanOrEqual(tolerance);
    }
  });

  it("subdivides a finer tolerance further", () => {
    const coarse = arcPolyline(east, north, northeast, 0.1);
    const fine = arcPolyline(east, north, northeast, 0.001);

    expect(fine.length).toBeGreaterThan(coarse.length);
  });

  it("subdivides a longer sweep further, at the same radius", () => {
    const quarter = arcPolyline(east, north, northeast, 0.01);
    const threeQuarters = arcPolyline(east, north, southwest, 0.01);

    expect(threeQuarters.length).toBeGreaterThan(quarter.length);
  });

  it("subdivides a wider curve further, for the same sweep", () => {
    // A quarter circle of radius 10 rather than 1. Each chord may be longer
    // — the tolerance is a fixed distance, and there is more room under a
    // gentler curve — but the arc grows faster than the chords do, so it
    // still takes more of them.
    const tight = arcPolyline(east, north, northeast, 0.01);
    const wide = arcPolyline(at(10, 0), at(0, 10), at(7.07107, 7.07107), 0.01);

    expect(wide.length).toBeGreaterThan(tight.length);
  });

  it("takes the long way round when the via does", () => {
    const points = arcPolyline(east, north, southwest, 0.01);

    // The three quarters run through the far side of the circle, which the
    // quarter between the same two ends never enters.
    expect(points.some((point) => point.x < 0 && point.z < 0)).toBe(true);
  });

  it("is the two ends alone when the three are in a line", () => {
    expect(arcPolyline(at(0, 0), at(10, 0), at(5, 0), 0.01)).toEqual([
      at(0, 0),
      at(10, 0),
    ]);
  });

  it("stops subdividing rather than running away on a tolerance of zero", () => {
    const points = arcPolyline(east, north, northeast, 0);

    expect(points.length).toBeLessThanOrEqual(513);
    for (const point of points) {
      expect(distance(at(0, 0), point)).toBeCloseTo(1);
    }
  });
});
