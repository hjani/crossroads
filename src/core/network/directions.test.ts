import { describe, expect, it } from "vitest";
import {
  bisectorDirectionsAt,
  continuingDirectionsAt,
  geometryLeaving,
  midSectionDirectionsAt,
  nearestDirection,
  perpendicularDirectionsAt,
} from "./directions";
import { distance, type Vec2 } from "../geometry/point";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT, type LineGeometry } from "../geometry/lineGeometry";
import { type NodeId, type SectionId } from "./types";
import { addStraight, TEST_ROAD_PROFILE } from "../testSupport";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

function expectDirections(
  directions: readonly Vec2[],
  expected: readonly Vec2[],
): void {
  expect(directions).toHaveLength(expected.length);
  directions.forEach((direction, index) => {
    expect(direction.x).toBeCloseTo(expected[index].x);
    expect(direction.z).toBeCloseTo(expected[index].z);
  });
}

/** As `expectDirections`, for a result that promises no order. */
function expectDirectionsInAnyOrder(
  directions: readonly Vec2[],
  expected: readonly Vec2[],
): void {
  expect(directions).toHaveLength(expected.length);
  for (const wanted of expected) {
    const found = directions.some(
      (direction) => distance(direction, wanted) < 1e-6,
    );
    expect(found, `no direction (${wanted.x}, ${wanted.z})`).toBe(true);
  }
}

describe("continuingDirectionsAt", () => {
  it("carries a dead end on past the end it arrives at", () => {
    const network = new RoadNetwork();
    const section = addStraight(network, vec(0, 0), vec(10, 0));

    expectDirections(continuingDirectionsAt(network, section.to), [vec(1, 0)]);
  });

  it("carries a dead end on past the end it starts from", () => {
    const network = new RoadNetwork();
    const section = addStraight(network, vec(0, 0), vec(10, 0));

    expectDirections(continuingDirectionsAt(network, section.from), [
      vec(-1, 0),
    ]);
  });

  it("points each road at a through-node along the other", () => {
    const network = new RoadNetwork();
    const west = addStraight(network, vec(0, 0), vec(10, 0));
    addStraight(network, west.to, vec(20, 0));

    expectDirections(continuingDirectionsAt(network, west.to), [
      vec(1, 0),
      vec(-1, 0),
    ]);
  });

  it("carries an arc on along its tangent", () => {
    const network = new RoadNetwork();
    // A half circle over the top from west to east, coming down at both ends.
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 5),
      },
      TEST_ROAD_PROFILE,
    );

    expectDirections(continuingDirectionsAt(network, section.to), [vec(0, -1)]);
    expectDirections(continuingDirectionsAt(network, section.from), [
      vec(0, -1),
    ]);
  });

  it("is empty for a node the network does not have", () => {
    expect(continuingDirectionsAt(new RoadNetwork(), 99 as NodeId)).toEqual([]);
  });
});

describe("bisectorDirectionsAt", () => {
  const diagonal = Math.SQRT1_2;

  it("gives the perpendiculars at a straight through-node", () => {
    const network = new RoadNetwork();
    const west = addStraight(network, vec(0, 0), vec(10, 0));
    addStraight(network, west.to, vec(20, 0));

    expectDirectionsInAnyOrder(bisectorDirectionsAt(network, west.to), [
      vec(0, 1),
      vec(0, -1),
    ]);
  });

  it("splits each of the three gaps at a T junction", () => {
    const network = new RoadNetwork();
    const west = addStraight(network, vec(0, 0), vec(10, 0));
    addStraight(network, west.to, vec(20, 0));
    addStraight(network, west.to, vec(10, 10));

    expectDirectionsInAnyOrder(bisectorDirectionsAt(network, west.to), [
      vec(diagonal, diagonal),
      vec(-diagonal, diagonal),
      vec(0, -1),
    ]);
  });

  it("splits a gap wider than a half turn toward its own side", () => {
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(10, 0));
    addStraight(network, east.from, vec(0, 10));

    expectDirectionsInAnyOrder(bisectorDirectionsAt(network, east.from), [
      vec(diagonal, diagonal),
      vec(-diagonal, -diagonal),
    ]);
  });

  it("splits the gap from an arc's tangent, not from its chord", () => {
    const network = new RoadNetwork();
    // Leaves its start straight up, square to the chord along the x axis.
    const arc = network.addSection(
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 5),
      },
      TEST_ROAD_PROFILE,
    );
    addStraight(network, arc.from, vec(-10, 0));

    expectDirectionsInAnyOrder(bisectorDirectionsAt(network, arc.from), [
      vec(-diagonal, diagonal),
      vec(diagonal, -diagonal),
    ]);
  });

  it("is empty at a dead end, having no gap between two roads", () => {
    const network = new RoadNetwork();
    const section = addStraight(network, vec(0, 0), vec(10, 0));

    expect(bisectorDirectionsAt(network, section.to)).toEqual([]);
  });

  it("is empty for a node the network does not have", () => {
    expect(bisectorDirectionsAt(new RoadNetwork(), 99 as NodeId)).toEqual([]);
  });
});

