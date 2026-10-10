import { assert, describe, expect, it } from "vitest";
import { RoadLayout } from "./RoadLayout";
import { RoadNetwork } from "../network/RoadNetwork";
import { applySectionPlan, planSection } from "../network/edits";
import { biarcBetween } from "../geometry/biarc";
import { lineDirectionAt, STRAIGHT } from "../geometry/lineGeometry";
import { distance, type Vec2 } from "../geometry/point";
import { addStraight, TEST_ROAD_PROFILE } from "../testSupport";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

describe("RoadLayout", () => {
  it("gives back the junction it worked out before", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    addStraight(network, road.from, vec(0, 20));
    const layout = new RoadLayout(network);

    expect(layout.junctionAt(road.from)).toBe(layout.junctionAt(road.from));
    expect(layout.roadwayAlong(road.id)).toBe(layout.roadwayAlong(road.id));
  });

  it("works a junction out again once the network has changed", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const layout = new RoadLayout(network);
    const before = layout.junctionAt(road.from);

    // A right-angle bend at the start, where the road ended alone before.
    addStraight(network, road.from, vec(0, 20));

    const after = layout.junctionAt(road.from);
    expect(after).not.toBe(before);
    expect(before.setbackOf(road.id)).toBe(0);
    expect(after.setbackOf(road.id)).toBeCloseTo(4);
  });

  it("cuts a roadway back by the junctions at its two ends", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    // A right-angle bend at the start, a 60° gap at the end.
    addStraight(network, road.from, vec(0, 20));
    addStraight(network, road.to, vec(10, 10 * Math.sqrt(3)));
    const layout = new RoadLayout(network);

    const { outline } = layout.roadwayAlong(road.id);

    const start = layout.junctionAt(road.from).setbackOf(road.id);
    const end = layout.junctionAt(road.to).setbackOf(road.id);
    expect(outline.from.x).toBeCloseTo(start);
    expect(outline.to.x).toBeCloseTo(20 - end);
  });

  it("starts a biarc's roadway where its junction opens, set back past its join", () => {
    // The C of `main.ts`, crossed 3 m before its join: the setback there runs
    // past the join, onto the second piece.
    const network = new RoadNetwork();
    const biarc = biarcBetween(vec(0, 0), vec(1, 0), vec(60, 40), vec(0, 1));
    assert(biarc !== null);
    network.addSection(
      vec(0, 0),
      vec(60, 40),
      { kind: "biarc", biarc },
      TEST_ROAD_PROFILE,
    );
    const plan = planSection(
      network,
      vec(16, 30),
      vec(76, -30),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    assert(plan.buildable);
    applySectionPlan(network, plan);
    const cut = [...network.allSections()].find(
      (section) => section.centerlineGeometry.kind === "biarc",
    );
    assert(cut !== undefined);
    const layout = new RoadLayout(network);

    const { outline } = layout.roadwayAlong(cut.id);
    // What is left of the road past its setback: the second piece alone.
    expect(outline.centerlineGeometry.kind).toBe("arc");

    const opening = layout
      .junctionAt(cut.from)
      .outline()
      .pieces.map((piece) => piece.point);
    const heading = lineDirectionAt(
      outline.from,
      outline.to,
      outline.centerlineGeometry,
      0,
    );
    const halfWidth = TEST_ROAD_PROFILE.width / 2;
    for (const side of [1, -1]) {
      const corner = {
        x: outline.from.x - side * halfWidth * heading.z,
        z: outline.from.z + side * halfWidth * heading.x,
      };
      const nearest = Math.min(
        ...opening.map((point) => distance(point, corner)),
      );
      expect(nearest).toBeCloseTo(0, 4);
    }
  });

  it("throws for a node or section the network no longer has", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const layout = new RoadLayout(network);
    network.removeSection(road.id);

    expect(() => layout.junctionAt(road.from)).toThrow();
    expect(() => layout.roadwayAlong(road.id)).toThrow();
  });
});
