import { assert, describe, expect, it } from "vitest";
import {
  applySectionPlan,
  planSection,
  pointsOf,
  type SectionPlan,
} from "./edits";
import { arcCircle, pointOnArc, type ArcCircle } from "./arcs";
import { distance } from "./points";
import { segmentCrossing } from "./segments";
import { nearestNode, positionOf } from "./queries";
import type { Endpoint } from "./RoadNetwork";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT, type NodeId, type Vec2 } from "./types";

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
  const plan = planSection(network, from, to, STRAIGHT);
  return plan.buildable ? applySectionPlan(network, plan) : null;
}

/** The same, for an arc bending through `via`. */
function buildArc(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
  via: Vec2,
): NodeId | null {
  const plan = planSection(network, from, to, { kind: "arc", via });
  return plan.buildable ? applySectionPlan(network, plan) : null;
}

/** The circle three positions lie on, or a failure saying they do not. */
function circleThrough(from: Vec2, to: Vec2, via: Vec2): ArcCircle {
  const circle = arcCircle(from, to, via);
  if (circle === null) {
    throw new Error("expected a circle through the three positions");
  }
  return circle;
}

/** Every place a plan runs through, in order. */
function chainPoints(network: RoadNetwork, plan: SectionPlan): Vec2[] {
  return pointsOf(plan).map((point) => positionOf(network, point.at));
}

/** Where a plan would cut a section in two, in the order it meets them. */
function cutPoints(network: RoadNetwork, plan: SectionPlan): Vec2[] {
  return pointsOf(plan)
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
    expect(
      segmentCrossing(at(0, 0), at(10, 0), at(0, 1), at(10, 1)),
    ).toBeNull();
  });

  it("has nothing to report for collinear segments, overlapping or not", () => {
    expect(
      segmentCrossing(at(0, 0), at(10, 0), at(5, 0), at(15, 0)),
    ).toBeNull();
    expect(
      segmentCrossing(at(0, 0), at(10, 0), at(20, 0), at(30, 0)),
    ).toBeNull();
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
    build(network, at(5.005, -4), at(5.005, 4));

    // Half a centimeter apart, which is the same place: the two crossings
    // are one point of the chain, and it cuts both roads.
    const plan = planSection(network, at(0, 0), at(10, 0), STRAIGHT);
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
      "(5,0)-(5.005,4)",
      "(5.005,-4)-(5,0)",
    ]);
    expect(nodeCount(network)).toBe(7);
  });

  it("says where the junctions would go, without putting them there", () => {
    const network = new RoadNetwork();
    build(network, at(2, -2), at(2, 2));
    build(network, at(6, -2), at(6, 2));
    const before = layout(network);

    const plan = planSection(network, at(0, 0), at(8, 0), STRAIGHT);
    assert(plan.buildable);

    expect(cutPoints(network, plan)).toEqual([at(2, 0), at(6, 0)]);
    expect(layout(network)).toEqual(before);
  });

  it("refuses a section too short to be a road, crossing or not", () => {
    const network = new RoadNetwork();

    const plan = planSection(network, at(0, 0), at(0.4, 0), STRAIGHT);
    expect(plan.buildable).toBe(false);
    expect(layout(network)).toEqual([]);
  });

  it("refuses a crossing that lands just off an existing node", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    build(network, at(5, -5), at(5, 5));
    const before = layout(network);

    // Parallel to the first road and 40 cm from it, so it crosses the second
    // one just short of the junction the two already share.
    const plan = planSection(network, at(0, 0.4), at(10, 0.4), STRAIGHT);

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
    const plan = planSection(network, at(5, -5), at(5, 0.4), STRAIGHT);

    expect(plan.buildable).toBe(false);
    expect(layout(network)).toEqual(before);
  });

  it("describes the section it refuses, not just that it refused it", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));

    // The stub above, asked about again: a refusal still says where the
    // section was going and what it would have cut on the way, which is
    // what lets a refused edit be drawn as the edit it was.
    const plan = planSection(network, at(5, -5), at(5, 0.4), STRAIGHT);

    expect(chainPoints(network, plan)).toEqual([
      at(5, -5),
      at(5, 0),
      at(5, 0.4),
    ]);
    expect(cutPoints(network, plan)).toEqual([at(5, 0)]);
  });

  it("refuses a section that ends where it started, with nothing to draw", () => {
    const network = new RoadNetwork();
    const corner = build(network, at(0, 0), at(5, 0));
    assert(corner !== null);

    // Both ends in one place, so the chain collapses to a single point:
    // there is no piece of road between them, and nothing a preview could
    // show either. The tool leans on this to tell a click that does
    // nothing from a section it turned down.
    const plan = planSection(network, corner, at(5, 0), STRAIGHT);

    expect(plan.buildable).toBe(false);
    expect(plan.pieces).toHaveLength(0);
  });
});

