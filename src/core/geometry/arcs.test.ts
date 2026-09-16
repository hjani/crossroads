import { describe, expect, it } from "vitest";
import {
  arcArcCrossings,
  arcCircle,
  arcDirectionAt,
  arcFractionAt,
  arcLength,
  arcPolyline,
  arcViaLeaving,
  pointOnArc,
  segmentArcCrossings,
  type ArcCircle,
} from "./arcs";
import { distance, type Vec2 } from "./points";

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

/** The via, or a failure saying so rather than one about null. */
function viaLeaving(from: Vec2, direction: Vec2, to: Vec2): Vec2 {
  const via = arcViaLeaving(from, direction, to);
  if (via === null) {
    throw new Error("expected an arc leaving in that direction");
  }
  return via;
}

describe("arcViaLeaving", () => {
  it("gives the midpoint of a quarter circle", () => {
    // From east heading north, to north: a quarter of the unit circle.
    expectAt(viaLeaving(east, at(0, 1), north), northeast.x, northeast.z);
  });

  it("bends to the side the direction points to", () => {
    // From east heading west, to north: a quarter of the circle around (1, 1).
    expectAt(
      viaLeaving(east, at(-1, 0), north),
      1 - Math.SQRT1_2,
      1 - Math.SQRT1_2,
    );
  });

  it("takes the long way round for a direction pointing away from the end", () => {
    // From east heading south, to north: three quarters of the unit circle.
    expectAt(viaLeaving(east, at(0, -1), north), southwest.x, southwest.z);
  });

  it("gives a half circle for a direction perpendicular to the chord", () => {
    expectAt(viaLeaving(at(0, 0), at(0, 1), at(10, 0)), 5, 5);
  });

  it("gives an arc that leaves in the direction and has the via halfway", () => {
    // The chord points at 135°. These directions avoid 135° and 315°, and
    // include some that point away from the end (long arcs).
    const from = at(3, -2);
    const to = at(-4, 5);
    for (const angle of [0.3, 1.2, 2.0, 3.5, 4.5]) {
      const direction = at(Math.cos(angle), Math.sin(angle));
      const via = viaLeaving(from, direction, to);

      expectAt(arcDirectionAt(from, to, via, 0), direction.x, direction.z);
      expectAt(pointOnArc(from, to, via, 0.5), via.x, via.z);
    }
  });

  it("gives a via in line with the ends for a direction aimed at the end", () => {
    const via = viaLeaving(at(0, 0), at(1, 0), at(10, 0));

    expectAt(via, 5, 0);
    expect(arcCircle(at(0, 0), at(10, 0), via)).toBeNull();
  });

  it("does not depend on the direction's length", () => {
    expectAt(viaLeaving(at(0, 0), at(0, 3), at(10, 0)), 5, 5);
  });

  it("is null for a direction pointing exactly away from the end", () => {
    expect(arcViaLeaving(at(0, 0), at(-1, 0), at(10, 0))).toBeNull();
  });

  it("is null when the ends are the same point", () => {
    expect(arcViaLeaving(east, at(0, 1), east)).toBeNull();
  });
});

