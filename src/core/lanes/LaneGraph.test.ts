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

  it("connects a node's lanes running in to those running out", () => {
    // A T: west and east one straight road, the stem leaving toward +z,
    // right of the way in from the west.
    const network = new RoadNetwork();
    const west = addStraight(network, vec(-20, 0), vec(0, 0));
    const east = addStraight(network, west.to, vec(20, 0));
    const stem = addStraight(network, west.to, vec(0, 20));
    const graph = new LaneGraph(network, new RoadLayout(network));

    const connections = graph
      .connectionsAt(west.to)
      .map((c) => [c.incoming.id, c.outgoing.id, c.turn]);

    expect(connections).toHaveLength(9);
    expect(connections).toContainEqual([
      { section: west.id, index: 1 },
      { section: east.id, index: 1 },
      "straight",
    ]);
    expect(connections).toContainEqual([
      { section: east.id, index: -1 },
      { section: west.id, index: -1 },
      "straight",
    ]);
    expect(connections).toContainEqual([
      { section: west.id, index: 1 },
      { section: stem.id, index: 1 },
      "right",
    ]);
    expect(connections).toContainEqual([
      { section: stem.id, index: -1 },
      { section: stem.id, index: 1 },
      "uTurn",
    ]);
  });

  it("gives back the connections it worked out before", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const graph = new LaneGraph(network, new RoadLayout(network));

    expect(graph.connectionsAt(road.to)).toBe(graph.connectionsAt(road.to));
  });

  it("works a node's connections out again once the network has changed", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const graph = new LaneGraph(network, new RoadLayout(network));
    const before = graph.connectionsAt(road.to);

    addStraight(network, road.to, vec(40, 0));

    expect(before).toHaveLength(1);
    expect(graph.connectionsAt(road.to)).toHaveLength(4);
  });

  it("gives every node's connections", () => {
    // Two dead ends, a U-turn at each.
    const network = new RoadNetwork();
    addStraight(network, vec(0, 0), vec(20, 0));
    const graph = new LaneGraph(network, new RoadLayout(network));

    const all = graph.allConnections();
    expect(all.map((c) => c.turn)).toEqual(["uTurn", "uTurn"]);
  });

  it("throws for a node the network no longer has", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const graph = new LaneGraph(network, new RoadLayout(network));
    network.removeSection(road.id);

    expect(() => graph.connectionsAt(road.from)).toThrow();
  });
});
