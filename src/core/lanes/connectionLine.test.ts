import { describe, expect, it } from "vitest";
import { arcCircle } from "../geometry/arc";
import {
  lineDirectionAt,
  STRAIGHT,
  type Line,
  type PrimitiveLine,
} from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import type { JunctionOutline } from "../layout/outline";
import type { NodeId } from "../network/types";
import {
  connectionLine,
  curbsOf,
  RADIUS_TOLERANCE_METERS,
  type Curbs,
} from "./connectionLine";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

function straight(from: Vec2, to: Vec2): Line {
  return { from, to, geometry: STRAIGHT };
}

const origin = vec(0, 0);
const east = vec(1, 0);
const west = vec(-1, 0);
const north = vec(0, 1);

const NO_CURBS: Curbs = { pieces: [], corners: [] };

function expectAt(point: Vec2, x: number, z: number): void {
  expect(point.x).toBeCloseTo(x);
  expect(point.z).toBeCloseTo(z);
}

/** Which way a piece heads a fraction `t` along, as a unit vector. */
function headingAt(piece: PrimitiveLine, t: number): Vec2 {
  return lineDirectionAt(piece.from, piece.to, piece.geometry, t);
}

/** The circle an arc piece runs on, or a failure saying it is no arc. */
function circleOf(piece: PrimitiveLine): { center: Vec2; radius: number } {
  const circle =
    piece.geometry.kind === "arc"
      ? arcCircle(piece.from, piece.to, piece.geometry.via)
      : null;
  if (circle === null) {
    throw new Error("expected an arc");
  }
  return circle;
}

/**
 * The connection's pieces, checked to run from `exit` heading `h` to `entry`
 * heading `e`, each starting where the one before ends, in the heading it
 * ends in.
 */
function smoothPieces(
  exit: Vec2,
  h: Vec2,
  entry: Vec2,
  e: Vec2,
  curbs = NO_CURBS,
): readonly PrimitiveLine[] {
  const { pieces } = connectionLine(exit, h, entry, e, curbs);
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  expectAt(first.from, exit.x, exit.z);
  expectAt(headingAt(first, 0), h.x, h.z);
  expectAt(last.to, entry.x, entry.z);
  expectAt(headingAt(last, 1), e.x, e.z);

  for (let i = 1; i < pieces.length; i++) {
    const before = pieces[i - 1];
    const after = pieces[i];
    expectAt(after.from, before.to.x, before.to.z);
    const arriving = headingAt(before, 1);
    expectAt(headingAt(after, 0), arriving.x, arriving.z);
  }
  return pieces;
}

describe("curbsOf", () => {
  it("reads curb pieces off the ring, each from the point before, every point a corner", () => {
    const arc = { kind: "arc", via: vec(5, 2) } as const;
    const outline: JunctionOutline = {
      kind: "junction",
      node: 1 as NodeId,
      center: vec(2, 2),
      pieces: [
        // The first piece starts where the last one ends.
        { point: vec(0, 0), incomingGeometry: STRAIGHT, edge: "curb" },
        { point: vec(4, 0), incomingGeometry: STRAIGHT, edge: "roadwayEnd" },
        { point: vec(4, 4), incomingGeometry: arc, edge: "curb" },
        { point: vec(0, 4), incomingGeometry: STRAIGHT, edge: "roadwayEnd" },
      ],
    };

    expect(curbsOf(outline)).toEqual({
      pieces: [
        straight(vec(0, 4), vec(0, 0)),
        { from: vec(4, 0), to: vec(4, 4), geometry: arc },
      ],
      corners: [vec(0, 0), vec(4, 0), vec(4, 4), vec(0, 4)],
    });
  });
});