describe("perpendicularDirectionsAt", () => {
  it("gives both sides of a straight dead end", () => {
    const network = new RoadNetwork();
    const section = addStraight(network, vec(0, 0), vec(10, 0));

    expectDirectionsInAnyOrder(perpendicularDirectionsAt(network, section.to), [
      vec(0, 1),
      vec(0, -1),
    ]);
  });

  it("is square to an arc's tangent, not to its chord", () => {
    const network = new RoadNetwork();
    // Leaves its start straight up, square to the chord along the x axis.
    const arc = network.addSection(
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 5),
      },
      TEST_ROAD_PROFILE,
    );

    expectDirectionsInAnyOrder(perpendicularDirectionsAt(network, arc.from), [
      vec(1, 0),
      vec(-1, 0),
    ]);
  });

  it("gives both sides of each road where two meet at an angle", () => {
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(10, 0));
    addStraight(network, east.from, vec(10, 10));
    const diagonal = Math.SQRT1_2;

    expectDirectionsInAnyOrder(perpendicularDirectionsAt(network, east.from), [
      vec(0, 1),
      vec(0, -1),
      vec(-diagonal, diagonal),
      vec(diagonal, -diagonal),
    ]);
  });

  it("is empty for a node the network does not have", () => {
    expect(perpendicularDirectionsAt(new RoadNetwork(), 99 as NodeId)).toEqual(
      [],
    );
  });
});

describe("midSectionDirectionsAt", () => {
  it("runs both ways along a straight and square to it", () => {
    const network = new RoadNetwork();
    const section = addStraight(network, vec(0, 0), vec(10, 0));

    expectDirectionsInAnyOrder(
      midSectionDirectionsAt(network, section.id, vec(5, 0)),
      [vec(1, 0), vec(-1, 0), vec(0, 1), vec(0, -1)],
    );
  });

  it("follows an arc's tangent at the place, not its chord", () => {
    const network = new RoadNetwork();
    // A half circle about (5, 0), asked about 30° round from its start. Not
    // 45°: the four directions repeat every 90°, so there the place mirrored
    // across the arc's middle would give the same four, and a fraction
    // measured from the wrong end would pass.
    const arc = network.addSection(
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 5),
      },
      TEST_ROAD_PROFILE,
    );
    const half = 0.5;
    const root3Half = Math.sqrt(3) / 2;

    expectDirectionsInAnyOrder(
      midSectionDirectionsAt(network, arc.id, vec(5 - 5 * root3Half, 5 * half)),
      [
        vec(half, root3Half),
        vec(-half, -root3Half),
        vec(-root3Half, half),
        vec(root3Half, -half),
      ],
    );
  });

  it("throws for a section the network does not have", () => {
    expect(() =>
      midSectionDirectionsAt(new RoadNetwork(), 99 as SectionId, vec(0, 0)),
    ).toThrow();
  });
});

describe("nearestDirection", () => {
  const compass = [vec(1, 0), vec(0, 1), vec(-1, 0), vec(0, -1)];

  it("picks the direction at the smallest angle to the aim", () => {
    // 30° round from east toward north.
    expect(nearestDirection(compass, vec(Math.sqrt(3) / 2, 0.5))).toEqual(
      vec(1, 0),
    );
  });

  it("does not depend on how long the aim is", () => {
    expect(nearestDirection(compass, vec(0.001, 0.003))).toEqual(vec(0, 1));
    expect(nearestDirection(compass, vec(100, 300))).toEqual(vec(0, 1));
  });

  it("picks the least far round where every direction points away", () => {
    expect(nearestDirection([vec(-1, 0), vec(0, -1)], vec(1, 0.1))).toEqual(
      vec(0, -1),
    );
  });

  it("keeps the first of two tied directions", () => {
    // Exactly between east and north.
    expect(nearestDirection(compass, vec(1, 1))).toBe(compass[0]);
  });

  it("is null without directions", () => {
    expect(nearestDirection([], vec(1, 0))).toBeNull();
  });
});

/** The arc's via, or a failure saying so rather than one about its shape. */
function arcVia(centerlineGeometry: LineGeometry | null): Vec2 {
  if (centerlineGeometry === null || centerlineGeometry.kind !== "arc") {
    throw new Error("expected an arc");
  }
  return centerlineGeometry.via;
}

describe("geometryLeaving", () => {
  it("is an arc for a direction aimed to one side of the end", () => {
    // From east heading north, to north: a quarter of the unit circle.
    const via = arcVia(geometryLeaving(vec(1, 0), vec(0, 1), vec(0, 1)));

    expect(via.x).toBeCloseTo(Math.SQRT1_2);
    expect(via.z).toBeCloseTo(Math.SQRT1_2);
  });

  it("is a straight for a direction aimed at the end", () => {
    expect(geometryLeaving(vec(0, 0), vec(1, 0), vec(10, 0))).toEqual(STRAIGHT);
  });

  it("is a straight while the arc bulges less than a centimeter", () => {
    // About 2.5 mm off the chord at its middle.
    expect(geometryLeaving(vec(0, 0), vec(1, 0.001), vec(10, 0))).toEqual(
      STRAIGHT,
    );
  });

  it("is an arc once it bulges more than a centimeter", () => {
    // About 2.5 cm off the chord at its middle.
    arcVia(geometryLeaving(vec(0, 0), vec(1, 0.01), vec(10, 0)));
  });

  it("is a half circle for a direction perpendicular to the chord", () => {
    const via = arcVia(geometryLeaving(vec(0, 0), vec(0, 1), vec(10, 0)));

    expect(via.x).toBeCloseTo(5);
    expect(via.z).toBeCloseTo(5);
  });

  it("takes the long way round for a direction pointing away from the end", () => {
    // From east heading south, to north: three quarters of the unit circle.
    const via = arcVia(geometryLeaving(vec(1, 0), vec(0, -1), vec(0, 1)));

    expect(via.x).toBeCloseTo(-Math.SQRT1_2);
    expect(via.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it("is null for a direction pointing exactly away from the end", () => {
    expect(geometryLeaving(vec(0, 0), vec(-1, 0), vec(10, 0))).toBeNull();
  });
});
