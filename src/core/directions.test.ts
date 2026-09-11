import { describe, expect, it } from "vitest";
import { continuingDirectionsAt } from "./directions";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT, type NodeId, type Vec2 } from "./types";

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
