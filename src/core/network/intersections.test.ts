import { assert, describe, expect, it } from "vitest";
import {
  applySectionPlan,
  planSection,
  pointsOf,
  type SectionPlan,
} from "./edits";
import { arcCircle, pointOnArc, type ArcCircle } from "../geometry/arc";
import { distance, type Vec2 } from "../geometry/point";
import { segmentCrossing } from "../geometry/segment";
import { nearestNode, positionOf } from "./queries";
import type { Endpoint } from "./RoadNetwork";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT, type LineGeometry } from "../geometry/lineGeometry";
import { type NodeId } from "./types";
import { TEST_ROAD_PROFILE } from "../testSupport";

function vec(x: number, z: number): Vec2 {
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
  return buildPlan(
    network,
    planSection(network, from, to, STRAIGHT, TEST_ROAD_PROFILE),
  );
}

/** The same, for an arc bending through `via`. */
function buildArc(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
  via: Vec2,
): NodeId | null {
  return buildPlan(
    network,
    planSection(network, from, to, { kind: "arc", via }, TEST_ROAD_PROFILE),
  );
}

function buildPlan(network: RoadNetwork, plan: SectionPlan): NodeId | null {
  if (!plan.buildable) {
    return null;
  }
  const built = applySectionPlan(network, plan);
  return built[built.length - 1].to;
}

/** The circle three positions lie on, or a failure saying they do not. */
function circleThrough(from: Vec2, to: Vec2, via: Vec2): ArcCircle {
  const circle = arcCircle(from, to, via);
  if (circle === null) {
    throw new Error("expected a circle through the three positions");
  }
  return circle;
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
      const from = network.getNode(section.from).position;
      const to = network.getNode(section.to).position;
      return `(${from.x},${from.z})-(${to.x},${to.z})`;
    })
    .sort();
}

function nodeCount(network: RoadNetwork): number {
  return [...network.allNodes()].length;
}

describe("segmentCrossing", () => {
  it("finds where two segments meet", () => {
    const crossing = segmentCrossing(
      vec(0, 0),
      vec(10, 0),
      vec(5, -5),
      vec(5, 5),
    );
    expect(crossing).toEqual({ point: vec(5, 0), alongA: 0.5, alongB: 0.5 });
  });

  it("reports a touch at an endpoint as a crossing", () => {
    const crossing = segmentCrossing(
      vec(0, 0),
      vec(10, 0),
      vec(10, 0),
      vec(10, 5),
    );
    expect(crossing?.point).toEqual(vec(10, 0));
    expect(crossing?.alongA).toBe(1);
  });

  it("has nothing to report for parallel segments", () => {
    expect(
      segmentCrossing(vec(0, 0), vec(10, 0), vec(0, 1), vec(10, 1)),
    ).toBeNull();
  });

  it("has nothing to report for collinear segments, overlapping or not", () => {
    expect(
      segmentCrossing(vec(0, 0), vec(10, 0), vec(5, 0), vec(15, 0)),
    ).toBeNull();
    expect(
      segmentCrossing(vec(0, 0), vec(10, 0), vec(20, 0), vec(30, 0)),
    ).toBeNull();
  });

  it("has nothing to report where the lines meet past the end of a segment", () => {
    expect(
      segmentCrossing(vec(0, 0), vec(4, 0), vec(5, -5), vec(5, 5)),
    ).toBeNull();
  });
});

