import { assert, describe, expect, it } from "vitest";
import { speculateLayout } from "./speculation";
import { planSection } from "../network/edits";
import { RoadNetwork } from "../network/RoadNetwork";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import type { NodeId } from "../network/types";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

describe("speculateLayout", () => {
  it("tells the planned road apart from the pieces of what it cuts", () => {
    const network = new RoadNetwork();
    network.addSection(vec(0, -50), vec(0, 50), STRAIGHT);
    const plan = planSection(network, vec(-50, 0), vec(50, 0), STRAIGHT);
    assert(plan.buildable);

    const speculation = speculateLayout(network, plan);
    const { speculativeNetwork } = speculation;
    const place = (id: NodeId): string => {
      const { x, z } = speculativeNetwork.getNode(id).position;
      return `${x},${z}`;
    };

    // Both halves of the new road, and neither half of the road it cuts.
    expect(speculation.changedSections.size).toBe(4);
    const roadEnds = Array.from(speculation.plannedRoadSections, (id) => {
      const section = speculativeNetwork.getSection(id);
      return [place(section.from), place(section.to)].sort().join(" ");
    }).sort();
    expect(roadEnds).toEqual(["-50,0 0,0", "0,0 50,0"]);

    // Its three points; the far ends of the cut road are changed, not planned.
    expect(speculation.changedNodes.size).toBe(5);
    expect(Array.from(speculation.plannedRoadNodes, place).sort()).toEqual([
      "-50,0",
      "0,0",
      "50,0",
    ]);
  });
});
