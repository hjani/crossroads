import { describe, expect, it, vi } from "vitest";
import { Junction } from "./junction";
import { RoadNetwork } from "../network/RoadNetwork";
import { pointOnArc } from "../geometry/arc";
import { STRAIGHT } from "../geometry/lineGeometry";
import { type SectionId } from "../network/types";
import { distance, SAME_POINT_METERS, type Vec2 } from "../geometry/point";
import { nearestPointOnSegment } from "../geometry/segment";
import { addStraight, TEST_ROAD_WIDTH_METERS } from "../testSupport";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

/** The point `radius` from `center` at `angle`, turning from +x toward +z. */
function onCircle(center: Vec2, radius: number, angle: number): Vec2 {
  return {
    x: center.x + radius * Math.cos(angle),
    z: center.z + radius * Math.sin(angle),
  };
}

describe("Junction", () => {
  it("sets a dead end back by nothing", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));

    const junction = new Junction(network, road.to);

    expect(junction.setbackOf(road.id)).toBe(0);
  });

  it("sets a straight join back by nothing", () => {
    const network = new RoadNetwork();
    const west = addStraight(network, vec(-20, 0), vec(0, 0));
    const east = addStraight(network, west.to, vec(20, 0));

    const junction = new Junction(network, west.to);

    expect(junction.setbackOf(west.id)).toBeCloseTo(0);
    expect(junction.setbackOf(east.id)).toBeCloseTo(0);
  });

  it("sets both roads of a right-angle bend back by half the width", () => {
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    const north = addStraight(network, east.from, vec(0, 20));

    const junction = new Junction(network, east.from);

    expect(junction.setbackOf(east.id)).toBeCloseTo(4);
    expect(junction.setbackOf(north.id)).toBeCloseTo(4);
  });

  it("sets each road of a skewed T back by the longer of its two gaps", () => {
    // East and west are one straight road; the branch leaves at 60°.
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    const branch = addStraight(network, east.from, vec(10, 10 * Math.sqrt(3)));
    const west = addStraight(network, east.from, vec(-20, 0));

    const junction = new Junction(network, east.from);

    // Two straights, gap φ, node N: P is w/2 from both centerlines, so on the
    // line splitting the gap in half. With F the foot of P on a centerline,
    // the right triangle N F P has angle φ/2 at N and |PF| = w/2:
    //
    //     s = |NF| = (w/2) / tan(φ/2)
    //
    // The 60° gap: 4·√3. The 120° gap: 4/√3.
    expect(junction.setbackOf(east.id)).toBeCloseTo(4 * Math.sqrt(3));
    expect(junction.setbackOf(branch.id)).toBeCloseTo(4 * Math.sqrt(3));
    expect(junction.setbackOf(west.id)).toBeCloseTo(4 / Math.sqrt(3));
  });

  it("sets a road back regardless of its length", () => {
    const network = new RoadNetwork();
    const short = addStraight(network, vec(0, 0), vec(6, 0));
    const long = addStraight(network, short.from, vec(0, 20));

    const junction = new Junction(network, short.from);

    expect(junction.setbackOf(short.id)).toBeCloseTo(4);
    expect(junction.setbackOf(long.id)).toBeCloseTo(4);
  });

  it("doesn't set back two roads leaving the same way", () => {
    const network = new RoadNetwork();
    const short = addStraight(network, vec(0, 0), vec(10, 0));
    const long = addStraight(network, short.from, vec(20, 0));

    const junction = new Junction(network, short.from);

    expect(junction.setbackOf(short.id)).toBe(0);
    expect(junction.setbackOf(long.id)).toBe(0);
  });

  it("sets a straight and an arc bending away from it back", () => {
    // East straight; the arc leaves north and bends west, around O = (−R, 0).
    const R = 20;
    const center = vec(-R, 0);
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(40, 0));
    const arc = network.addSection(
      east.from,
      onCircle(center, R, Math.PI / 2),
      { kind: "arc", via: onCircle(center, R, Math.PI / 4) },
      TEST_ROAD_WIDTH_METERS,
    );

    const junction = new Junction(network, east.from);

    // Straight edge z = w/2; the arc's outer edge, radius R + w/2, around O.
    // They cross at P = (h − R, w/2), with h² = (R + w/2)² − (w/2)² = R² + Rw.
    // Straight: s = P.x. Arc: s = R·θ, θ the angle at O between N and P.
    const h = Math.sqrt(R * R + R * TEST_ROAD_WIDTH_METERS);
    expect(junction.setbackOf(east.id)).toBeCloseTo(h - R);
    expect(junction.setbackOf(arc.id)).toBeCloseTo(
      R * Math.atan2(TEST_ROAD_WIDTH_METERS / 2, h),
    );
  });

  it("sets two arcs bending away from each other back alike", () => {
    // Mirror images across the line x = z: one leaves east and bends south,
    // around (0, −R); the other leaves north and bends west, around (−R, 0).
    const R = 20;
    const southCenter = vec(0, -R);
    const westCenter = vec(-R, 0);
    const network = new RoadNetwork();
    const east = network.addSection(
      vec(0, 0),
      onCircle(southCenter, R, 0),
      {
        kind: "arc",
        via: onCircle(southCenter, R, Math.PI / 4),
      },
      TEST_ROAD_WIDTH_METERS,
    );
    const north = network.addSection(
      east.from,
      onCircle(westCenter, R, Math.PI / 2),
      { kind: "arc", via: onCircle(westCenter, R, Math.PI / 4) },
      TEST_ROAD_WIDTH_METERS,
    );

    const junction = new Junction(network, east.from);

    // Both outer edges, radius r = R + w/2, cross on x = z at P = (x, x):
    //   (x + R)² + x² = r²  →  x = (√(2r² − R²) − R) / 2
    // Seen from (0, −R), N is straight up and P at (x, R + x):
    //   s = R·atan2(x, R + x)
    const r = R + TEST_ROAD_WIDTH_METERS / 2;
    const x = (Math.sqrt(2 * r * r - R * R) - R) / 2;
    const expected = R * Math.atan2(x, R + x);
    expect(junction.setbackOf(east.id)).toBeCloseTo(expected);
    expect(junction.setbackOf(north.id)).toBeCloseTo(expected);
  });

  it("sets a straight and an arc just short of in line back by almost nothing", () => {
    // The straight leaves west, tilted a milliradian south; the arc leaves
    // east and bends south, into the gap, around (0, −R).
    const R = 20;
    const center = vec(0, -R);
    const network = new RoadNetwork();
    const west = addStraight(network, vec(0, 0), vec(-20, -0.02));
    const arc = network.addSection(
      west.from,
      onCircle(center, R, 0),
      {
        kind: "arc",
        via: onCircle(center, R, Math.PI / 4),
      },
      TEST_ROAD_WIDTH_METERS,
    );

    const junction = new Junction(network, west.from);

    for (const id of [west.id, arc.id]) {
      expect(junction.setbackOf(id)).toBeGreaterThan(0);
      expect(junction.setbackOf(id)).toBeLessThan(0.05);
    }
  });

  it("doesn't set back an arc too tight for its inner edge", () => {
    // The arc leaves north and bends east, into the gap, with R < w/2.
    const R = 3;
    const center = vec(R, 0);
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    const arc = network.addSection(
      east.from,
      onCircle(center, R, Math.PI / 2),
      { kind: "arc", via: onCircle(center, R, (3 * Math.PI) / 4) },
      TEST_ROAD_WIDTH_METERS,
    );

    const junction = new Junction(network, east.from);

    expect(junction.setbackOf(east.id)).toBe(0);
    expect(junction.setbackOf(arc.id)).toBe(0);
  });

  for (const [bend, side] of [
    ["counterclockwise", 1],
    ["clockwise", -1],
  ] as const) {
    it(`sets a straight and a tangent arc bending ${bend} back`, () => {
      // Both leave east. The arc is a half circle around (0, side·R). Added
      // after the straight, so only its curvature can put it on the right
      // side of it.
      const R = 20;
      const center = vec(0, side * R);
      const network = new RoadNetwork();
      const east = addStraight(network, vec(0, 0), vec(40, 0));
      const arc = network.addSection(
        east.from,
        vec(0, 2 * side * R),
        {
          kind: "arc",
          via: onCircle(center, R, 0),
        },
        TEST_ROAD_WIDTH_METERS,
      );

      const junction = new Junction(network, east.from);

      // The straight's edge z = side·w/2 and the arc's outer edge, radius
      // R + w/2, cross at P = (x, side·w/2):
      //   x² = (R + w/2)² − (R − w/2)² = 2Rw
      // Straight: s = x. Arc: seen from its center, N is at (0, −side·R) and
      // P at (x, −side·(R − w/2)) → s = R·atan2(x, R − w/2).
      const x = Math.sqrt(2 * R * TEST_ROAD_WIDTH_METERS);
      expect(junction.setbackOf(east.id)).toBeCloseTo(x);
      expect(junction.setbackOf(arc.id)).toBeCloseTo(
        R * Math.atan2(x, R - TEST_ROAD_WIDTH_METERS / 2),
      );
    });
  }

  /**
   * A 16 m road east and an 8 m one leaving at `angle`, meeting at the
   * origin: half-widths `r = 8` and `d = 4`.
   */
  function wideAndNarrow(angle: number): {
    junction: Junction;
    wide: SectionId;
    narrow: SectionId;
  } {
    const network = new RoadNetwork();
    const wide = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT, 16);
    const narrow = network.addSection(
      wide.from,
      onCircle(vec(0, 0), 20, angle),
      STRAIGHT,
      8,
    );
    return {
      junction: new Junction(network, wide.from),
      wide: wide.id,
      narrow: narrow.id,
    };
  }

  it("joins round a gap too wide for a corner where the widths differ", () => {
    // Two straights: the corner sets the wider road back by
    // (d + r·cos ψ)/sin ψ, behind the node for ψ > arccos(−d/r) = 120°. So
    // the 150° gap goes round, and so does the 210° one on the other side:
    // a 30° bend, under β₁ = arccos(d/r) = 60°, so on both sides the slid
    // circle touches the T–X piece. The wider road takes the longer slide,
    // the outside's r·tan((β₁ + β)/4) at β = 30°; the narrower one ends at
    // X, √(r² − d²) along.
    const { junction, wide, narrow } = wideAndNarrow((5 * Math.PI) / 6);

    expect(junction.setbackOf(wide)).toBeCloseTo(8 * Math.tan(Math.PI / 8));
    expect(junction.setbackOf(narrow)).toBeCloseTo(Math.sqrt(48));
  });

  it("doesn't jump where a gap turns from corner to round", () => {
    // Either side of 120°: the corner's setbacks (d + r·cos ψ)/sin ψ → 0 and
    // (r + d·cos ψ)/sin ψ → √(r² − d²), the round join's. The 240° gap on
    // the other side is at β₁ = 60° then, where the slid circle turns from
    // the T–X piece to the curb: r·tan(β₁/2) either way, which the wider road
    // takes as the longer.
    const corner = wideAndNarrow((2 * Math.PI) / 3 - 1e-6);
    const round = wideAndNarrow((2 * Math.PI) / 3 + 1e-6);

    for (const { junction, wide, narrow } of [corner, round]) {
      expect(junction.setbackOf(wide)).toBeCloseTo(8 * Math.tan(Math.PI / 6));
      expect(junction.setbackOf(narrow)).toBeCloseTo(Math.sqrt(48));
    }
  });

  it("throws for a section not meeting the node", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));

    const junction = new Junction(network, road.from);

    expect(() => junction.setbackOf(99 as SectionId)).toThrow();
  });
});

