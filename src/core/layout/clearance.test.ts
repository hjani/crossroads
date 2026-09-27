import { assert, describe, expect, it } from "vitest";
import { verifyClearance, type ClearanceViolations } from "./clearance";
import { RoadLayout } from "./RoadLayout";
import { speculateLayout } from "./speculation";
import {
  applySectionPlan,
  planSection,
  type BuildableSectionPlan,
  type SectionPlan,
} from "../network/edits";
import { RoadNetwork } from "../network/RoadNetwork";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import type { NodeId } from "../network/types";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

/** The parts a plan violates, against the network's own layout. */
function violationsOf(
  network: RoadNetwork,
  plan: BuildableSectionPlan,
): ClearanceViolations {
  const speculation = speculateLayout(network, plan);
  return verifyClearance(speculation, new RoadLayout(network));
}

/** Whether a plan clears, against the network's own layout. */
function check(network: RoadNetwork, plan: BuildableSectionPlan): boolean {
  const { violatingNodes, violatingSections } = violationsOf(network, plan);
  return violatingNodes.size === 0 && violatingSections.size === 0;
}

/** Whether a plan would be built: the network, then clearance. */
function isBuildable(network: RoadNetwork, plan: SectionPlan): boolean {
  return plan.buildable && check(network, plan);
}

/** Plans, checks and builds a straight section. */
function build(network: RoadNetwork, from: Vec2, to: Vec2): void {
  const plan = planSection(network, from, to, STRAIGHT);
  assert(plan.buildable);
  assert(check(network, plan));
  applySectionPlan(network, plan);
}

/** Whether a straight section from `from` to `to` would be refused. */
function isRefused(network: RoadNetwork, from: Vec2, to: Vec2): boolean {
  return !isBuildable(network, planSection(network, from, to, STRAIGHT));
}

/** Two parallel roads running north, `apart` meters apart. */
function twoRoads(apart: number): RoadNetwork {
  const network = new RoadNetwork();
  network.addSection(vec(0, -50), vec(0, 50), STRAIGHT);
  network.addSection(vec(apart, -50), vec(apart, 50), STRAIGHT);
  return network;
}

