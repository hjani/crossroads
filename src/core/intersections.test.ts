import { assert, describe, expect, it } from "vitest";
import {
  applySectionPlan,
  planSection,
  type BuildableSectionPlan,
} from "./edits";
import { segmentCrossing } from "./geometry";
import { positionOf } from "./queries";
import type { Endpoint } from "./RoadNetwork";
import { RoadNetwork } from "./RoadNetwork";
import type { NodeId, Vec2 } from "./types";

function at(x: number, z: number): Vec2 {
  return { x, z };
}

/**
 * Plans a section and builds it if it can be, as a tool does, and gives
 * back the node at its far end. Null where the plan was refused.
 */
function build(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
): NodeId | null {
  const plan = planSection(network, from, to);
  return plan.buildable ? applySectionPlan(network, plan) : null;
}

/** Where a plan would cut a section in two, in the order it meets them. */
function cutPoints(network: RoadNetwork, plan: BuildableSectionPlan): Vec2[] {
  return plan.points
    .filter((point) => point.cuts.length > 0)
    .map((point) => positionOf(network, point.at));
}

/**
 * The network as sections between positions, sorted, so a layout can be
 * asserted whole without naming ids the edit is free to choose.
 */
function layout(network: RoadNetwork): string[] {
  return [...network.allSections()]
    .map((section) => {
      const from = network.getNode(section.from)?.position;
      const to = network.getNode(section.to)?.position;
      return `(${from?.x},${from?.z})-(${to?.x},${to?.z})`;
    })
    .sort();
}

function nodeCount(network: RoadNetwork): number {
  return [...network.allNodes()].length;
}

describe("segmentCrossing", () => {
  it("finds where two segments meet", () => {
    const crossing = segmentCrossing(at(0, 0), at(10, 0), at(5, -5), at(5, 5));
    expect(crossing).toEqual({ point: at(5, 0), alongA: 0.5, alongB: 0.5 });
  });

  it("reports a touch at an endpoint as a crossing", () => {
    const crossing = segmentCrossing(at(0, 0), at(10, 0), at(10, 0), at(10, 5));
    expect(crossing?.point).toEqual(at(10, 0));
    expect(crossing?.alongA).toBe(1);
  });

  it("has nothing to report for parallel segments", () => {
    expect(segmentCrossing(at(0, 0), at(10, 0), at(0, 1), at(10, 1))).toBeNull();
  });

  it("has nothing to report for collinear segments, overlapping or not", () => {
    expect(segmentCrossing(at(0, 0), at(10, 0), at(5, 0), at(15, 0))).toBeNull();
    expect(segmentCrossing(at(0, 0), at(10, 0), at(20, 0), at(30, 0))).toBeNull();
  });

  it("has nothing to report where the lines meet past the end of a segment", () => {
    expect(segmentCrossing(at(0, 0), at(4, 0), at(5, -5), at(5, 5))).toBeNull();
  });
});