describe("connectionLine", () => {
  describe("lane lines crossing ahead of both lanes", () => {
    it("turns in one arc where both lane ends are as far from the corner", () => {
      // K at (10, 0): a = b = 10, a quarter turn → R = 10.
      const pieces = smoothPieces(origin, east, vec(10, 10), north);
      expect(pieces).toHaveLength(1);
      const { center, radius } = circleOf(pieces[0]);
      expectAt(center, 0, 10);
      expect(radius).toBeCloseTo(10);
    });

    it("goes straight on from the farther exit, then turns", () => {
      // K at (10, 0): a = 10, b = 4 → T = 4, straight on to (6, 0).
      const pieces = smoothPieces(origin, east, vec(10, 4), north);
      expect(pieces.map((piece) => piece.geometry.kind)).toEqual([
        "straight",
        "arc",
      ]);
      expectAt(pieces[0].to, 6, 0);
      expect(circleOf(pieces[1]).radius).toBeCloseTo(4);
    });

    it("turns, then goes straight on to the farther entry", () => {
      // K at (4, 0): a = 4, b = 10 → T = 4, straight on from (4, 4).
      const pieces = smoothPieces(origin, east, vec(4, 10), north);
      expect(pieces.map((piece) => piece.geometry.kind)).toEqual([
        "arc",
        "straight",
      ]);
      expectAt(pieces[1].from, 4, 4);
      expect(circleOf(pieces[0]).radius).toBeCloseTo(4);
    });

    it.each([30, 60, 120, 150, -60, -150])(
      "turns %i° as wide as the nearer lane end allows",
      (degrees) => {
        // K at (8, 0), the entry 5 past it: R = 5 / tan(|θ|/2).
        const radians = (degrees * Math.PI) / 180;
        const e = vec(Math.cos(radians), Math.sin(radians));
        const entry = vec(8 + 5 * e.x, 5 * e.z);
        const pieces = smoothPieces(origin, east, entry, e);
        const arcs = pieces.filter((piece) => piece.geometry.kind === "arc");
        expect(arcs).toHaveLength(1);
        expect(circleOf(arcs[0]).radius).toBeCloseTo(
          5 / Math.tan(Math.abs(radians) / 2),
        );
      },
    );
  });

  describe("keeping clear of the curbs", () => {
    // A quarter turn from east to +z, K = (−1.5, 1.5), both lane ends 18.5 m
    // from it → R_cap = 18.5. With R the arc's center is
    // M = (−1.5 − R, 1.5 + R), and its middle lies R·(√2 − 1) from K toward
    // the inside of the turn.
    const exit = vec(-20, 1.5);
    const entry = vec(-1.5, 20);

    /** The radius of the connection's one arc, among `curbs`. */
    function radiusAmong(curbs: Curbs): number {
      const pieces = smoothPieces(exit, east, entry, north, curbs);
      const arcs = pieces.filter((piece) => piece.geometry.kind === "arc");
      expect(arcs).toHaveLength(1);
      return circleOf(arcs[0]).radius;
    }

    /** `radius` at most the tolerance short of `limit`, and not over it. */
    function expectJustUnder(radius: number, limit: number): void {
      expect(radius).toBeLessThanOrEqual(limit + 1e-9);
      expect(radius).toBeGreaterThan(limit - RADIUS_TOLERANCE_METERS);
    }

    it("turns as wide as the inside corner allows", () => {
      // Curbs 2.5 m outside the lanes, meeting at C = (−4, 4), 2.5·√2 from K
      // on the arc's side. Clear while R·(√2 − 1) + c ≤ 2.5·√2, c = 1.5:
      // R* = (2.5·√2 − 1.5) / (√2 − 1) = 3.5 + √2
      const curbs: Curbs = {
        pieces: [
          straight(vec(-20, 4), vec(-4, 4)),
          straight(vec(-4, 4), vec(-4, 20)),
        ],
        corners: [vec(-20, 4), vec(-4, 4), vec(-4, 20)],
      };
      expectJustUnder(radiusAmong(curbs), 3.5 + Math.SQRT2);
    });

    it("keeps clear of a corner with no curb beside it", () => {
      // Where two roadway ends meet at C, the corner alone: the same R*.
      const curbs: Curbs = { pieces: [], corners: [vec(-4, 4)] };
      expectJustUnder(radiusAmong(curbs), 3.5 + Math.SQRT2);
    });

    it("turns past a side road, kept by the nearer of its corners", () => {
      // C₁ = (−8, 4) ends the exit's curb, C₂ = (−4, 12) starts the entry's,
      // the side road's mouth between them. A corner C is clear while
      // |M − C| ≤ R − c:
      //   C₁: R² − 15R + 46.25 ≤ 0  → R ≤ 7.5 + √10 ≈ 10.66
      //   C₂: R² − 23R + 114.25 ≤ 0 → R ≤ 15.74
      const curbs: Curbs = {
        pieces: [
          straight(vec(-20, 4), vec(-8, 4)),
          straight(vec(-4, 12), vec(-4, 20)),
        ],
        corners: [vec(-20, 4), vec(-8, 4), vec(-4, 12), vec(-4, 20)],
      };
      expectJustUnder(radiusAmong(curbs), 7.5 + Math.sqrt(10));
    });

    it("keeps clear of a curved curb", () => {
      // The corner rounded: a quarter circle about O = (−8, 8), radius 4.
      // Its point farthest from M lies on it, toward the turn → clear while
      // |M − O| + 4 ≤ R − c, with |M − O| = √2·(R − 6.5):
      // R* = (6.5·√2 − 5.5) / (√2 − 1) = 7.5 + √2
      const curbs: Curbs = {
        pieces: [
          straight(vec(-20, 4), vec(-8, 4)),
          {
            from: vec(-8, 4),
            to: vec(-4, 8),
            geometry: {
              kind: "arc",
              via: vec(-8 + 2 * Math.SQRT2, 8 - 2 * Math.SQRT2),
            },
          },
          straight(vec(-4, 8), vec(-4, 20)),
        ],
        corners: [vec(-20, 4), vec(-8, 4), vec(-4, 8), vec(-4, 20)],
      };
      expectJustUnder(radiusAmong(curbs), 7.5 + Math.SQRT2);
    });

    it("takes the whole room where the curbs are far", () => {
      const curbs: Curbs = { pieces: [], corners: [vec(-16, 16)] };
      expect(radiusAmong(curbs)).toBeCloseTo(18.5);
    });

    it("takes the whole room where no turn is clear", () => {
      // A corner 1 m beside the exit: every turn starts within c of it.
      const curbs: Curbs = { pieces: [], corners: [vec(-20, 0.5)] };
      expect(radiusAmong(curbs)).toBeCloseTo(18.5);
    });
  });

  describe("no corner ahead", () => {
    it("moves sideways in an S between parallel lane lines", () => {
      const pieces = smoothPieces(origin, east, vec(10, 3), east);
      expect(pieces.map((piece) => piece.geometry.kind)).toEqual([
        "arc",
        "arc",
      ]);
      expectAt(pieces[0].to, 5, 1.5);
    });

    it("turns back in a half circle onto the lane beside it", () => {
      // Left of east is −z, where the lane back lies.
      const pieces = smoothPieces(origin, east, vec(0, -3), west);
      expect(pieces).toHaveLength(2);
      for (const piece of pieces) {
        const { center, radius } = circleOf(piece);
        expectAt(center, 0, -1.5);
        expect(radius).toBeCloseTo(1.5);
      }
    });

    it("joins lane ends whose lines cross behind one of them", () => {
      // The entry's line, x = −2, crosses the exit's behind the exit.
      const pieces = smoothPieces(origin, east, vec(-2, 5), north);
      expect(pieces).toHaveLength(2);
    });
  });
});