describe("planning and building a section", () => {
  it("leaves a section that crosses nothing alone", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));

    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
  });

  it("splits both roads where they cross", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));
    build(network, vec(5, -5), vec(5, 5));

    expect(layout(network)).toEqual([
      "(0,0)-(5,0)",
      "(5,-5)-(5,0)",
      "(5,0)-(10,0)",
      "(5,0)-(5,5)",
    ]);
    expect(nodeCount(network)).toBe(5);
  });

  it("shares each road's profile among the pieces it is cut into", () => {
    const network = new RoadNetwork();
    const wide = { ...TEST_ROAD_PROFILE, lanesPerDirection: 2 };
    buildPlan(
      network,
      planSection(network, vec(0, 0), vec(10, 0), STRAIGHT, wide),
    );
    build(network, vec(5, -5), vec(5, 5));

    const sections = [...network.allSections()];
    const isAlongX = (from: NodeId, to: NodeId) =>
      positionOf(network, from).z === 0 && positionOf(network, to).z === 0;
    expect(sections).toHaveLength(4);
    for (const { from, to, profile } of sections) {
      expect(profile).toBe(isAlongX(from, to) ? wide : TEST_ROAD_PROFILE);
    }
  });

  it("returns the node at the far end, wherever the section was cut", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));
    const far = build(network, vec(5, -5), vec(5, 5));

    expect(far).not.toBeNull();
    expect(positionOf(network, far!)).toEqual(vec(5, 5));
  });

  it("splits the road a new one ends on, without leaving a node beside it", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));
    build(network, vec(5, -5), vec(5, 0));

    expect(layout(network)).toEqual([
      "(0,0)-(5,0)",
      "(5,-5)-(5,0)",
      "(5,0)-(10,0)",
    ]);
    expect(nodeCount(network)).toBe(4);
  });

  it("splits nothing along a run of roads drawn end to end", () => {
    const network = new RoadNetwork();
    const corner = build(network, vec(0, 0), vec(5, 0));
    const far = build(network, corner!, vec(5, 5));
    build(network, far!, vec(0, 5));

    expect(layout(network)).toEqual([
      "(0,0)-(5,0)",
      "(5,0)-(5,5)",
      "(5,5)-(0,5)",
    ]);
    expect(nodeCount(network)).toBe(4);
  });

  it("reuses the node a road runs exactly through", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));
    build(network, vec(5, 0), vec(5, 5));
    build(network, vec(5, -5), vec(5, 0));

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
    build(network, vec(2, -2), vec(2, 2));
    build(network, vec(6, -2), vec(6, 2));
    build(network, vec(0, 0), vec(8, 0));

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
    build(network, vec(5, -2), vec(5, 2));
    build(network, vec(5.005, -4), vec(5.005, 4));

    // Half a centimeter apart, which is the same place: the two crossings
    // are one point of the chain, and it cuts both roads.
    const plan = planSection(
      network,
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    assert(plan.buildable);
    expect(cutPoints(network, plan)).toEqual([vec(5, 0)]);

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
    build(network, vec(2, -2), vec(2, 2));
    build(network, vec(6, -2), vec(6, 2));
    const before = layout(network);

    const plan = planSection(
      network,
      vec(0, 0),
      vec(8, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    assert(plan.buildable);

    expect(cutPoints(network, plan)).toEqual([vec(2, 0), vec(6, 0)]);
    expect(layout(network)).toEqual(before);
  });

  it("will not build a plan made before the network last changed", () => {
    const network = new RoadNetwork();
    build(network, vec(5, -5), vec(5, 5));

    // Building a plan is itself a change, so the plan is stale the moment
    // it lands: the section it cut is gone, and applying it again would
    // cut it a second time.
    const plan = planSection(
      network,
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    assert(plan.buildable);
    applySectionPlan(network, plan);
    const before = layout(network);

    expect(() => applySectionPlan(network, plan)).toThrow();
    expect(layout(network)).toEqual(before);
  });

  it("builds a short section standing on its own", () => {
    // Covers no ground twice, so nothing here or in clearance refuses it.
    const network = new RoadNetwork();

    const plan = planSection(
      network,
      vec(0, 0),
      vec(0.4, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    expect(plan.buildable).toBe(true);
  });

  it("refuses a section that ends where it started, with nothing to draw", () => {
    const network = new RoadNetwork();
    const corner = build(network, vec(0, 0), vec(5, 0));
    assert(corner !== null);

    // Both ends in one place, so the chain collapses to a single point:
    // there is no piece of road between them, and nothing a preview could
    // show either. The tool leans on this to tell a click that does
    // nothing from a section it turned down.
    const plan = planSection(
      network,
      corner,
      vec(5, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );

    expect(plan.buildable).toBe(false);
    expect(plan.pieces).toHaveLength(0);
  });
});

describe("planning and building an arc", () => {
  it("builds one through the position it was given", () => {
    const network = new RoadNetwork();

    const plan = planSection(
      network,
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 2),
      },
      TEST_ROAD_PROFILE,
    );
    assert(plan.buildable);
    applySectionPlan(network, plan);

    const [section] = [...network.allSections()];
    expect(section?.centerlineGeometry).toEqual({
      kind: "arc",
      via: vec(5, 2),
    });
    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
  });

  it("refuses a third position in line with the ends", () => {
    const network = new RoadNetwork();

    // No circle passes through three positions in a line, so there is no
    // arc to build. Refused rather than thrown: this is where a third
    // position lands on its way across the road.
    const plan = planSection(
      network,
      vec(0, 0),
      vec(10, 0),
      {
        kind: "arc",
        via: vec(5, 0),
      },
      TEST_ROAD_PROFILE,
    );

    expect(plan.buildable).toBe(false);
    expect(layout(network)).toEqual([]);
  });

  it("refuses a third position in line as the straight between the ends", () => {
    const network = new RoadNetwork();
    build(network, vec(3, -2), vec(7, 5));

    // The third position on an end, with a road across the chord. The
    // crossing lands a rounding off the chord, so cutting the arc there
    // would give pieces almost in a line: circles of enormous radius.
    const plan = planSection(
      network,
      vec(-6, 0),
      vec(12, 1),
      {
        kind: "arc",
        via: vec(-6, 0),
      },
      TEST_ROAD_PROFILE,
    );

    expect(plan.buildable).toBe(false);
    expect(plan.pieces.map((piece) => piece.centerlineGeometry)).toEqual([
      STRAIGHT,
    ]);
    expect(cutPoints(network, plan)).toEqual([]);
  });

  it("cuts into two arcs rather than two straights", () => {
    const network = new RoadNetwork();
    buildArc(network, vec(0, 0), vec(10, 0), vec(5, 2));

    build(network, vec(5, -5), vec(5, 5));

    const kinds = [...network.allSections()]
      .map((section) => section.centerlineGeometry.kind)
      .sort();
    expect(kinds).toEqual(["arc", "arc", "straight", "straight"]);
  });

  it("takes each half's shape off the curve it was cut from", () => {
    const network = new RoadNetwork();
    buildArc(network, vec(0, 0), vec(10, 0), vec(5, 2));
    build(network, vec(5, -5), vec(5, 5));

    // Each half is fixed by a position halfway along its own stretch of the
    // original, so both of those positions are on the original's circle —
    // which is what makes the two halves follow the road they replaced
    // rather than bending somewhere of their own.
    const circle = circleThrough(vec(0, 0), vec(10, 0), vec(5, 2));
    const vias = [...network.allSections()]
      .map((section) => section.centerlineGeometry)
      .filter((geometry) => geometry.kind === "arc")
      .map((geometry) => geometry.via);

    expect(vias).toHaveLength(2);
    for (const via of vias) {
      expect(distance(via, circle.center)).toBeCloseTo(circle.radius);
    }
  });

  it("makes a junction on the curve, not on the chord", () => {
    const network = new RoadNetwork();
    build(network, vec(5, -5), vec(5, 5));

    // The arc runs over that road at the top of its bend, two meters clear
    // of the line between its ends. Both are cut there and share the node.
    buildArc(network, vec(0, 0), vec(10, 0), vec(5, 2));

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
    buildArc(network, vec(0, 0), vec(10, 0), vec(5, 2));

    // Level with the top of the bend, so it meets the arc there. The same
    // junction as above, arrived at from the other side.
    build(network, vec(5, -5), vec(5, 5));

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
    buildArc(network, vec(0, 0), vec(10, 0), vec(5, 5));

    // Level with the middle of it, so it goes in one side and out the
    // other: two junctions, and the arc left in three pieces.
    const plan = planSection(
      network,
      vec(-5, 3),
      vec(15, 3),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    expect(cutPoints(network, plan)).toHaveLength(2);

    build(network, vec(-5, 3), vec(15, 3));
    expect(nodeCount(network)).toBe(6);
    expect(
      [...network.allSections()].filter(
        (s) => s.centerlineGeometry.kind === "arc",
      ),
    ).toHaveLength(3);
  });

  it("meets another arc and shares a junction with it", () => {
    const network = new RoadNetwork();

    // Two half circles of radius five whose centers sit five apart, so the
    // circles cross — and both arcs run over the top, where they do.
    buildArc(network, vec(0, 0), vec(10, 0), vec(5, 5));
    buildArc(network, vec(5, 0), vec(15, 0), vec(10, 5));

    expect(nodeCount(network)).toBe(5);
    expect([...network.allSections()]).toHaveLength(4);

    // Above the line the two centers sit on, which is where circles of
    // equal radius meet.
    const junction = nearestNode(network, vec(7.5, Math.sqrt(18.75)), 0.01);
    expect(junction).not.toBeNull();
  });

  it("crosses an arc it shares a node with, away from that node", () => {
    const network = new RoadNetwork();

    // Built backwards so the node it leaves behind is the one at the
    // origin, which the second arc then starts from.
    const shared = buildArc(network, vec(10, 0), vec(0, 0), vec(5, 5));
    assert(shared !== null);

    // Quarter turned about the origin, so it leaves by the same node and
    // runs back over the first at (5,5). Sharing that node settles only
    // that place: the meeting at (5,5) is a crossing like any other.
    buildArc(network, shared, vec(0, 10), vec(5, 5));

    expect(nodeCount(network)).toBe(4);
    expect([...network.allSections()]).toHaveLength(4);
    expect(network.sectionsAt(shared)).toHaveLength(2);
  });

  it("joins an arc onto a node it starts from without cutting there", () => {
    const network = new RoadNetwork();
    const corner = build(network, vec(0, 0), vec(10, 0));
    assert(corner !== null);
    const before = layout(network);

    // Away from the road it leaves, so the shared node is a join and not a
    // crossing, and the road it starts from stays whole.
    buildArc(network, corner, vec(10, 10), vec(14, 4));

    expect(layout(network)).toEqual([...before, "(10,0)-(10,10)"].sort());
    expect(nodeCount(network)).toBe(3);
  });
});

describe("starting or ending on a road", () => {
  it("cuts the roads a section starts and ends part way along", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));
    build(network, vec(0, 6), vec(10, 6));
    build(network, vec(4, 0), vec(4, 6));

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
    build(network, vec(0, 0), vec(10, 0));

    // Never touches the road, so no crossing is found: being that close is
    // what puts it on the road.
    const plan = planSection(
      network,
      vec(4, 0.005),
      vec(4, 6),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    expect(cutPoints(network, plan)).toEqual([vec(4, 0.005)]);

    assert(plan.buildable);
    applySectionPlan(network, plan);
    expect(nodeCount(network)).toBe(4);
    expect([...network.allSections()]).toHaveLength(3);
  });

  it("cuts a road an end stops half a centimeter short of", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));

    const plan = planSection(
      network,
      vec(4, 6),
      vec(4, 0.005),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    expect(cutPoints(network, plan)).toEqual([vec(4, 0.005)]);

    assert(plan.buildable);
    applySectionPlan(network, plan);
    expect(nodeCount(network)).toBe(4);
    expect([...network.allSections()]).toHaveLength(3);
  });

  it("leaves a road alone that a start sits two centimeters off", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));
    build(network, vec(4, 0.02), vec(4, 6));

    expect(layout(network)).toEqual(["(0,0)-(10,0)", "(4,0.02)-(4,6)"]);
  });

  it("starts from the node a start sits beside, not from a second one", () => {
    const network = new RoadNetwork();
    build(network, vec(0, 0), vec(10, 0));
    build(network, vec(10.005, 0), vec(10, 6));

    expect(layout(network)).toEqual(["(0,0)-(10,0)", "(10,0)-(10,6)"]);
    expect(nodeCount(network)).toBe(3);
  });

  it("cuts an arc a section ends on, at a point computed onto its curve", () => {
    const network = new RoadNetwork();
    buildArc(network, vec(0, 0), vec(10, 0), vec(5, 2));

    // Off the curve by whatever the arithmetic leaves, which is the kind of
    // point a tool placing an end on a road hands over.
    const onArc = pointOnArc(vec(0, 0), vec(10, 0), vec(5, 2), 0.3);
    build(network, vec(onArc.x, 6), onArc);

    const kinds = [...network.allSections()]
      .map((section) => section.centerlineGeometry.kind)
      .sort();
    expect(kinds).toEqual(["arc", "arc", "straight"]);
    expect(nodeCount(network)).toBe(4);
  });
});