describe("planning and building a section", () => {
  it("leaves a section that crosses nothing alone", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));

    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
  });

  it("splits both roads where they cross", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    build(network, at(5, -5), at(5, 5));

    expect(layout(network)).toEqual([
      "(0,0)-(5,0)",
      "(5,-5)-(5,0)",
      "(5,0)-(10,0)",
      "(5,0)-(5,5)",
    ]);
    expect(nodeCount(network)).toBe(5);
  });

  it("returns the node at the far end, wherever the section was cut", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    const far = build(network, at(5, -5), at(5, 5));

    expect(far).not.toBeNull();
    expect(positionOf(network, far!)).toEqual(at(5, 5));
  });

  it("splits the road a new one ends on, without leaving a node beside it", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    build(network, at(5, -5), at(5, 0));

    expect(layout(network)).toEqual([
      "(0,0)-(5,0)",
      "(5,-5)-(5,0)",
      "(5,0)-(10,0)",
    ]);
    expect(nodeCount(network)).toBe(4);
  });

  it("splits nothing along a run of roads drawn end to end", () => {
    const network = new RoadNetwork();
    const corner = build(network, at(0, 0), at(5, 0));
    const far = build(network, corner!, at(5, 5));
    build(network, far!, at(0, 5));

    expect(layout(network)).toEqual([
      "(0,0)-(5,0)",
      "(5,0)-(5,5)",
      "(5,5)-(0,5)",
    ]);
    expect(nodeCount(network)).toBe(4);
  });

  it("reuses the node a road runs exactly through", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    build(network, at(5, 0), at(5, 5));
    build(network, at(5, -5), at(5, 0));

    expect(layout(network)).toEqual([
      "(0,0)-(5,0)",
      "(5,-5)-(5,0)",
      "(5,0)-(10,0)",
      "(5,0)-(5,5)",
    ]);
    expect(nodeCount(network)).toBe(5);
  });

  it("chains the pieces of a section that crosses several roads", () => {
    const network = new RoadNetwork();
    build(network, at(2, -2), at(2, 2));
    build(network, at(6, -2), at(6, 2));
    build(network, at(0, 0), at(8, 0));

    expect(layout(network)).toEqual([
      "(0,0)-(2,0)",
      "(2,-2)-(2,0)",
      "(2,0)-(2,2)",
      "(2,0)-(6,0)",
      "(6,-2)-(6,0)",
      "(6,0)-(6,2)",
      "(6,0)-(8,0)",
    ]);
  });

  it("makes one junction of two roads crossed within a centimeter", () => {
    const network = new RoadNetwork();
    build(network, at(5, -2), at(5, 2));
    build(network, at(5.005, -2), at(5.005, 2));

    // Half a centimeter apart, which is the same place: the two crossings
    // are one point of the chain, and it cuts both roads.
    const plan = planSection(network, at(0, 0), at(10, 0));
    assert(plan.buildable);
    expect(cutPoints(network, plan)).toEqual([at(5, 0)]);

    applySectionPlan(network, plan);

    // The second road is cut at the node the first one left, so it comes
    // away with a 5 mm kink in it. One junction is worth more than two
    // nodes beside each other.
    expect(layout(network)).toEqual([
      "(0,0)-(5,0)",
      "(5,-2)-(5,0)",
      "(5,0)-(10,0)",
      "(5,0)-(5,2)",
      "(5,0)-(5.005,2)",
      "(5.005,-2)-(5,0)",
    ]);
    expect(nodeCount(network)).toBe(7);
  });

  it("says where the junctions would go, without putting them there", () => {
    const network = new RoadNetwork();
    build(network, at(2, -2), at(2, 2));
    build(network, at(6, -2), at(6, 2));
    const before = layout(network);

    const plan = planSection(network, at(0, 0), at(8, 0));
    assert(plan.buildable);

    expect(cutPoints(network, plan)).toEqual([at(2, 0), at(6, 0)]);
    expect(layout(network)).toEqual(before);
  });

  it("refuses a section too short to be a road, crossing or not", () => {
    const network = new RoadNetwork();

    expect(planSection(network, at(0, 0), at(0.4, 0)).buildable).toBe(false);
    expect(layout(network)).toEqual([]);
  });

  it("refuses a crossing that lands just off an existing node", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    build(network, at(5, -5), at(5, 5));
    const before = layout(network);

    // Parallel to the first road and 40 cm from it, so it crosses the second
    // one just short of the junction the two already share.
    const plan = planSection(network, at(0, 0.4), at(10, 0.4));

    expect(plan.buildable).toBe(false);
    expect(layout(network)).toEqual(before);
    expect(nodeCount(network)).toBe(5);
  });

  it("refuses a crossing that would leave a stub of a section behind", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    const before = layout(network);

    // Ends 40 cm past the road it crosses: too short a piece to be a road,
    // and too far from its end to be the same place.
    const plan = planSection(network, at(5, -5), at(5, 0.4));

    expect(plan.buildable).toBe(false);
    expect(layout(network)).toEqual(before);
  });
});