describe("planning and building an arc", () => {
  it("builds one through the position it was given", () => {
    const network = new RoadNetwork();

    const plan = planSection(network, at(0, 0), at(10, 0), {
      kind: "arc",
      via: at(5, 2),
    });
    assert(plan.buildable);
    applySectionPlan(network, plan);

    const [section] = [...network.allSections()];
    expect(section?.geometry).toEqual({ kind: "arc", via: at(5, 2) });
    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
  });

  it("refuses a third position in line with the ends", () => {
    const network = new RoadNetwork();

    // No circle passes through three positions in a line, so there is no
    // arc to build. Refused rather than thrown: this is where a third
    // position lands on its way across the road.
    const plan = planSection(network, at(0, 0), at(10, 0), {
      kind: "arc",
      via: at(5, 0),
    });

    expect(plan.buildable).toBe(false);
    expect(layout(network)).toEqual([]);
  });

  it("measures an arc along its curve rather than across it", () => {
    const network = new RoadNetwork();

    // Half a meter apart, which is too short for a straight road. The arc
    // between them runs most of the way round a small circle, so as a road
    // it is nearly a meter and a half of one.
    const ends = [at(0, 0), at(0.5, 0)] as const;
    expect(planSection(network, ...ends, STRAIGHT).buildable).toBe(false);

    const curved = planSection(network, ...ends, {
      kind: "arc",
      via: at(0.25, 0.5),
    });
    expect(curved.buildable).toBe(true);
  });

  it("cuts into two arcs rather than two straights", () => {
    const network = new RoadNetwork();
    buildArc(network, at(0, 0), at(10, 0), at(5, 2));

    build(network, at(5, -5), at(5, 5));

    const kinds = [...network.allSections()]
      .map((section) => section.geometry.kind)
      .sort();
    expect(kinds).toEqual(["arc", "arc", "straight", "straight"]);
  });

  it("takes each half's shape off the curve it was cut from", () => {
    const network = new RoadNetwork();
    buildArc(network, at(0, 0), at(10, 0), at(5, 2));
    build(network, at(5, -5), at(5, 5));

    // Each half is fixed by a position halfway along its own stretch of the
    // original, so both of those positions are on the original's circle —
    // which is what makes the two halves follow the road they replaced
    // rather than bending somewhere of their own.
    const circle = circleThrough(at(0, 0), at(10, 0), at(5, 2));
    const vias = [...network.allSections()]
      .map((section) => section.geometry)
      .filter((geometry) => geometry.kind === "arc")
      .map((geometry) => geometry.via);

    expect(vias).toHaveLength(2);
    for (const via of vias) {
      expect(distance(via, circle.center)).toBeCloseTo(circle.radius);
    }
  });

  it("makes a junction on the curve, not on the chord", () => {
    const network = new RoadNetwork();
    build(network, at(5, -5), at(5, 5));

    // The arc runs over that road at the top of its bend, two meters clear
    // of the line between its ends. Both are cut there and share the node.
    buildArc(network, at(0, 0), at(10, 0), at(5, 2));

    expect(layout(network)).toEqual([
      "(0,0)-(5,2)",
      "(5,-5)-(5,2)",
      "(5,2)-(10,0)",
      "(5,2)-(5,5)",
    ]);
    expect(nodeCount(network)).toBe(5);
  });

  it("is cut where a straight is drawn across it", () => {
    const network = new RoadNetwork();
    buildArc(network, at(0, 0), at(10, 0), at(5, 2));

    // Level with the top of the bend, so it meets the arc there. The same
    // junction as above, arrived at from the other side.
    build(network, at(5, -5), at(5, 5));

    expect(layout(network)).toEqual([
      "(0,0)-(5,2)",
      "(5,-5)-(5,2)",
      "(5,2)-(10,0)",
      "(5,2)-(5,5)",
    ]);
    expect(nodeCount(network)).toBe(5);
  });

  it("is cut twice by a straight drawn across the whole bend", () => {
    const network = new RoadNetwork();
    // Half a circle of radius five, standing on its chord.
    buildArc(network, at(0, 0), at(10, 0), at(5, 5));

    // Level with the middle of it, so it goes in one side and out the
    // other: two junctions, and the arc left in three pieces.
    const plan = planSection(network, at(-5, 3), at(15, 3), STRAIGHT);
    expect(cutPoints(network, plan)).toHaveLength(2);

    build(network, at(-5, 3), at(15, 3));
    expect(nodeCount(network)).toBe(6);
    expect(
      [...network.allSections()].filter((s) => s.geometry.kind === "arc"),
    ).toHaveLength(3);
  });

  it("meets another arc and shares a junction with it", () => {
    const network = new RoadNetwork();

    // Two half circles of radius five whose centers sit five apart, so the
    // circles cross — and both arcs run over the top, where they do.
    buildArc(network, at(0, 0), at(10, 0), at(5, 5));
    buildArc(network, at(5, 0), at(15, 0), at(10, 5));

    expect(nodeCount(network)).toBe(5);
    expect([...network.allSections()]).toHaveLength(4);

    // Above the line the two centers sit on, which is where circles of
    // equal radius meet.
    const junction = nearestNode(network, at(7.5, Math.sqrt(18.75)), 0.01);
    expect(junction).not.toBeNull();
  });

  it("crosses an arc it shares a node with, away from that node", () => {
    const network = new RoadNetwork();

    // Built backwards so the node it leaves behind is the one at the
    // origin, which the second arc then starts from.
    const shared = buildArc(network, at(10, 0), at(0, 0), at(5, 5));
    assert(shared !== null);

    // Quarter turned about the origin, so it leaves by the same node and
    // runs back over the first at (5,5). Sharing that node settles only
    // that place: the meeting at (5,5) is a crossing like any other.
    buildArc(network, shared, at(0, 10), at(5, 5));

    expect(nodeCount(network)).toBe(4);
    expect([...network.allSections()]).toHaveLength(4);
    expect(network.sectionsAt(shared)).toHaveLength(2);
  });

  it("joins an arc onto a node it starts from without cutting there", () => {
    const network = new RoadNetwork();
    const corner = build(network, at(0, 0), at(10, 0));
    assert(corner !== null);
    const before = layout(network);

    // Away from the road it leaves, so the shared node is a join and not a
    // crossing, and the road it starts from stays whole.
    buildArc(network, corner, at(10, 10), at(14, 4));

    expect(layout(network)).toEqual([...before, "(10,0)-(10,10)"].sort());
    expect(nodeCount(network)).toBe(3);
  });
});

