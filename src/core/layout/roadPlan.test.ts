import { assert, describe, expect, it } from "vitest";
import { changedOrViolatingParts, planRoad, type RoadPlan } from "./roadPlan";
import { RoadLayout } from "./RoadLayout";
import { STRAIGHT } from "../geometry/lineGeometry";
import { RoadNetwork } from "../network/RoadNetwork";
import { TEST_ROAD_WIDTH_METERS } from "../testSupport";

/**
 * Plans a lone arc turning ¾ of the way round a circle of radius `r` about
 * the origin: 3πr/2 long, enough for the roadway length limit from 9 m up.
 */
function planArcOfRadius(r: number): RoadPlan {
  const network = new RoadNetwork();
  return planRoad(
    network,
    new RoadLayout(network),
    { x: r, z: 0 },
    { x: 0, z: -r },
    { kind: "arc", via: { x: -r, z: 0 } },
    TEST_ROAD_WIDTH_METERS,
  );
}

describe("planRoad", () => {
  it("refuses an arc too tight for any roadway before speculating", () => {
    // w/2 = 4 m: no inner edge at all.
    const plan = planArcOfRadius(4);

    expect(plan.buildable).toBe(false);
    expect(plan.speculation).toBeNull();
  });

  it("refuses an arc under the practical radius on its speculation", () => {
    const plan = planArcOfRadius(9);

    expect(plan.buildable).toBe(false);
    expect(plan.speculation).not.toBeNull();
    expect(planArcOfRadius(10).buildable).toBe(true);
  });
});

describe("changedOrViolatingParts", () => {
  it("includes an unchanged junction the plan violates", () => {
    // A dead end at the origin, and a new road starting 7.9 m west of it:
    // two junction circles of w/2 = 4 m that overlap.
    const network = new RoadNetwork();
    const existing = network.addSection(
      { x: 0, z: 0 },
      { x: 40, z: 0 },
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    const plan = planRoad(
      network,
      new RoadLayout(network),
      { x: -7.9, z: 0 },
      { x: -7.9, z: -40 },
      STRAIGHT,
      TEST_ROAD_WIDTH_METERS,
    );
    assert(plan.speculation !== null);

    // Not changed by the edit, only in violation.
    expect(plan.speculation.changedNodes.has(existing.from)).toBe(false);
    expect(changedOrViolatingParts(plan).nodes.has(existing.from)).toBe(true);
  });

  it("has nothing without a speculation", () => {
    const parts = changedOrViolatingParts(planArcOfRadius(4));

    expect(parts.nodes.size).toBe(0);
    expect(parts.sections.size).toBe(0);
  });
});