describe("a biarc in the network", () => {
  // A U-turn around (0, 10), radius 10: two quarter circles joined at
  // (10, 10).
  const diagonal = 10 * Math.SQRT1_2;

  const uTurn: LineGeometry = {
    kind: "biarc",
    biarc: {
      join: vec(10, 10),
      first: { kind: "arc", via: vec(diagonal, 10 - diagonal) },
      second: { kind: "arc", via: vec(diagonal, 10 + diagonal) },
    },
  };

  function withUTurn(): RoadNetwork {
    const network = new RoadNetwork();
    network.addSection(vec(0, 0), vec(0, 20), uTurn, TEST_ROAD_PROFILE);
    return network;
  }

  it("is planned on open ground as one piece, the biarc itself", () => {
    const plan = planSection(
      new RoadNetwork(),
      vec(0, 0),
      vec(0, 20),
      uTurn,
      TEST_ROAD_PROFILE,
    );

    assert(plan.buildable);
    expect(plan.pieces).toHaveLength(1);
    const piece = plan.pieces[0].centerlineGeometry;
    assert(piece.kind === "biarc");
    expect(distance(piece.biarc.join, vec(10, 10))).toBeCloseTo(0);
  });

  it("is planned across a road as a biarc up to it and an arc after", () => {
    // z = 15 meets the second piece at (√75, 15).
    const network = new RoadNetwork();
    build(network, vec(5, 15), vec(20, 15));
    const plan = planSection(
      network,
      vec(0, 0),
      vec(0, 20),
      uTurn,
      TEST_ROAD_PROFILE,
    );

    assert(plan.buildable);
    expect(plan.pieces.map((piece) => piece.centerlineGeometry.kind)).toEqual([
      "biarc",
      "arc",
    ]);
    expect(cutPoints(network, plan)).toHaveLength(1);
    applySectionPlan(network, plan);
    expect([...network.allSections()]).toHaveLength(4);
  });

  function kinds(network: RoadNetwork): string[] {
    return [...network.allSections()]
      .map((section) => section.centerlineGeometry.kind)
      .sort();
  }

  it("is cut into an arc, a biarc and an arc by a straight across it", () => {
    // x = 5 meets it once on each piece, 30° from either end.
    const network = withUTurn();
    build(network, vec(5, -5), vec(5, 25));

    expect(kinds(network)).toEqual([
      "arc",
      "arc",
      "biarc",
      "straight",
      "straight",
      "straight",
    ]);
  });

  it("is cut into a biarc and an arc by a straight ending on it", () => {
    const network = withUTurn();
    build(network, vec(30, 30), vec(diagonal, 10 + diagonal));

    expect(kinds(network)).toEqual(["arc", "biarc", "straight"]);
  });

  it("is cut into its two pieces by a straight ending at the join", () => {
    const network = withUTurn();
    build(network, vec(30, 10), vec(10, 10));

    expect(kinds(network)).toEqual(["arc", "arc", "straight"]);
  });

  it("still joins it at its node", () => {
    const network = withUTurn();
    const end = nearestNode(network, vec(0, 20), 0.01);
    assert(end !== null);

    expect(build(network, end.id, vec(0, 40))).not.toBeNull();
  });
});