describe("Junction.outline", () => {
  /** The corners the outline runs through, in order. */
  function cornersOf(junction: Junction): readonly Vec2[] {
    return junction.outline().pieces.map((piece) => piece.point);
  }

  /** The `via` of every piece the outline runs round rather than straight. */
  function viasOf(junction: Junction): readonly Vec2[] {
    return junction
      .outline()
      .pieces.map((piece) => piece.incomingGeometry)
      .filter((geometry) => geometry.kind === "arc")
      .map((geometry) => geometry.via);
  }

  function expectPoints(
    actual: readonly Vec2[],
    expected: readonly Vec2[],
  ): void {
    expect(actual.length).toBe(expected.length);
    actual.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index].x);
      expect(point.z).toBeCloseTo(expected[index].z);
    });
  }

  it("caps a dead end with a half circle", () => {
    // One gap of a full turn: nothing set back, and the ring is the road's
    // end cut and the cap round it, through the point right behind the node.
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));

    const junction = new Junction(network, road.from);

    expectPoints(cornersOf(junction), [vec(0, 4), vec(0, -4)]);
    expectPoints(viasOf(junction), [vec(-4, 0)]);
  });

  it("paves a right-angle bend with a triangle rounded off at the node", () => {
    // Both roads set back by w/2, so all three corners of the narrow gap fall
    // on the one corner point (4, 4). The 270° gap is joined round the node,
    // from (−4, 0) to (0, −4) through the bisector at 225°.
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    addStraight(network, east.from, vec(0, 20));

    const junction = new Junction(network, east.from);

    expectPoints(cornersOf(junction), [
      vec(4, 4),
      vec(-4, 4),
      vec(-4, 0),
      vec(0, -4),
      vec(4, -4),
    ]);
    expectPoints(viasOf(junction), [onCircle(vec(0, 0), 4, (5 * Math.PI) / 4)]);
  });

  it("rounds a bend between two widths off with a circle slid along the wider road", () => {
    // A 16 m road east, an 8 m one north. The narrow gap's corner is (4, 8):
    // east set back 4, north 8. On the 270° side north, carried on past the
    // node, covers east's T at (0, −8), so the circle of radius 8 slides
    // along east until it touches north's curb x = −4: centered on x = 4,
    // where that curb moved 8 toward the road crosses east's centerline. It
    // touches east's curb at (4, −8), north's at (−4, 0) beside the node,
    // and runs between them through 225° round its center.
    const network = new RoadNetwork();
    const east = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT, 16);
    network.addSection(east.from, vec(0, 20), STRAIGHT, 8);

    const junction = new Junction(network, east.from);

    expectPoints(cornersOf(junction), [
      vec(4, 8),
      vec(-4, 8),
      vec(-4, 0),
      vec(4, -8),
    ]);
    expectPoints(viasOf(junction), [onCircle(vec(4, 0), 8, (5 * Math.PI) / 4)]);
  });

  it("tapers a straight join between two widths alike on both sides", () => {
    // A 16 m road east, an 8 m one west. On each side the circle of radius 8
    // slides along east until it touches the T–X piece: from T beside the
    // node to X, where west's curb crosses the circle about the node √48
    // along. That piece drops 4 over √48, a 30° corner at T, which the circle
    // rounds off by sliding 8·tan 15° — and touches the piece as far from T.
    const network = new RoadNetwork();
    const east = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT, 16);
    const west = network.addSection(east.from, vec(-20, 0), STRAIGHT, 8);

    const junction = new Junction(network, east.from);

    const slide = 8 * Math.tan(Math.PI / 12);
    const touch = vec(
      -slide * Math.cos(Math.PI / 6),
      8 - slide * Math.sin(Math.PI / 6),
    );
    expect(junction.setbackOf(east.id)).toBeCloseTo(slide);
    expect(junction.setbackOf(west.id)).toBeCloseTo(Math.sqrt(48));
    expectPoints(cornersOf(junction), [
      vec(slide, 8),
      touch,
      vec(-Math.sqrt(48), 4),
      vec(-Math.sqrt(48), -4),
      vec(touch.x, -touch.z),
      vec(slide, -8),
    ]);
    expectPoints(viasOf(junction), [
      onCircle(vec(slide, 0), 8, (105 * Math.PI) / 180),
      onCircle(vec(slide, 0), 8, (255 * Math.PI) / 180),
    ]);
  });

  it("runs the narrower curb on past the node to where the circle touches it", () => {
    // A 16 m road east, an 8 m one leaving at 105°: a 75° bend, past
    // β₁ = 60°, so on the 255° side the circle touches the narrower road's
    // curb. It slides (W − w)/(2·sin 75°) along east and touches the curb
    // square across from its center — which lies behind the node along the
    // narrower road, so that curb runs on past the node into the junction.
    const angle = (105 * Math.PI) / 180;
    const network = new RoadNetwork();
    const east = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT, 16);
    network.addSection(east.from, onCircle(vec(0, 0), 20, angle), STRAIGHT, 8);

    const junction = new Junction(network, east.from);

    const slide = 4 / Math.sin((75 * Math.PI) / 180);
    const touch = vec(slide - 8 * Math.sin(angle), 8 * Math.cos(angle));
    expect(junction.setbackOf(east.id)).toBeCloseTo(slide);
    expect(
      cornersOf(junction).some((corner) => distance(corner, touch) < 1e-6),
    ).toBe(true);
    expect(touch.x * Math.cos(angle) + touch.z * Math.sin(angle)).toBeLessThan(
      0,
    );
  });

  it("keeps touching the narrower curb on a bend sharper than 180° − β₁", () => {
    // A 16 m road east, an 8 m one leaving at 55°: a 125° bend. East's T on
    // the 305° side, (0, −8), lies past the narrower road's far curb by then,
    // but the curb has long swung past T: the circle still touches it,
    // centered (W − w)/(2·sin 125°) along east.
    const network = new RoadNetwork();
    const east = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT, 16);
    network.addSection(
      east.from,
      onCircle(vec(0, 0), 20, (55 * Math.PI) / 180),
      STRAIGHT,
      8,
    );

    const junction = new Junction(network, east.from);

    const center = vec(4 / Math.sin((125 * Math.PI) / 180), 0);
    const vias = viasOf(junction);
    expect(vias).toHaveLength(1);
    expect(distance(center, vias[0])).toBeCloseTo(8);
  });

  it("doesn't jump where either gap of a bend between two widths switches", () => {
    // An 8 m road leaving a 16 m one 120° round: its narrow gap is where a
    // corner turns round, its wide one where the circle turns from the T–X
    // piece to the curb (β₁ = 60°). Either side of that, the same outline.
    const cornersAt = (angle: number) => {
      const network = new RoadNetwork();
      const east = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT, 16);
      network.addSection(
        east.from,
        onCircle(vec(0, 0), 20, angle),
        STRAIGHT,
        8,
      );
      return cornersOf(new Junction(network, east.from));
    };

    expectPoints(
      cornersAt((2 * Math.PI) / 3 - 1e-6),
      cornersAt((2 * Math.PI) / 3 + 1e-6),
    );
  });

  it("swings a curved narrower curb about X, so nothing jumps at the switch", () => {
    // A 16 m road east, and an 8 m one curving clockwise on the 30 m circle
    // about (−24, 18). Its curb on the wide side, 26 from that center, runs
    // through east's T at (0, 8): the switch. Past it the circle touches that
    // curb, centered 26 + 8 from the curb's center on east's centerline;
    // short of it, the T–X piece swung about X is that same curb. Turning the
    // curved road a hair either way gives the same slide.
    const center = vec(-24, 18);
    const slideAt = (turned: number) => {
      const turn = (p: Vec2) =>
        onCircle(
          vec(0, 0),
          Math.hypot(p.x, p.z),
          Math.atan2(p.z, p.x) + turned,
        );
      const network = new RoadNetwork();
      const east = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT, 16);
      network.addSection(
        east.from,
        turn(onCircle(center, 30, -Math.PI / 2)),
        { kind: "arc", via: turn(onCircle(center, 30, -Math.PI / 3)) },
        8,
      );
      return new Junction(network, east.from).setbackOf(east.id);
    };

    const slide = Math.sqrt(34 * 34 - 18 * 18) - 24;
    expect(slideAt(-1e-6)).toBeCloseTo(slide);
    expect(slideAt(1e-6)).toBeCloseTo(slide);
  });

  it("runs back along an edge where the other gap set the road back further", () => {
    // The skewed T of `docs/ideas/junction-polygon.md`: east and west are one
    // straight road, the branch leaves at 60°. The branch is set back 0.87 w
    // by its narrow gap, past the 0.29 w its wide one asks for, so the
    // outline runs back down its edge to that gap's corner point — which
    // points into the shape.
    //
    // The C–A gap is a half turn: its round join has no arc in it, and the
    // touching point it runs through, (0, −4), lies on the straight the
    // outline would take anyway.
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    addStraight(network, east.from, vec(10, 10 * Math.sqrt(3)));
    addStraight(network, east.from, vec(-20, 0));

    const junction = new Junction(network, east.from);

    const near = 4 * Math.sqrt(3);
    const far = 4 / Math.sqrt(3);
    expectPoints(cornersOf(junction), [
      vec(near, 4),
      vec(0, 8),
      vec(-far, 4),
      vec(-far, -4),
      vec(0, -4),
      vec(near, -4),
    ]);
    expect(viasOf(junction)).toEqual([]);
  });

  it("says which pieces border a curb and which a roadway's end", () => {
    // The skewed T again, with the same six corners. Each road's cut across
    // it borders its roadway; the rest is curb: the branch's edge back to the
    // corner point, and the straight edge through the half-turn gap.
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    addStraight(network, east.from, vec(10, 10 * Math.sqrt(3)));
    addStraight(network, east.from, vec(-20, 0));

    const junction = new Junction(network, east.from);

    expect(junction.outline().pieces.map((piece) => piece.edge)).toEqual([
      "roadwayEnd", // east's cut, arriving at (near, 4)
      "roadwayEnd", // the branch's cut, arriving at (0, 8)
      "curb", // down the branch's edge to the corner point (−far, 4)
      "roadwayEnd", // west's cut, arriving at (−far, −4)
      "curb", // along the straight edge to the touching point (0, −4)
      "curb", // on along east's edge to (near, −4)
    ]);
  });

  it("follows an arc leg's edge round rather than cutting across it", () => {
    // East, an arc leaving north and curving west, and west. The arc's two
    // gaps ask for different setbacks, since one reads its outer edge and the
    // other its inner, so it takes the longer and its outline piece back to
    // the east gap's corner point runs round the outer edge.
    const R = 20;
    const center = vec(-R, 0);
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    network.addSection(
      east.from,
      onCircle(center, R, Math.PI / 2),
      {
        kind: "arc",
        via: onCircle(center, R, Math.PI / 4),
      },
      TEST_ROAD_WIDTH_METERS,
    );
    addStraight(network, east.from, vec(-20, 0));

    const junction = new Junction(network, east.from);

    // East's edge z = w/2 meets the arc's outer edge, radius R + w/2, at
    //   x = −R + √((R + w/2)² − (w/2)²)
    const outer = R + TEST_ROAD_WIDTH_METERS / 2;
    const half = TEST_ROAD_WIDTH_METERS / 2;
    const corner = vec(Math.sqrt(outer * outer - half * half) - R, half);
    expect(junction.outline().pieces).toHaveLength(6);
    expectPoints([junction.outline().pieces[0].point], [corner]);

    // The one arc piece is that run down the outer edge: the west–east gap is
    // a half turn, so its round join has no arc in it.
    const vias = viasOf(junction);
    expect(vias).toHaveLength(1);
    expect(distance(center, vias[0])).toBeCloseTo(outer);
  });

  it("leaves an arc leg's edge for the circle about the node", () => {
    // East, and an arc leaving north and curving west, so the gap the other
    // way round is 270°. On that side the arc shows its inner edge, a circle
    // of radius R − w/2 — and it still touches the circle about the node
    // right beside it, at (−4, 0), just as a straight leg's edge would.
    const R = 20;
    const center = vec(-R, 0);
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(40, 0));
    network.addSection(
      east.from,
      onCircle(center, R, Math.PI / 2),
      {
        kind: "arc",
        via: onCircle(center, R, Math.PI / 4),
      },
      TEST_ROAD_WIDTH_METERS,
    );

    const junction = new Junction(network, east.from);

    // Piece 1 is east's cut across the road, piece 2 the arc's. Then the
    // join: back down the inner edge to (−4, 0), round the node to (0, −4),
    // and out along east's edge.
    const pieces = junction.outline().pieces;
    expect(pieces).toHaveLength(5);
    expectPoints([pieces[2].point, pieces[3].point], [vec(-4, 0), vec(0, -4)]);

    const vias = viasOf(junction);
    expect(vias).toHaveLength(2);
    expect(distance(center, vias[0])).toBeCloseTo(R - 4);
    expectPoints([vias[1]], [onCircle(vec(0, 0), 4, (5 * Math.PI) / 4)]);
  });
});

