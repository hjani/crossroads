import { assert, describe, expect, it } from "vitest";
import { speculateLayout } from "./speculation";
import { planSection } from "../network/edits";
import { RoadNetwork } from "../network/RoadNetwork";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import type { NodeId } from "../network/types";
import { TEST_ROAD_WIDTH_METERS } from "../testSupport";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

describe("speculateLayout", () => {
  it("tells the planned road apart from the pieces of what it cuts", () => {
    const network = new RoadNetwork();
    network.addSection(
      vec(0, -50),
      vec(0, 50),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    const plan = planSection(
      network,
      vec(-50, 0),
      vec(50, 0),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    assert(plan.buildable);

    const speculation = speculateLayout(network, plan);
    const { speculativeNetwork } = speculation;
    const place = (id: NodeId): string => {
      const { x, z } = speculativeNetwork.getNode(id).position;
      return `${x},${z}`;
    };

    // Both halves of the new road, start to end, and neither half of the
    // road it cuts.
    expect(speculation.changedSections.size).toBe(4);
    const roadEnds = speculation.plannedRoadSections.map((id) => {
      const section = speculativeNetwork.getSection(id);
      return `${place(section.from)} ${place(section.to)}`;
    });
    expect(roadEnds).toEqual(["-50,0 0,0", "0,0 50,0"]);

    // Its three points, start to end; the far ends of the cut road are
    // changed, not planned.
    expect(speculation.changedNodes.size).toBe(5);
    expect(speculation.plannedRoadNodes.map(place)).toEqual([
      "-50,0",
      "0,0",
      "50,0",
    ]);
  });

  it("removes the section a road crosses", () => {
    const network = new RoadNetwork();
    const crossed = network.addSection(
      vec(0, -50),
      vec(0, 50),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    const plan = planSection(
      network,
      vec(-50, 0),
      vec(50, 0),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    assert(plan.buildable);

    const { removedSections } = speculateLayout(network, plan);

    expect([...removedSections]).toEqual([crossed.id]);
  });

  it("removes nothing where a road starts at another's end", () => {
    const network = new RoadNetwork();
    const existing = network.addSection(
      vec(0, -50),
      vec(0, 50),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    const plan = planSection(
      network,
      existing.to,
      vec(50, 50),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    assert(plan.buildable);

    const { removedSections } = speculateLayout(network, plan);

    expect(removedSections.size).toBe(0);
  });

  it("removes nothing where a road meets no other", () => {
    const network = new RoadNetwork();
    network.addSection(
      vec(0, -50),
      vec(0, 50),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    const plan = planSection(
      network,
      vec(100, 0),
      vec(200, 0),
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    assert(plan.buildable);

    const { removedSections } = speculateLayout(network, plan);

    expect(removedSections.size).toBe(0);
  });
});