describe("verifyClearance", () => {
  it("passes a plan with room for every setback", () => {
    const network = twoRoads(50);
    const plan = planSection(network, vec(-50, 0), vec(100, 0), STRAIGHT);
    assert(plan.buildable);

    expect(check(network, plan)).toBe(true);
  });

  it("refuses a roadway shorter than the practical limit", () => {
    // Both crossings are square, so each sets the piece between them back
    // by w/2 = 4 m: 37 m apart leaves a 29 m roadway, 39 m apart 31 m.
    expect(isRefused(twoRoads(37), vec(-50, 0), vec(87, 0))).toBe(true);
    expect(isRefused(twoRoads(39), vec(-50, 0), vec(89, 0))).toBe(false);
  });

  it("refuses a plan that leaves an existing section too short", () => {
    // A 36 m road with a right-angle bend at its far end, taking 4 m of it,
    // and ending alone at the near one. A road leaving that end north makes
    // a second bend, taking 4 m more: a 28 m roadway.
    const network = new RoadNetwork();
    const short = network.addSection(vec(0, 0), vec(36, 0), STRAIGHT);
    network.addSection(short.to, vec(36, 50), STRAIGHT);
    const plan = planSection(network, short.from, vec(0, 50), STRAIGHT);
    assert(plan.buildable);

    expect(check(network, plan)).toBe(false);
  });

  it("lets two junctions just touch", () => {
    // Two dead ends 8 m apart, each covered by a circle of w/2 = 4 m.
    const network = new RoadNetwork();
    network.addSection(vec(0, 0), vec(40, 0), STRAIGHT);
    const plan = planSection(network, vec(-8, 0), vec(-8, -40), STRAIGHT);
    assert(plan.buildable);

    expect(check(network, plan)).toBe(true);
  });

  it("refuses two junctions whose circles overlap", () => {
    // The same two dead ends, 10 cm closer.
    const network = new RoadNetwork();
    network.addSection(vec(0, 0), vec(40, 0), STRAIGHT);

    expect(isRefused(network, vec(-7.9, 0), vec(-7.9, -40))).toBe(true);
  });

  it("refuses a crossing just off an existing junction", () => {
    const network = new RoadNetwork();
    build(network, vec(-50, 0), vec(50, 0));
    build(network, vec(0, -50), vec(0, 50));

    // 40 cm north of the first road, so it cuts a 40 cm piece off the
    // second one, between two square junctions.
    expect(isRefused(network, vec(-50, 0.4), vec(50, 0.4))).toBe(true);
  });

  it("refuses a stub left past the road it crosses", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(60, 0));

    expect(isRefused(network, vec(30, -40), vec(30, 0.4))).toBe(true);
  });

  it("refuses a start or an end on a road just short of its node", () => {
    // The cut leaves 50 cm of the road between the new junction and its end.
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(60, 0));

    expect(isRefused(network, vec(59.5, 0.005), vec(59.5, 40))).toBe(true);
    expect(isRefused(network, vec(59.5, 40), vec(59.5, 0.005))).toBe(true);
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

    expect(isRefused(network, vec(0, -50), vec(0, -7))).toBe(true);
    expect(isRefused(network, vec(0, -50), vec(0, -8))).toBe(false);
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

    expect(check(network, plan)).toBe(false);
  });

  it("refuses an arc roadway bulging into a straight one", () => {
    // Every junction is 20 m or more from the other road; only the bulge
    // comes near, to 7 m of the straight's middle, and w = 8 m.
    const network = new RoadNetwork();
    network.addSection(vec(-50, 0), vec(50, 0), STRAIGHT);
    const planBulgingTo = (z: number): SectionPlan =>
      planSection(network, vec(-30, -20), vec(30, -20), {
        kind: "arc",
        via: vec(0, z),
      });

    expect(isBuildable(network, planBulgingTo(-7))).toBe(false);
    expect(isBuildable(network, planBulgingTo(-8.5))).toBe(true);
  });

  it("refuses two arc roadways bulging into each other", () => {
    // The same, with the straight bent down to z = 7 in the middle: the
    // bulges face each other, 7 m apart at z = 0 and 8.5 m at z = −1.5.
    const network = new RoadNetwork();
    network.addSection(vec(-30, 20), vec(30, 20), {
      kind: "arc",
      via: vec(0, 7),
    });
    const planBulgingTo = (z: number): SectionPlan =>
      planSection(network, vec(-30, -20), vec(30, -20), {
        kind: "arc",
        via: vec(0, z),
      });

    expect(isBuildable(network, planBulgingTo(0))).toBe(false);
    expect(isBuildable(network, planBulgingTo(-1.5))).toBe(true);
  });

  it("refuses a junction wider than the practical limit", () => {
    // A road leaving the end of another at ψ to it: the inside corner is
    // (w/2)/sin(ψ/2) from the node, 30.6 m at 15° and 18.5 m at 25°.
    const network = new RoadNetwork();
    network.addSection(vec(0, 0), vec(100, 0), STRAIGHT);
    const leavingAt = (degrees: number): Vec2 => {
      const angle = (degrees * Math.PI) / 180;
      return vec(100 * Math.cos(angle), 100 * Math.sin(angle));
    };

    expect(isRefused(network, vec(0, 0), leavingAt(15))).toBe(true);
    expect(isRefused(network, vec(0, 0), leavingAt(25))).toBe(false);
  });

  it("leaves the real network as it was, and its plan still applicable", () => {
    const network = twoRoads(20);
    const version = network.version;
    const plan = planSection(network, vec(-20, 0), vec(40, 0), STRAIGHT);
    assert(plan.buildable);

    check(network, plan);

    expect(network.version).toBe(version);
    expect([...network.allSections()]).toHaveLength(2);
    expect(() => applySectionPlan(network, plan)).not.toThrow();
  });
});

