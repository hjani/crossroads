import { describe, expect, it } from "vitest";
import { Junction } from "./junctions";
import { RoadNetwork } from "../network/RoadNetwork";
import { STRAIGHT, type SectionId } from "../network/types";
import type { Vec2 } from "../geometry/points";

const WIDTH_METERS = 8;

function at(x: number, z: number): Vec2 {
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
    const road = network.addSection(at(0, 0), at(20, 0), STRAIGHT);

    const junction = new Junction(network, road.to, WIDTH_METERS);

    expect(junction.setbackOf(road.id)).toBe(0);
  });

  it("sets a straight join back by nothing", () => {
    const network = new RoadNetwork();
    const west = network.addSection(at(-20, 0), at(0, 0), STRAIGHT);
    const east = network.addSection(west.to, at(20, 0), STRAIGHT);

    const junction = new Junction(network, west.to, WIDTH_METERS);

    expect(junction.setbackOf(west.id)).toBeCloseTo(0);
    expect(junction.setbackOf(east.id)).toBeCloseTo(0);
  });

  it("sets both roads of a right-angle bend back by half the width", () => {
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), at(20, 0), STRAIGHT);
    const north = network.addSection(east.from, at(0, 20), STRAIGHT);

    const junction = new Junction(network, east.from, WIDTH_METERS);

    expect(junction.setbackOf(east.id)).toBeCloseTo(4);
    expect(junction.setbackOf(north.id)).toBeCloseTo(4);
  });

  it("sets each road of a skewed T back by the longer of its two gaps", () => {
    // East and west are one straight road; the branch leaves at 60°.
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), at(20, 0), STRAIGHT);
    const branch = network.addSection(
      east.from,
      at(10, 10 * Math.sqrt(3)),
      STRAIGHT,
    );
    const west = network.addSection(east.from, at(-20, 0), STRAIGHT);

    const junction = new Junction(network, east.from, WIDTH_METERS);

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

  it("sets a road back by no more than half its length", () => {
    const network = new RoadNetwork();
    const short = network.addSection(at(0, 0), at(6, 0), STRAIGHT);
    const long = network.addSection(short.from, at(0, 20), STRAIGHT);

    const junction = new Junction(network, short.from, WIDTH_METERS);

    expect(junction.setbackOf(short.id)).toBeCloseTo(3);
    expect(junction.setbackOf(long.id)).toBeCloseTo(4);
  });

  it("doesn't set back two roads leaving the same way", () => {
    const network = new RoadNetwork();
    const short = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    const long = network.addSection(short.from, at(20, 0), STRAIGHT);

    const junction = new Junction(network, short.from, WIDTH_METERS);

    expect(junction.setbackOf(short.id)).toBe(0);
    expect(junction.setbackOf(long.id)).toBe(0);
  });

  it("sets a straight and an arc bending away from it back", () => {
    // East straight; the arc leaves north and bends west, around O = (−R, 0).
    const R = 20;
    const center = at(-R, 0);
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), at(40, 0), STRAIGHT);
    const arc = network.addSection(
      east.from,
      onCircle(center, R, Math.PI / 2),
      { kind: "arc", via: onCircle(center, R, Math.PI / 4) },
    );

    const junction = new Junction(network, east.from, WIDTH_METERS);

    // Straight edge z = w/2; the arc's outer edge, radius R + w/2, around O.
    // They cross at P = (h − R, w/2), with h² = (R + w/2)² − (w/2)² = R² + Rw.
    // Straight: s = P.x. Arc: s = R·θ, θ the angle at O between N and P.
    const h = Math.sqrt(R * R + R * WIDTH_METERS);
    expect(junction.setbackOf(east.id)).toBeCloseTo(h - R);
    expect(junction.setbackOf(arc.id)).toBeCloseTo(
      R * Math.atan2(WIDTH_METERS / 2, h),
    );
  });

  it("sets two arcs bending away from each other back alike", () => {
    // Mirror images across the line x = z: one leaves east and bends south,
    // around (0, −R); the other leaves north and bends west, around (−R, 0).
    const R = 20;
    const southCenter = at(0, -R);
    const westCenter = at(-R, 0);
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), onCircle(southCenter, R, 0), {
      kind: "arc",
      via: onCircle(southCenter, R, Math.PI / 4),
    });
    const north = network.addSection(
      east.from,
      onCircle(westCenter, R, Math.PI / 2),
      { kind: "arc", via: onCircle(westCenter, R, Math.PI / 4) },
    );

    const junction = new Junction(network, east.from, WIDTH_METERS);

    // Both outer edges, radius r = R + w/2, cross on x = z at P = (x, x):
    //   (x + R)² + x² = r²  →  x = (√(2r² − R²) − R) / 2
    // Seen from (0, −R), N is straight up and P at (x, R + x):
    //   s = R·atan2(x, R + x)
    const r = R + WIDTH_METERS / 2;
    const x = (Math.sqrt(2 * r * r - R * R) - R) / 2;
    const expected = R * Math.atan2(x, R + x);
    expect(junction.setbackOf(east.id)).toBeCloseTo(expected);
    expect(junction.setbackOf(north.id)).toBeCloseTo(expected);
  });

  it("sets a straight and an arc just short of in line back by almost nothing", () => {
    // The straight leaves west, tilted a milliradian south; the arc leaves
    // east and bends south, into the gap, around (0, −R).
    const R = 20;
    const center = at(0, -R);
    const network = new RoadNetwork();
    const west = network.addSection(at(0, 0), at(-20, -0.02), STRAIGHT);
    const arc = network.addSection(west.from, onCircle(center, R, 0), {
      kind: "arc",
      via: onCircle(center, R, Math.PI / 4),
    });

    const junction = new Junction(network, west.from, WIDTH_METERS);

    for (const id of [west.id, arc.id]) {
      expect(junction.setbackOf(id)).toBeGreaterThan(0);
      expect(junction.setbackOf(id)).toBeLessThan(0.05);
    }
  });

  it("doesn't set back an arc too tight for its inner edge", () => {
    // The arc leaves north and bends east, into the gap, with R < w/2.
    const R = 3;
    const center = at(R, 0);
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), at(20, 0), STRAIGHT);
    const arc = network.addSection(
      east.from,
      onCircle(center, R, Math.PI / 2),
      { kind: "arc", via: onCircle(center, R, (3 * Math.PI) / 4) },
    );

    const junction = new Junction(network, east.from, WIDTH_METERS);

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
      const center = at(0, side * R);
      const network = new RoadNetwork();
      const east = network.addSection(at(0, 0), at(40, 0), STRAIGHT);
      const arc = network.addSection(east.from, at(0, 2 * side * R), {
        kind: "arc",
        via: onCircle(center, R, 0),
      });

      const junction = new Junction(network, east.from, WIDTH_METERS);

      // The straight's edge z = side·w/2 and the arc's outer edge, radius
      // R + w/2, cross at P = (x, side·w/2):
      //   x² = (R + w/2)² − (R − w/2)² = 2Rw
      // Straight: s = x. Arc: seen from its center, N is at (0, −side·R) and
      // P at (x, −side·(R − w/2)) → s = R·atan2(x, R − w/2).
      const x = Math.sqrt(2 * R * WIDTH_METERS);
      expect(junction.setbackOf(east.id)).toBeCloseTo(x);
      expect(junction.setbackOf(arc.id)).toBeCloseTo(
        R * Math.atan2(x, R - WIDTH_METERS / 2),
      );
    });
  }

  it("throws for a section not meeting the node", () => {
    const network = new RoadNetwork();
    const road = network.addSection(at(0, 0), at(20, 0), STRAIGHT);

    const junction = new Junction(network, road.from, WIDTH_METERS);

    expect(() => junction.setbackOf(99 as SectionId)).toThrow();
  });
});
