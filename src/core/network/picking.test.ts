import { describe, expect, it } from "vitest";
import { nearestPointOnSection, nearestSection } from "./queries";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import { TEST_ROAD_WIDTH_METERS } from "../testSupport";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

describe("nearestSection", () => {
  it("finds a section the position runs alongside", () => {
    const network = new RoadNetwork();
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );

    expect(nearestSection(network, vec(5, 2), 3)?.id).toBe(section.id);
  });

  it("is null where nothing is in range", () => {
    const network = new RoadNetwork();
    network.addSection(vec(0, 0), vec(10, 0), STRAIGHT, TEST_ROAD_WIDTH_METERS);

    expect(nearestSection(network, vec(5, 2), 1)).toBeNull();
  });

  it("is null for an empty network", () => {
    expect(nearestSection(new RoadNetwork(), vec(0, 0), 100)).toBeNull();
  });

  it("takes the nearer of two in range", () => {
    const network = new RoadNetwork();
    const near = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    network.addSection(vec(0, 5), vec(10, 5), STRAIGHT, TEST_ROAD_WIDTH_METERS);

    expect(nearestSection(network, vec(5, 2), 10)?.id).toBe(near.id);
  });

  it("finds an arc by its curve and not by its chord", () => {
    const network = new RoadNetwork();
    // A half circle of radius five, bulging away from the line between its
    // ends. A meter outside the curve at the top; four and a half from it
    // halfway along the chord, where a section measured end to end would
    // have been half a meter away.
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 5),
      },
      TEST_ROAD_WIDTH_METERS,
    );

    expect(nearestSection(network, vec(5, 6), 2)?.id).toBe(section.id);
    expect(nearestSection(network, vec(5, 0.5), 2)).toBeNull();
  });

  it("reaches a section only by its end", () => {
    const network = new RoadNetwork();
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );

    // Past the end, so the distance is to the end itself — in range at
    // three meters, out of it at one.
    expect(nearestSection(network, vec(12, 2), 3)?.id).toBe(section.id);
    expect(nearestSection(network, vec(12, 2), 1)).toBeNull();
  });
});

describe("nearestPointOnSection", () => {
  it("drops straight across onto a straight", () => {
    const network = new RoadNetwork();
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );

    expect(nearestPointOnSection(network, section, vec(4, 3))).toEqual(
      vec(4, 0),
    );
  });

  it("gives the end of a straight for a position past it", () => {
    const network = new RoadNetwork();
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );

    expect(nearestPointOnSection(network, section, vec(13, 2))).toEqual(
      vec(10, 0),
    );
  });

  it("drops onto an arc's curve, toward its center", () => {
    const network = new RoadNetwork();
    // A half circle of radius five around (5,0). The position is ten from the
    // center, so the nearest point is halfway back toward it.
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 5),
      },
      TEST_ROAD_WIDTH_METERS,
    );

    const point = nearestPointOnSection(network, section, vec(13, 6));
    expect(point.x).toBeCloseTo(9);
    expect(point.z).toBeCloseTo(3);
  });

  it("gives the nearer end of an arc for a position outside its sweep", () => {
    const network = new RoadNetwork();
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 5),
      },
      TEST_ROAD_WIDTH_METERS,
    );

    // Below the chord, where the half circle never runs.
    const point = nearestPointOnSection(network, section, vec(-1, -3));
    expect(point.x).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(0);
  });
});