describe("pointOnArc", () => {
  it("starts at one end and finishes at the other", () => {
    expectAt(pointOnArc(east, north, northeast, 0), east.x, east.z);
    expectAt(pointOnArc(east, north, northeast, 1), north.x, north.z);
  });

  it("passes through the via halfway when the via is the midpoint", () => {
    expectAt(pointOnArc(east, north, northeast, 0.5), northeast.x, northeast.z);
  });

  it("goes the other way round for a via on the other side", () => {
    // Halfway along the three-quarter arc is due southwest, not northeast.
    expectAt(pointOnArc(east, north, southwest, 0.5), southwest.x, southwest.z);
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

describe("arcDirectionAt", () => {
  it("heads along the circle at either end", () => {
    // Counterclockwise from due east: setting off north, arriving heading west.
    expectAt(arcDirectionAt(east, north, northeast, 0), 0, 1);
    expectAt(arcDirectionAt(east, north, northeast, 1), -1, 0);
  });

  it("heads the other way round for a via on the other side", () => {
    // Clockwise through the south: setting off south, arriving heading east.
    expectAt(arcDirectionAt(east, north, southwest, 0), 0, -1);
    expectAt(arcDirectionAt(east, north, southwest, 1), 1, 0);
  });

  it("heads from one end to the other when the three are in a line", () => {
    expectAt(arcDirectionAt(at(0, 0), at(10, 0), at(5, 0), 0.25), 1, 0);
  });
});

describe("arcFractionAt", () => {
  it("reads back what pointOnArc was given", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const point = pointOnArc(east, north, northeast, t);
      expect(arcFractionAt(east, north, northeast, point)).toBeCloseTo(t);
    }
  });

  it("reads back along an arc that goes the long way round", () => {
    // The sweep runs backwards here, so a fraction of it is counted down
    // from a full circle rather than up from nothing — and the ends have to
    // come out at 0 and 1 all the same.
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const point = pointOnArc(east, north, southwest, t);
      expect(arcFractionAt(east, north, southwest, point)).toBeCloseTo(t);
    }
  });

  it("answers for the place on the curve a position off it points at", () => {
    // Twice the radius out, in the direction of the arc's midpoint. Not on
    // the road, but it is halfway along it all the same, which is what a
    // node landing a little off the curve needs this to say.
    const outside = at(2 * Math.SQRT1_2, 2 * Math.SQRT1_2);
    expect(arcFractionAt(east, north, northeast, outside)).toBeCloseTo(0.5);
  });

  it("clamps a direction the arc never turns to", () => {
    // Due south: past the start of a quarter running east to north, so the
    // arc ran out before it got there.
    expect(arcFractionAt(east, north, northeast, at(0, -1))).toBe(0);
  });

  it("measures along the segment when the three are in a line", () => {
    expect(
      arcFractionAt(at(0, 0), at(10, 0), at(5, 0), at(2.5, 0)),
    ).toBeCloseTo(0.25);
  });
});

describe("segmentArcCrossings", () => {
  // The upper half of the unit circle, running west to east through the top.
  const west = at(-1, 0);
  const top = at(0, 1);

  it("finds both places a segment cuts across an arc", () => {
    // Level with the top of the circle's midriff, so it goes in one side
    // and out the other.
    const crossings = segmentArcCrossings(
      at(-2, Math.SQRT1_2),
      at(2, Math.SQRT1_2),
      west,
      east,
      top,
    );

    expect(crossings).toHaveLength(2);
    expectAt(crossings[0].point, -Math.SQRT1_2, Math.SQRT1_2);
    expectAt(crossings[1].point, Math.SQRT1_2, Math.SQRT1_2);
  });

  it("orders them along the segment, not along the arc", () => {
    // The same line walked the other way: the crossing nearer its start is
    // the one that was second before.
    const crossings = segmentArcCrossings(
      at(2, Math.SQRT1_2),
      at(-2, Math.SQRT1_2),
      west,
      east,
      top,
    );

    expectAt(crossings[0].point, Math.SQRT1_2, Math.SQRT1_2);
    expect(crossings[0].alongA).toBeLessThan(crossings[1].alongA);
  });

  it("says how far along each of the two the meeting is", () => {
    // Straight up the middle: it meets the top of the arc halfway along
    // itself, and halfway along the arc.
    const [crossing] = segmentArcCrossings(at(0, 0), at(0, 2), west, east, top);

    expect(crossing.alongA).toBeCloseTo(0.5);
    expect(crossing.alongB).toBeCloseTo(0.5);
  });

  it("ignores where the circle is met outside the arc's own sweep", () => {
    // Straight down the middle instead, meeting the circle at its bottom —
    // which this arc, running over the top, never reaches.
    const crossings = segmentArcCrossings(at(0, 0), at(0, -2), west, east, top);

    expect(crossings).toEqual([]);
  });

  it("ignores where the line meets the circle past the segment's end", () => {
    // Along the same line as above, but stopping a whole radius short of
    // the circle: the line still meets it twice, and the segment reaches
    // neither.
    expect(
      segmentArcCrossings(
        at(-3, Math.SQRT1_2),
        at(-2, Math.SQRT1_2),
        west,
        east,
        top,
      ),
    ).toEqual([]);
  });

  it("has nothing to report for a segment that passes the circle by", () => {
    expect(segmentArcCrossings(at(-2, 2), at(2, 2), west, east, top)).toEqual(
      [],
    );
  });

  it("reports a tangent as two roots landing in the same place", () => {
    // Along the top of the circle, grazing the arc at its midpoint. A
    // discriminant that is exactly zero is not what rounding leaves, so
    // both roots come back — as the same place, to far inside the distance
    // that counts as one. Which of them is a separate junction is a
    // question about how close is the same place, and the chain answers it.
    const crossings = segmentArcCrossings(at(-2, 1), at(2, 1), west, east, top);

    expect(crossings).toHaveLength(2);
    for (const crossing of crossings) {
      expectAt(crossing.point, 0, 1);
    }
  });

  it("crosses a via in line with the ends where the segment crosses it", () => {
    const [crossing] = segmentArcCrossings(
      at(5, -5),
      at(5, 5),
      at(0, 0),
      at(10, 0),
      at(5, 0),
    );

    expectAt(crossing.point, 5, 0);
  });
});

describe("arcArcCrossings", () => {
  // The upper half of the unit circle, running west to east over the top.
  const west = at(-1, 0);
  const top = at(0, 1);

  // The upper half of a second unit circle, centered one to the east, so
  // the two circles meet at (0.5, ±√3/2) — one of which both arcs reach.
  const shiftedWest = at(0, 0);
  const shiftedEast = at(2, 0);
  const shiftedTop = at(1, 1);

  it("finds where two arcs meet", () => {
    const crossings = arcArcCrossings(
      west,
      east,
      top,
      shiftedWest,
      shiftedEast,
      shiftedTop,
    );

    expect(crossings).toHaveLength(1);
    expectAt(crossings[0].point, 0.5, Math.sqrt(3) / 2);
  });

  it("says how far along each of the two the meeting is", () => {
    const [crossing] = arcArcCrossings(
      west,
      east,
      top,
      shiftedWest,
      shiftedEast,
      shiftedTop,
    );

    // A third of the way round the first, which runs a half circle from due
    // west, and two thirds along the second, which reaches it later.
    expect(crossing.alongA).toBeCloseTo(2 / 3);
    expect(crossing.alongB).toBeCloseTo(1 / 3);
  });

  it("ignores where the circles meet outside either sweep", () => {
    // The lower halves of the same two circles as above meet at
    // (0.5, -√3/2), which neither of these arcs reaches.
    expect(
      arcArcCrossings(west, east, top, shiftedWest, shiftedEast, at(1, -1)),
    ).toEqual([]);
  });

  it("has nothing to report for circles too far apart to reach", () => {
    expect(
      arcArcCrossings(west, east, top, at(9, 0), at(11, 0), at(10, 1)),
    ).toEqual([]);
  });

  it("has nothing to report for one circle inside another", () => {
    // A tenth the radius, sharing the midpoint of the bigger one's sweep.
    expect(
      arcArcCrossings(west, east, top, at(-0.1, 0), at(0.1, 0), at(0, 0.1)),
    ).toEqual([]);
  });

  it("has nothing to report for two arcs of one circle", () => {
    // The same circle meets itself everywhere rather than at a point, which
    // is not a crossing — as two collinear segments are not.
    expect(arcArcCrossings(west, east, top, east, west, at(0, -1))).toEqual([]);
  });

  it("crosses a via in line with the ends as a straight would", () => {
    // The first arc is really a line across the middle of the second.
    const crossings = arcArcCrossings(
      at(-2, Math.SQRT1_2),
      at(2, Math.SQRT1_2),
      at(0, Math.SQRT1_2),
      west,
      east,
      top,
    );

    expect(crossings).toHaveLength(2);
    expectAt(crossings[0].point, -Math.SQRT1_2, Math.SQRT1_2);
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
      expect(
        worstSag(arcPolyline(east, north, northeast, tolerance), circle),
      ).toBeLessThanOrEqual(tolerance);
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
