import { assert, describe, expect, it } from "vitest";
import { verifyClearance } from "./clearance";
import { RoadLayout } from "./RoadLayout";
import {
  applySectionPlan,
  planSection,
  type SectionPlan,
} from "../network/edits";
import { RoadNetwork } from "../network/RoadNetwork";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

/** Clears a plan against the network's own layout, as a tool does. */
function clear(network: RoadNetwork, plan: SectionPlan): SectionPlan {
  return verifyClearance(network, new RoadLayout(network), plan);
}

/** Plans, clears and builds a straight section, as a tool does. */
function build(network: RoadNetwork, from: Vec2, to: Vec2): void {
  const plan = clear(network, planSection(network, from, to, STRAIGHT));
  assert(plan.buildable);
  applySectionPlan(network, plan);
}

/** Whether a straight section from `from` to `to` would be refused. */
function isRefused(network: RoadNetwork, from: Vec2, to: Vec2): boolean {
  return !clear(network, planSection(network, from, to, STRAIGHT)).buildable;
}

/** Two parallel roads running north, `apart` meters apart. */
function twoRoads(apart: number): RoadNetwork {
  const network = new RoadNetwork();
  network.addSection(vec(0, -20), vec(0, 20), STRAIGHT);
  network.addSection(vec(apart, -20), vec(apart, 20), STRAIGHT);
  return network;
}

describe("verifyClearance", () => {
  it("passes a plan with room for every setback as it is", () => {
    const network = twoRoads(20);
    const plan = planSection(network, vec(-20, 0), vec(40, 0), STRAIGHT);
    assert(plan.buildable);

    expect(clear(network, plan)).toBe(plan);
  });

  it("refuses a piece too short for the setbacks at its two ends", () => {
    // Both crossings are square, so each sets the 2 m piece between them
    // back by w/2 = 4 m: more than half of it.
    const network = twoRoads(2);
    const plan = planSection(network, vec(-20, 0), vec(20, 0), STRAIGHT);
    assert(plan.buildable);

    const cleared = clear(network, plan);

    expect(cleared.buildable).toBe(false);
    expect(cleared.pieces).toEqual(plan.pieces);
  });

  it("refuses a plan that leaves an existing section too short", () => {
    // A 6 m road with a right-angle bend at its far end, taking 4 m of it,
    // and ending alone at the near one. A road leaving that end north makes
    // a second bend, wanting 4 m more: 8 m of setbacks on 6 m of road.
    const network = new RoadNetwork();
    const short = network.addSection(vec(0, 0), vec(6, 0), STRAIGHT);
    network.addSection(short.to, vec(6, 20), STRAIGHT);
    const plan = planSection(network, short.from, vec(0, 20), STRAIGHT);
    assert(plan.buildable);

    expect(clear(network, plan).buildable).toBe(false);
  });

  it("lets two junctions just touch", () => {
    // Two dead ends 8 m apart, each covered by a circle of w/2 = 4 m.
    const network = new RoadNetwork();
    network.addSection(vec(0, 0), vec(20, 0), STRAIGHT);
    const plan = planSection(network, vec(-8, 0), vec(-8, -20), STRAIGHT);
    assert(plan.buildable);

    expect(clear(network, plan)).toBe(plan);
  });

  it("refuses two junctions whose circles overlap", () => {
    // The same two dead ends, 10 cm closer.
    const network = new RoadNetwork();
    network.addSection(vec(0, 0), vec(20, 0), STRAIGHT);

    expect(isRefused(network, vec(-7.9, 0), vec(-7.9, -20))).toBe(true);
  });

  it("refuses a crossing just off an existing junction", () => {
    const network = new RoadNetwork();
    build(network, vec(-20, 0), vec(20, 0));
    build(network, vec(0, -20), vec(0, 20));

    // 40 cm north of the first road, so it cuts a 40 cm piece off the
    // second one, between two square junctions.
    expect(isRefused(network, vec(-20, 0.4), vec(20, 0.4))).toBe(true);
  });

  it("refuses a stub left past the road it crosses", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));

    expect(isRefused(network, vec(5, -5), vec(5, 0.4))).toBe(true);
  });

  it("refuses a start or an end on a road just short of its node", () => {
    // The cut leaves 50 cm of the road between the new junction and its end.
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));

    expect(isRefused(network, vec(9.5, 0.005), vec(9.5, 6))).toBe(true);
    expect(isRefused(network, vec(9.5, 6), vec(9.5, 0.005))).toBe(true);
  });

  // A dead end is the junction in the tests below only because its circle
  // is plain: w/2 = 4 m. With the new road's own w/2, 8 m between centers.

  it("refuses a new roadway running into an existing junction", () => {
    const network = new RoadNetwork();
    network.addSection(vec(-20, 0), vec(0, 0), STRAIGHT);

    expect(isRefused(network, vec(6, -20), vec(6, 20))).toBe(true);
    expect(isRefused(network, vec(8, -20), vec(8, 20))).toBe(false);
  });

  it("refuses a new junction running into an existing roadway", () => {
    const network = new RoadNetwork();
    network.addSection(vec(-20, 0), vec(20, 0), STRAIGHT);

    expect(isRefused(network, vec(0, -20), vec(0, -7))).toBe(true);
    expect(isRefused(network, vec(0, -20), vec(0, -8))).toBe(false);
  });

  it("measures an arc roadway by its curve, not its chord", () => {
    // The chord runs 10 m from the junction, the arc bulges to 6 m of it.
    const network = new RoadNetwork();
    network.addSection(vec(-20, 0), vec(0, 0), STRAIGHT);
    const plan = planSection(network, vec(10, -20), vec(10, 20), {
      kind: "arc",
      via: vec(6, 0),
    });
    assert(plan.buildable);

    expect(clear(network, plan).buildable).toBe(false);
  });

  it("hands back a refused plan as it is", () => {
    const network = new RoadNetwork();
    const corner = network.addSection(vec(0, 0), vec(10, 0), STRAIGHT).from;
    const plan = planSection(network, corner, vec(0, 0), STRAIGHT);
    assert(!plan.buildable);

    expect(clear(network, plan)).toBe(plan);
  });

  it("leaves the real network as it was, and its plan still applicable", () => {
    const network = twoRoads(20);
    const version = network.version;
    const plan = planSection(network, vec(-20, 0), vec(40, 0), STRAIGHT);
    assert(plan.buildable);

    clear(network, plan);

    expect(network.version).toBe(version);
    expect([...network.allSections()]).toHaveLength(2);
    expect(() => applySectionPlan(network, plan)).not.toThrow();
  });
});
