import { describe, expect, it } from "vitest";
import { sectionDirectionLeavingNode, sectionRadius } from "./queries";
import { RoadNetwork } from "./RoadNetwork";
import type { Vec2 } from "../geometry/point";
import { addStraight, TEST_ROAD_PROFILE } from "../testSupport";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

function expectDirection(direction: Vec2, expected: Vec2): void {
  expect(direction.x).toBeCloseTo(expected.x);
  expect(direction.z).toBeCloseTo(expected.z);
}

describe("sectionDirectionLeavingNode", () => {
  it("points a straight from its from node toward its to node", () => {
    const network = new RoadNetwork();
    const section = addStraight(network, vec(0, 0), vec(10, 0));

    expectDirection(
      sectionDirectionLeavingNode(network, section, section.from),
      vec(1, 0),
    );
  });

  it("points a straight from its to node back toward its from node", () => {
    const network = new RoadNetwork();
    const section = addStraight(network, vec(0, 0), vec(10, 0));

    expectDirection(
      sectionDirectionLeavingNode(network, section, section.to),
      vec(-1, 0),
    );
  });

  it("follows an arc's tangent at the node, not its chord", () => {
    const network = new RoadNetwork();
    // A half circle over the top from west to east, going up from both ends.
    const arc = network.addSection(
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 5),
      },
      TEST_ROAD_PROFILE,
    );

    expectDirection(
      sectionDirectionLeavingNode(network, arc, arc.from),
      vec(0, 1),
    );
    expectDirection(
      sectionDirectionLeavingNode(network, arc, arc.to),
      vec(0, 1),
    );
  });

  it("throws for a section that does not meet the node", () => {
    const network = new RoadNetwork();
    const section = addStraight(network, vec(0, 0), vec(10, 0));
    const elsewhere = addStraight(network, vec(20, 0), vec(30, 0));

    expect(() =>
      sectionDirectionLeavingNode(network, section, elsewhere.from),
    ).toThrow();
  });
});

describe("sectionRadius", () => {
  it("measures the circle an arc bends on", () => {
    const network = new RoadNetwork();

    // The half circle of radius 10 over the top of (0,0)-(20,0).
    const arc = network.addSection(
      vec(0, 0),
      vec(20, 0),
      {
        kind: "arc",
        via: vec(10, 10),
      },
      TEST_ROAD_PROFILE,
    );

    expect(sectionRadius(network, arc)).toBeCloseTo(10);
  });

  it("gives a straight none", () => {
    const network = new RoadNetwork();

    const straight = addStraight(network, vec(0, 0), vec(20, 0));

    expect(sectionRadius(network, straight)).toBeNull();
  });
});
