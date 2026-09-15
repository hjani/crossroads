import { describe, expect, it } from "vitest";
import { RoadNetwork } from "./RoadNetwork";
import { roadwayOf } from "./roadways";
import { STRAIGHT, type Vec2 } from "./types";

const WIDTH_METERS = 8;

function at(x: number, z: number): Vec2 {
  return { x, z };
}

function expectPoint(point: Vec2, expected: Vec2): void {
  expect(point.x).toBeCloseTo(expected.x);
  expect(point.z).toBeCloseTo(expected.z);
}

describe("roadwayOf", () => {
  it("sets a straight back at both ends, each by its own junction", () => {
    const network = new RoadNetwork();
    const road = network.addSection(at(0, 0), at(20, 0), STRAIGHT);
    // A right-angle bend at the start, a 60° gap at the end.
    network.addSection(road.from, at(0, 20), STRAIGHT);
    network.addSection(road.to, at(10, 10 * Math.sqrt(3)), STRAIGHT);

    const roadway = roadwayOf(network, road, WIDTH_METERS);

    expectPoint(roadway.from, at(4, 0));
    expectPoint(roadway.to, at(20 - 4 * Math.sqrt(3), 0));
    expect(roadway.geometry).toBe(road.geometry);
  });

  it("shrinks to nothing halfway along when both setbacks are clamped", () => {
    const network = new RoadNetwork();
    const road = network.addSection(at(0, 0), at(6, 0), STRAIGHT);
    // Right-angle bends at both ends, each wanting 4 m of a 6 m road.
    network.addSection(road.from, at(0, 20), STRAIGHT);
    network.addSection(road.to, at(6, 20), STRAIGHT);

    const roadway = roadwayOf(network, road, WIDTH_METERS);

    expectPoint(roadway.from, at(3, 0));
    expectPoint(roadway.to, at(3, 0));
  });

  it("leaves an arc whole", () => {
    const network = new RoadNetwork();
    const arc = network.addSection(at(0, 0), at(20, 0), {
      kind: "arc",
      via: at(10, 10),
    });
    network.addSection(arc.from, at(0, -20), STRAIGHT);

    const roadway = roadwayOf(network, arc, WIDTH_METERS);

    expectPoint(roadway.from, at(0, 0));
    expectPoint(roadway.to, at(20, 0));
    expect(roadway.geometry).toBe(arc.geometry);
  });
});
