import { describe, expect, it } from "vitest";
import { sectionDirectionLeavingNode } from "./queries";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";

function at(x: number, z: number): Vec2 {
  return { x, z };
}

function expectDirection(direction: Vec2, expected: Vec2): void {
  expect(direction.x).toBeCloseTo(expected.x);
  expect(direction.z).toBeCloseTo(expected.z);
}

describe("sectionDirectionLeavingNode", () => {
  it("points a straight from its from node toward its to node", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    expectDirection(
      sectionDirectionLeavingNode(network, section, section.from),
      at(1, 0),
    );
  });

  it("points a straight from its to node back toward its from node", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    expectDirection(
      sectionDirectionLeavingNode(network, section, section.to),
      at(-1, 0),
    );
  });

  it("follows an arc's tangent at the node, not its chord", () => {
    const network = new RoadNetwork();
    // A half circle over the top from west to east, going up from both ends.
    const arc = network.addSection(at(0, 0), at(10, 0), {
      kind: "arc",
      via: at(5, 5),
    });

    expectDirection(
      sectionDirectionLeavingNode(network, arc, arc.from),
      at(0, 1),
    );
    expectDirection(
      sectionDirectionLeavingNode(network, arc, arc.to),
      at(0, 1),
    );
  });

  it("throws for a section that does not meet the node", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    const elsewhere = network.addSection(at(20, 0), at(30, 0), STRAIGHT);

    expect(() =>
      sectionDirectionLeavingNode(network, section, elsewhere.from),
    ).toThrow();
  });
});
