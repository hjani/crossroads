import { describe, expect, it } from "vitest";
import { RoadLayout } from "./RoadLayout";
import { RoadNetwork } from "../network/RoadNetwork";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

describe("RoadLayout", () => {
  it("gives back the junction it worked out before", () => {
    const network = new RoadNetwork();
    const road = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT);
    network.addSection(road.from, vec(0, 20), STRAIGHT);
    const layout = new RoadLayout(network);

    expect(layout.junctionAt(road.from)).toBe(layout.junctionAt(road.from));
    expect(layout.roadwayAlong(road.id)).toBe(layout.roadwayAlong(road.id));
  });

  it("works a junction out again once the network has changed", () => {
    const network = new RoadNetwork();
    const road = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT);
    const layout = new RoadLayout(network);
    const before = layout.junctionAt(road.from);

    // A right-angle bend at the start, where the road ended alone before.
    network.addSection(road.from, vec(0, 20), STRAIGHT);

    const after = layout.junctionAt(road.from);
    expect(after).not.toBe(before);
    expect(before.setbackOf(road.id)).toBe(0);
    expect(after.setbackOf(road.id)).toBeCloseTo(4);
  });

  it("cuts a roadway back by the junctions at its two ends", () => {
    const network = new RoadNetwork();
    const road = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT);
    // A right-angle bend at the start, a 60° gap at the end.
    network.addSection(road.from, vec(0, 20), STRAIGHT);
    network.addSection(road.to, vec(10, 10 * Math.sqrt(3)), STRAIGHT);
    const layout = new RoadLayout(network);

    const roadway = layout.roadwayAlong(road.id);

    const start = layout.junctionAt(road.from).setbackOf(road.id);
    const end = layout.junctionAt(road.to).setbackOf(road.id);
    expect(roadway.from.x).toBeCloseTo(start);
    expect(roadway.to.x).toBeCloseTo(20 - end);
  });

  it("throws for a node or section the network no longer has", () => {
    const network = new RoadNetwork();
    const road = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT);
    const layout = new RoadLayout(network);
    network.removeSection(road.id);

    expect(() => layout.junctionAt(road.from)).toThrow();
    expect(() => layout.roadwayAlong(road.id)).toThrow();
  });
});