describe("starting or ending on a road", () => {
  it("cuts the roads a section starts and ends part way along", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    build(network, at(0, 6), at(10, 6));
    build(network, at(4, 0), at(4, 6));

    expect(layout(network)).toEqual([
      "(0,0)-(4,0)",
      "(0,6)-(4,6)",
      "(4,0)-(10,0)",
      "(4,0)-(4,6)",
      "(4,6)-(10,6)",
    ]);
    expect(nodeCount(network)).toBe(6);
  });

  it("cuts a road a start sits half a centimeter off, leading away from it", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));

    // Never touches the road, so no crossing is found: being that close is
    // what puts it on the road.
    const plan = planSection(network, at(4, 0.005), at(4, 6), STRAIGHT);
    expect(cutPoints(network, plan)).toEqual([at(4, 0.005)]);

    assert(plan.buildable);
    applySectionPlan(network, plan);
    expect(nodeCount(network)).toBe(4);
    expect([...network.allSections()]).toHaveLength(3);
  });

  it("cuts a road an end stops half a centimeter short of", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));

    const plan = planSection(network, at(4, 6), at(4, 0.005), STRAIGHT);
    expect(cutPoints(network, plan)).toEqual([at(4, 0.005)]);

    assert(plan.buildable);
    applySectionPlan(network, plan);
    expect(nodeCount(network)).toBe(4);
    expect([...network.allSections()]).toHaveLength(3);
  });

  it("leaves a road alone that a start sits two centimeters off", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    build(network, at(4, 0.02), at(4, 6));

    expect(layout(network)).toEqual(["(0,0)-(10,0)", "(4,0.02)-(4,6)"]);
  });

  it("starts from the node a start sits beside, not from a second one", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    build(network, at(10.005, 0), at(10, 6));

    expect(layout(network)).toEqual(["(0,0)-(10,0)", "(10,0)-(10,6)"]);
    expect(nodeCount(network)).toBe(3);
  });

  it("cuts an arc a section ends on, at a point computed onto its curve", () => {
    const network = new RoadNetwork();
    buildArc(network, at(0, 0), at(10, 0), at(5, 2));

    // Off the curve by whatever the arithmetic leaves, which is the kind of
    // point a tool placing an end on a road hands over.
    const onArc = pointOnArc(at(0, 0), at(10, 0), at(5, 2), 0.3);
    build(network, at(onArc.x, 6), onArc);

    const kinds = [...network.allSections()]
      .map((section) => section.geometry.kind)
      .sort();
    expect(kinds).toEqual(["arc", "arc", "straight"]);
    expect(nodeCount(network)).toBe(4);
  });

  it("refuses a start on a road too close to that road's node", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    const before = layout(network);

    const plan = planSection(network, at(9.5, 0.005), at(9.5, 6), STRAIGHT);

    expect(plan.buildable).toBe(false);
    expect(layout(network)).toEqual(before);
  });

  it("refuses an end on a road too close to that road's node", () => {
    const network = new RoadNetwork();
    build(network, at(0, 0), at(10, 0));
    const before = layout(network);

    const plan = planSection(network, at(9.5, 6), at(9.5, 0.005), STRAIGHT);

    expect(plan.buildable).toBe(false);
    expect(layout(network)).toEqual(before);
  });
});
