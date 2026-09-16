import { describe, expect, it } from "vitest";
import {
  bisectorDirectionsAt,
  continuingDirectionsAt,
  geometryLeaving,
  midSectionDirectionsAt,
  nearestDirection,
  perpendicularDirectionsAt,
} from "./directions";
import { distance, type Vec2 } from "../geometry/points";
import { RoadNetwork } from "./RoadNetwork";
import {
  STRAIGHT,
  type NodeId,
  type SectionGeometry,
  type SectionId,
} from "./types";

function at(x: number, z: number): Vec2 {
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
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    expectDirections(continuingDirectionsAt(network, section.to), [at(1, 0)]);
  });

  it("carries a dead end on past the end it starts from", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    expectDirections(continuingDirectionsAt(network, section.from), [
      at(-1, 0),
    ]);
  });

  it("points each road at a through-node along the other", () => {
    const network = new RoadNetwork();
    const west = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    network.addSection(west.to, at(20, 0), STRAIGHT);

    expectDirections(continuingDirectionsAt(network, west.to), [
      at(1, 0),
      at(-1, 0),
    ]);
  });

  it("carries an arc on along its tangent", () => {
    const network = new RoadNetwork();
    // A half circle over the top from west to east, coming down at both ends.
    const section = network.addSection(at(0, 0), at(10, 0), {
      kind: "arc",
      via: at(5, 5),
    });

    expectDirections(continuingDirectionsAt(network, section.to), [at(0, -1)]);
    expectDirections(continuingDirectionsAt(network, section.from), [
      at(0, -1),
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
    const west = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    network.addSection(west.to, at(20, 0), STRAIGHT);

    expectDirectionsInAnyOrder(bisectorDirectionsAt(network, west.to), [
      at(0, 1),
      at(0, -1),
    ]);
  });

  it("splits each of the three gaps at a T junction", () => {
    const network = new RoadNetwork();
    const west = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    network.addSection(west.to, at(20, 0), STRAIGHT);
    network.addSection(west.to, at(10, 10), STRAIGHT);

    expectDirectionsInAnyOrder(bisectorDirectionsAt(network, west.to), [
      at(diagonal, diagonal),
      at(-diagonal, diagonal),
      at(0, -1),
    ]);
  });

  it("splits a gap wider than a half turn toward its own side", () => {
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    network.addSection(east.from, at(0, 10), STRAIGHT);

    expectDirectionsInAnyOrder(bisectorDirectionsAt(network, east.from), [
      at(diagonal, diagonal),
      at(-diagonal, -diagonal),
    ]);
  });

  it("splits the gap from an arc's tangent, not from its chord", () => {
    const network = new RoadNetwork();
    // Leaves its start straight up, square to the chord along the x axis.
    const arc = network.addSection(at(0, 0), at(10, 0), {
      kind: "arc",
      via: at(5, 5),
    });
    network.addSection(arc.from, at(-10, 0), STRAIGHT);

    expectDirectionsInAnyOrder(bisectorDirectionsAt(network, arc.from), [
      at(-diagonal, diagonal),
      at(diagonal, -diagonal),
    ]);
  });

  it("is empty at a dead end, having no gap between two roads", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    expect(bisectorDirectionsAt(network, section.to)).toEqual([]);
  });

  it("is empty for a node the network does not have", () => {
    expect(bisectorDirectionsAt(new RoadNetwork(), 99 as NodeId)).toEqual([]);
  });
});