/**
 * Where the parts a plan violates lie, to the centimeter: a node as `x,z`,
 * a section as its two ends in sorted order. Both lists sorted.
 */
function violatingPlaces(
  network: RoadNetwork,
  plan: BuildableSectionPlan,
): { nodes: string[]; sections: string[] } {
  const speculation = speculateLayout(network, plan);
  const { violatingNodes, violatingSections } = verifyClearance(
    speculation,
    new RoadLayout(network),
  );
  const { speculativeNetwork } = speculation;
  const round = (v: number): number => Math.round(v * 100) / 100;
  const place = (id: NodeId): string => {
    const { x, z } = speculativeNetwork.getNode(id).position;
    return `${round(x)},${round(z)}`;
  };
  const nodes = Array.from(violatingNodes, place).sort();
  const sections = Array.from(violatingSections, (id) => {
    const section = speculativeNetwork.getSection(id);
    return [place(section.from), place(section.to)].sort().join(" ");
  }).sort();
  return { nodes, sections };
}

describe("verifyClearance's violating parts", () => {
  it("names only the piece too short", () => {
    const network = twoRoads(37);
    const plan = planSection(network, vec(-50, 0), vec(87, 0), STRAIGHT);
    assert(plan.buildable);

    expect(violatingPlaces(network, plan)).toEqual({
      nodes: [],
      sections: ["0,0 37,0"],
    });
  });

  it("names an existing junction a new roadway runs into", () => {
    // 6 m from the dead end, w = 8 m: the new roadway runs into its junction,
    // and into the existing roadway too — but once named, the new roadway
    // leaves the roadway ↔ roadway rule, so the existing one isn't.
    const network = new RoadNetwork();
    network.addSection(vec(-20, 0), vec(0, 0), STRAIGHT);
    const plan = planSection(network, vec(6, -20), vec(6, 20), STRAIGHT);
    assert(plan.buildable);

    expect(violatingPlaces(network, plan)).toEqual({
      nodes: ["0,0"],
      sections: ["6,-20 6,20"],
    });
  });

  it("doesn't name the legs of a junction the road crosses beside", () => {
    // A narrow V with its corner at 0,0, and a road cutting both legs 5 m
    // out: the new junctions overlap the corner's. Cut, the outer pieces of
    // the legs no longer share a node, and run within w of each other past
    // the new junctions — but that is the junctions' doing.
    const network = new RoadNetwork();
    const left = network.addSection(vec(-20, 80), vec(0, 0), STRAIGHT);
    network.addSection(left.to, vec(20, 80), STRAIGHT);
    const plan = planSection(network, vec(-60, 5), vec(60, 5), STRAIGHT);
    assert(plan.buildable);

    expect(violatingPlaces(network, plan)).toEqual({
      nodes: ["-1.25,5", "0,0", "1.25,5"],
      sections: ["-1.25,5 0,0", "-1.25,5 1.25,5", "0,0 1.25,5"],
    });
  });

  it("names both roadways where an arc bulges into a straight", () => {
    const network = new RoadNetwork();
    network.addSection(vec(-50, 0), vec(50, 0), STRAIGHT);
    const plan = planSection(network, vec(-30, -20), vec(30, -20), {
      kind: "arc",
      via: vec(0, -7),
    });
    assert(plan.buildable);

    expect(violatingPlaces(network, plan)).toEqual({
      nodes: [],
      sections: ["-30,-20 30,-20", "-50,0 50,0"],
    });
  });

  it("names the parts of every broken rule, not just the first", () => {
    // The piece between the two roads is too short, as above, and the far
    // end stops 6 m from a dead end: two junction circles of w/2 = 4 m.
    const network = twoRoads(37);
    network.addSection(vec(100, 6), vec(100, 40), STRAIGHT);
    const plan = planSection(network, vec(-50, 0), vec(100, 0), STRAIGHT);
    assert(plan.buildable);

    const { nodes, sections } = violatingPlaces(network, plan);
    expect(sections).toContain("0,0 37,0");
    expect(nodes).toContain("100,0");
    expect(nodes).toContain("100,6");
  });
});
