import { describe, expect, it } from "vitest";
import type { Vec2 } from "../geometry/point";
import { RoadLayout } from "../layout/RoadLayout";
import { RoadNetwork } from "../network/RoadNetwork";
import { addStraight } from "../testSupport";
import { lanesOf } from "./lane";
import { LaneGraph } from "./LaneGraph";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

describe("LaneGraph", () => {
  it("gives a section's lanes as `lanesOf` gives them for its roadway", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const layout = new RoadLayout(network);
    const graph = new LaneGraph(network, layout);

    expect(graph.lanesAlong(road.id)).toEqual(
      lanesOf(layout.roadwayAlong(road.id)),
    );
  });

  it("gives back the lanes it worked out before", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const graph = new LaneGraph(network, new RoadLayout(network));

    expect(graph.lanesAlong(road.id)).toBe(graph.lanesAlong(road.id));
  });

  it("works a section's lanes out again once the network has changed", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const graph = new LaneGraph(network, new RoadLayout(network));
    const before = graph.lanesAlong(road.id);

    // A right-angle bend at the start, where the road ended alone before:
    // its roadway, and so lane +1, now starts 4 m in.
    addStraight(network, road.from, vec(0, 20));

    const after = graph.lanesAlong(road.id);
    expect(after).not.toBe(before);
    expect(before[0].centerline.from.x).toBeCloseTo(0);
    expect(after[0].centerline.from.x).toBeCloseTo(4);
  });

  it("gives every section's lanes", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const branch = addStraight(network, road.from, vec(0, 20));
    const graph = new LaneGraph(network, new RoadLayout(network));

    const all = graph.allLanes();
    expect(all).toHaveLength(4);
    expect(all).toEqual(
      expect.arrayContaining([
        ...graph.lanesAlong(road.id),
        ...graph.lanesAlong(branch.id),
      ]),
    );
  });

  it("throws for a section the network no longer has", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const graph = new LaneGraph(network, new RoadLayout(network));
    network.removeSection(road.id);

    expect(() => graph.lanesAlong(road.id)).toThrow();
  });
});