describe("perpendicularDirectionsAt", () => {
  it("gives both sides of a straight dead end", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    expectDirectionsInAnyOrder(perpendicularDirectionsAt(network, section.to), [
      at(0, 1),
      at(0, -1),
    ]);
  });

  it("is square to an arc's tangent, not to its chord", () => {
    const network = new RoadNetwork();
    // Leaves its start straight up, square to the chord along the x axis.
    const arc = network.addSection(at(0, 0), at(10, 0), {
      kind: "arc",
      via: at(5, 5),
    });

    expectDirectionsInAnyOrder(perpendicularDirectionsAt(network, arc.from), [
      at(1, 0),
      at(-1, 0),
    ]);
  });

  it("gives both sides of each road where two meet at an angle", () => {
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    network.addSection(east.from, at(10, 10), STRAIGHT);
    const diagonal = Math.SQRT1_2;

    expectDirectionsInAnyOrder(perpendicularDirectionsAt(network, east.from), [
      at(0, 1),
      at(0, -1),
      at(-diagonal, diagonal),
      at(diagonal, -diagonal),
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
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    expectDirectionsInAnyOrder(
      midSectionDirectionsAt(network, section.id, at(5, 0)),
      [at(1, 0), at(-1, 0), at(0, 1), at(0, -1)],
    );
  });

  it("follows an arc's tangent at the place, not its chord", () => {
    const network = new RoadNetwork();
    // A half circle about (5, 0), asked about 30° round from its start. Not
    // 45°: the four directions repeat every 90°, so there the place mirrored
    // across the arc's middle would give the same four, and a fraction
    // measured from the wrong end would pass.
    const arc = network.addSection(at(0, 0), at(10, 0), {
      kind: "arc",
      via: at(5, 5),
    });
    const half = 0.5;
    const root3Half = Math.sqrt(3) / 2;

    expectDirectionsInAnyOrder(
      midSectionDirectionsAt(network, arc.id, at(5 - 5 * root3Half, 5 * half)),
      [
        at(half, root3Half),
        at(-half, -root3Half),
        at(-root3Half, half),
        at(root3Half, -half),
      ],
    );
  });

  it("throws for a section the network does not have", () => {
    expect(() =>
      midSectionDirectionsAt(new RoadNetwork(), 99 as SectionId, at(0, 0)),
    ).toThrow();
  });
});

describe("nearestDirection", () => {
  const compass = [at(1, 0), at(0, 1), at(-1, 0), at(0, -1)];

  it("picks the direction at the smallest angle to the aim", () => {
    // 30° round from east toward north.
    expect(nearestDirection(compass, at(Math.sqrt(3) / 2, 0.5))).toEqual(
      at(1, 0),
    );
  });

  it("does not depend on how long the aim is", () => {
    expect(nearestDirection(compass, at(0.001, 0.003))).toEqual(at(0, 1));
    expect(nearestDirection(compass, at(100, 300))).toEqual(at(0, 1));
  });

  it("picks the least far round where every direction points away", () => {
    expect(nearestDirection([at(-1, 0), at(0, -1)], at(1, 0.1))).toEqual(
      at(0, -1),
    );
  });

  it("keeps the first of two tied directions", () => {
    // Exactly between east and north.
    expect(nearestDirection(compass, at(1, 1))).toBe(compass[0]);
  });

  it("is null without directions", () => {
    expect(nearestDirection([], at(1, 0))).toBeNull();
  });
});

/** The arc's via, or a failure saying so rather than one about its shape. */
function arcVia(geometry: SectionGeometry | null): Vec2 {
  if (geometry === null || geometry.kind !== "arc") {
    throw new Error("expected an arc");
  }
  return geometry.via;
}

describe("geometryLeaving", () => {
  it("is an arc for a direction aimed to one side of the end", () => {
    // From east heading north, to north: a quarter of the unit circle.
    const via = arcVia(geometryLeaving(at(1, 0), at(0, 1), at(0, 1)));

    expect(via.x).toBeCloseTo(Math.SQRT1_2);
    expect(via.z).toBeCloseTo(Math.SQRT1_2);
  });

  it("is a straight for a direction aimed at the end", () => {
    expect(geometryLeaving(at(0, 0), at(1, 0), at(10, 0))).toEqual(STRAIGHT);
  });

  it("is a straight while the arc bulges less than a centimeter", () => {
    // About 2.5 mm off the chord at its middle.
    expect(geometryLeaving(at(0, 0), at(1, 0.001), at(10, 0))).toEqual(
      STRAIGHT,
    );
  });

  it("is an arc once it bulges more than a centimeter", () => {
    // About 2.5 cm off the chord at its middle.
    arcVia(geometryLeaving(at(0, 0), at(1, 0.01), at(10, 0)));
  });

  it("is a half circle for a direction perpendicular to the chord", () => {
    const via = arcVia(geometryLeaving(at(0, 0), at(0, 1), at(10, 0)));

    expect(via.x).toBeCloseTo(5);
    expect(via.z).toBeCloseTo(5);
  });

  it("takes the long way round for a direction pointing away from the end", () => {
    // From east heading south, to north: three quarters of the unit circle.
    const via = arcVia(geometryLeaving(at(1, 0), at(0, -1), at(0, 1)));

    expect(via.x).toBeCloseTo(-Math.SQRT1_2);
    expect(via.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it("is null for a direction pointing exactly away from the end", () => {
    expect(geometryLeaving(at(0, 0), at(-1, 0), at(10, 0))).toBeNull();
  });
});
