import { describe, expect, it } from "vitest";
import { Junction } from "./junction";
import { RoadNetwork } from "../network/RoadNetwork";
import { STRAIGHT } from "../geometry/lineGeometry";
import { type SectionId } from "../network/types";
import { distance, type Vec2 } from "../geometry/point";
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
    // the 150° gap goes round the circle of radius r: the wider road's edge
    // only touches it, the narrower one's crosses it √(r² − d²) along.
    const { junction, wide, narrow } = wideAndNarrow((5 * Math.PI) / 6);

    expect(junction.setbackOf(wide)).toBeCloseTo(0);
    expect(junction.setbackOf(narrow)).toBeCloseTo(Math.sqrt(48));
  });

  it("doesn't jump where a gap turns from corner to round", () => {
    // Either side of 120°: the corner's setbacks (d + r·cos ψ)/sin ψ → 0 and
    // (r + d·cos ψ)/sin ψ → √(r² − d²), the round join's.
    const corner = wideAndNarrow((2 * Math.PI) / 3 - 1e-6);
    const round = wideAndNarrow((2 * Math.PI) / 3 + 1e-6);

    for (const { junction, wide, narrow } of [corner, round]) {
      expect(junction.setbackOf(wide)).toBeCloseTo(0);
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

  it("rounds a bend between two widths off with the wider road's circle", () => {
    // A 16 m road east, an 8 m one north. The narrow gap's corner is (4, 8):
    // east set back 4, north 8. The 270° gap goes round the circle of radius
    // 8: from where north's edge x = −4 crosses it, at (−4, √48) — 120°
    // round — to where east's edge touches it at (0, −8) — 270° round —
    // through the angle halfway between, 195°.
    const network = new RoadNetwork();
    const east = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT, 16);
    network.addSection(east.from, vec(0, 20), STRAIGHT, 8);

    const junction = new Junction(network, east.from);

    expectPoints(cornersOf(junction), [
      vec(4, 8),
      vec(-4, 8),
      vec(-4, Math.sqrt(48)),
      vec(0, -8),
      vec(4, -8),
    ]);
    expectPoints(viasOf(junction), [
      onCircle(vec(0, 0), 8, (195 * Math.PI) / 180),
    ]);
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
