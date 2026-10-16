import { describe, expect, it } from "vitest";
import { arcCircle, type ArcCircle } from "../geometry/arc";
import {
  lineLength,
  STRAIGHT,
  type Line,
  type LineGeometry,
} from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import type { Roadway } from "../layout/roadway";
import type { RoadProfile, SectionId } from "../network/types";
import { TEST_ROAD_PROFILE } from "../testSupport";
import { LANE_WIDTH_METERS, lanesOf } from "./lane";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

function expectAt(point: Vec2, x: number, z: number): void {
  expect(point.x).toBeCloseTo(x);
  expect(point.z).toBeCloseTo(z);
}

const v = LANE_WIDTH_METERS;
const SECTION = 7 as SectionId;

/** Two lanes each way, on a road wide enough for them. */
const TWO_LANES: RoadProfile = { width: 16, lanesPerDirection: 2 };

/** A roadway along `SECTION`, from `from` to `to`: all `lanesOf` reads. */
function roadway(
  from: Vec2,
  to: Vec2,
  centerlineGeometry: LineGeometry,
  profile: RoadProfile,
): Roadway {
  return {
    length: lineLength(from, to, centerlineGeometry),
    outline: {
      kind: "roadway",
      section: SECTION,
      from,
      to,
      centerlineGeometry,
      widthMeters: profile.width,
    },
    profile,
    crossings: { from: false, to: false },
    turnArrows: { from: false, to: false },
  };
}

/** The circle a lane runs on, or a failure saying it is no arc. */
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

// A quarter of the circle of radius 100 around the origin, turning from +x
// toward +z: its right is inward.
const quarter: LineGeometry = {
  kind: "arc",
  via: vec(100 * Math.SQRT1_2, 100 * Math.SQRT1_2),
};

describe("lanesOf", () => {
  it("gives a lane per lane each way, + lanes first, counted out", () => {
    const ids = (profile: RoadProfile) =>
      lanesOf(roadway(vec(0, 0), vec(100, 0), STRAIGHT, profile)).map(
        (lane) => lane.id,
      );

    expect(ids(TEST_ROAD_PROFILE)).toEqual([
      { section: SECTION, index: 1 },
      { section: SECTION, index: -1 },
    ]);
    expect(ids(TWO_LANES).map((id) => id.index)).toEqual([1, 2, -1, -2]);
  });

  it("runs + lanes from → to on the right, - lanes back on the left", () => {
    // Heading +x, the right is +z.
    const [plus1, plus2, minus1, minus2] = lanesOf(
      roadway(vec(0, 0), vec(100, 0), STRAIGHT, TWO_LANES),
    ).map((lane) => lane.centerline);

    expectAt(plus1.from, 0, v / 2);
    expectAt(plus1.to, 100, v / 2);
    expectAt(plus2.from, 0, 1.5 * v);
    expectAt(plus2.to, 100, 1.5 * v);
    expectAt(minus1.from, 100, -v / 2);
    expectAt(minus1.to, 0, -v / 2);
    expectAt(minus2.from, 100, -1.5 * v);
    expectAt(minus2.to, 0, -1.5 * v);
  });

  it("runs an arc's lanes around its center, ends square to its ends", () => {
    const [forward, backward] = lanesOf(
      roadway(vec(100, 0), vec(0, 100), quarter, TEST_ROAD_PROFILE),
    ).map((lane) => lane.centerline);

    const inner = circleOf(forward);
    expectAt(inner.center, 0, 0);
    expect(inner.radius).toBeCloseTo(100 - v / 2);
    expectAt(forward.from, 100 - v / 2, 0);
    expectAt(forward.to, 0, 100 - v / 2);

    const outer = circleOf(backward);
    expectAt(outer.center, 0, 0);
    expect(outer.radius).toBeCloseTo(100 + v / 2);
    expectAt(backward.from, 0, 100 + v / 2);
    expectAt(backward.to, 100 + v / 2, 0);
  });

  it("throws where a lane would pass its arc's center", () => {
    // Radius 1: lane +1, `v/2` to the right, would lie past the center.
    const tight = roadway(
      vec(1, 0),
      vec(0, 1),
      { kind: "arc", via: vec(Math.SQRT1_2, Math.SQRT1_2) },
      TEST_ROAD_PROFILE,
    );

    expect(() => lanesOf(tight)).toThrow();
  });
});