describe("Junction.boundingRadius", () => {
  it("covers a dead end by half the width", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));

    const junction = new Junction(network, road.from);

    expect(junction.boundingRadius()).toBeCloseTo(4);
  });

  it("reaches the corner point of a right-angle bend", () => {
    // The corner point is (4, 4).
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    addStraight(network, east.from, vec(0, 20));

    const junction = new Junction(network, east.from);

    expect(junction.boundingRadius()).toBeCloseTo(4 * Math.sqrt(2));
  });

  it("reaches the farthest point of a skewed T", () => {
    // The outline of the skewed T above: east's edge points (4·√3, ±4) and
    // the narrow gap's corner point (0, 8) are all 8 from the node.
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    addStraight(network, east.from, vec(10, 10 * Math.sqrt(3)));
    addStraight(network, east.from, vec(-20, 0));

    const junction = new Junction(network, east.from);

    expect(junction.boundingRadius()).toBeCloseTo(8);
  });
});

describe("Junction between two widths, across every bend", () => {
  /** Road widths, wider first; the last pair are equal. */
  const pairs = [
    [16, 8],
    [16, 4],
    [12, 8],
    [8, 8],
  ] as const;

  /** A `wide` road east and a `narrow` one leaving `degrees` round from it. */
  function junctionAt(wide: number, narrow: number, degrees: number): Junction {
    const network = new RoadNetwork();
    const east = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT, wide);
    network.addSection(
      east.from,
      onCircle(vec(0, 0), 20, (degrees * Math.PI) / 180),
      STRAIGHT,
      narrow,
    );
    return new Junction(network, east.from);
  }

  /**
   * The outline as a polygon, each arc cut into 64 chords: at most a few
   * millimeters inside it, under `SAME_POINT_METERS`, so a node right on an
   * arc still counts as on it.
   */
  function polygonOf(junction: Junction): Vec2[] {
    const { pieces } = junction.outline();
    return pieces.flatMap((piece, index) => {
      const geometry = piece.incomingGeometry;
      if (geometry.kind !== "arc") {
        return [piece.point];
      }
      const from = pieces[(index + pieces.length - 1) % pieces.length].point;
      return Array.from({ length: 64 }, (_, step) =>
        pointOnArc(from, piece.point, geometry.via, (step + 1) / 64),
      );
    });
  }

  /**
   * Whether `point` lies inside `polygon`, counting crossings of a ray toward
   * +x — or on its boundary, within `SAME_POINT_METERS`.
   */
  function covers(polygon: readonly Vec2[], point: Vec2): boolean {
    let crossings = 0;
    for (const [index, a] of polygon.entries()) {
      const b = polygon[(index + 1) % polygon.length];
      if (
        distance(point, nearestPointOnSegment(point, a, b)) <= SAME_POINT_METERS
      ) {
        return true;
      }
      if (a.z > point.z !== b.z > point.z) {
        const x = a.x + ((point.z - a.z) / (b.z - a.z)) * (b.x - a.x);
        if (x > point.x) {
          crossings++;
        }
      }
    }
    return crossings % 2 === 1;
  }

  it("says whether it covers its node just as its outline does, logging nothing", () => {
    // The node falls out on bends sharper than 180° − arcsin(1 − w/W), where
    // the slid circle no longer reaches it; a failed join would cut the
    // outline straight across, past it. An empty ring is a straight join of
    // equal widths, with nothing to cover.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const disagreeing: string[] = [];
    try {
      for (const [wide, narrow] of pairs) {
        for (let degrees = 10; degrees <= 350; degrees += 0.5) {
          const junction = junctionAt(wide, narrow, degrees);
          const polygon = polygonOf(junction);
          const covered = polygon.length === 0 || covers(polygon, vec(0, 0));
          if (covered !== junction.coversNode()) {
            disagreeing.push(`${wide} m and ${narrow} m at ${degrees}°`);
          }
        }
      }
      expect(disagreeing).toEqual([]);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("covers its node up to a bend of 180° − arcsin(1 − w/W)", () => {
    // 16 m and 4 m: arcsin(3/4) = 48.6°, so up to a 131.4° bend — a road
    // leaving 48.6° round from the other.
    expect(junctionAt(16, 4, 50).coversNode()).toBe(true);
    expect(junctionAt(16, 4, 47).coversNode()).toBe(false);
    expect(junctionAt(16, 4, 313).coversNode()).toBe(false);
    expect(junctionAt(16, 4, 310).coversNode()).toBe(true);
  });

  it("doesn't jump where a gap switches between corner, T–X piece and curb", () => {
    // Two straights switch at 180° − β₁ (a corner turns round, and the other
    // gap's circle turns from the T–X piece to the curb), at 180° (each side
    // turns from inside to outside), and at 180° + β₁, the same mirrored. A
    // ring may start at another leg either side of a switch, so `after` is
    // turned to start where `before` does before they are compared.
    const cornersOf = (junction: Junction) =>
      junction.outline().pieces.map((piece) => piece.point);
    const startingNear = (ring: readonly Vec2[], start: Vec2) => {
      const nearest = ring.reduce(
        (best, point, index) =>
          distance(point, start) < distance(ring[best], start) ? index : best,
        0,
      );
      return [...ring.slice(nearest), ...ring.slice(0, nearest)];
    };
    for (const [wide, narrow] of pairs.filter(([w, n]) => n < w)) {
      const beta = (Math.acos(narrow / wide) * 180) / Math.PI;
      for (const degrees of [180 - beta, 180, 180 + beta]) {
        const label = `${wide} m and ${narrow} m at ${degrees.toFixed(2)}°`;
        const before = cornersOf(junctionAt(wide, narrow, degrees - 1e-4));
        const after = startingNear(
          cornersOf(junctionAt(wide, narrow, degrees + 1e-4)),
          before[0],
        );

        expect(after.length, label).toBe(before.length);
        before.forEach((point, index) =>
          expect(distance(point, after[index]), label).toBeLessThan(0.01),
        );
      }
    }
  });
});
