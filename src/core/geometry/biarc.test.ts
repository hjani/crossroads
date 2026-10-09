import { describe, expect, it } from "vitest";
import { arcCircle, arcDirectionAt } from "./arc";
import { biarcBetween, type Biarc } from "./biarc";
import { STRAIGHT, type LineGeometry } from "./lineGeometry";
import { unitDirection, type Vec2 } from "./point";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

const origin = vec(0, 0);
const east = vec(1, 0);
const west = vec(-1, 0);
const north = vec(0, 1);

function expectAt(point: Vec2, x: number, z: number): void {
  expect(point.x).toBeCloseTo(x);
  expect(point.z).toBeCloseTo(z);
}

/** The biarc, or a failure saying so rather than one about null. */
function biarcOf(from: Vec2, leaving: Vec2, to: Vec2, arriving: Vec2): Biarc {
  const biarc = biarcBetween(from, leaving, to, arriving);
  if (biarc === null) {
    throw new Error("expected a biarc");
  }
  return biarc;
}

function radiusOf(from: Vec2, to: Vec2, geometry: LineGeometry): number {
  const circle =
    geometry.kind === "arc" ? arcCircle(from, to, geometry.via) : null;
  if (circle === null) {
    throw new Error("expected an arc");
  }
  return circle.radius;
}

/** Which way a piece heads a fraction `t` along, as a unit vector. */
function headingAt(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
  t: number,
): Vec2 {
  return geometry.kind === "arc"
    ? arcDirectionAt(from, to, geometry.via, t)
    : unitDirection(from, to);
}

describe("biarcBetween", () => {
  it("joins a symmetric S-curve at its center, two equal arcs", () => {
    const to = vec(40, 20);
    const { join, first, second } = biarcOf(origin, east, to, east);
    expectAt(join, 20, 10);
    expect(radiusOf(origin, join, first)).toBeCloseTo(25);
    expect(radiusOf(join, to, second)).toBeCloseTo(25);
  });

  it("puts the join on the midpoint of the two corners", () => {
    // d from 2c·d² + 2(v·t)·d − |v|² = 0, with c = 1, v·t = 60, |v|² = 2000.
    const to = vec(40, 20);
    const d = (Math.sqrt(7600) - 60) / 2;
    const { join, first, second } = biarcOf(origin, east, to, north);
    expectAt(join, (d + 40) / 2, (20 - d) / 2);
    expect(radiusOf(origin, join, first)).toBeCloseTo(113.6, 0);
    expect(radiusOf(join, to, second)).toBeCloseTo(17.3, 0);
  });

  it("leaves and arrives in the directions asked for, smooth at the join", () => {
    const to = vec(40, 20);
    const { join, first, second } = biarcOf(origin, east, to, north);
    expectAt(headingAt(origin, join, first, 0), 1, 0);
    expectAt(headingAt(join, to, second, 1), 0, 1);
    const atJoin = headingAt(join, to, second, 0);
    expectAt(headingAt(origin, join, first, 1), atJoin.x, atJoin.z);
  });

  it("makes a U-turn a half circle, joined halfway", () => {
    const to = vec(0, 20);
    const { join, first, second } = biarcOf(origin, east, to, west);
    expectAt(join, 10, 10);
    expect(radiusOf(origin, join, first)).toBeCloseTo(10);
    expect(radiusOf(join, to, second)).toBeCloseTo(10);
  });

  it("is a straight in two pieces for an end straight ahead", () => {
    const biarc = biarcOf(origin, east, vec(40, 0), east);
    expectAt(biarc.join, 20, 0);
    expect(biarc.first).toBe(STRAIGHT);
    expect(biarc.second).toBe(STRAIGHT);
  });

  it("is the same biarc reversed, its pieces swapped", () => {
    const to = vec(40, 20);
    const forward = biarcOf(origin, east, to, north);
    const backward = biarcOf(to, vec(0, -1), origin, west);
    expectAt(backward.join, forward.join.x, forward.join.z);
    if (forward.second.kind !== "arc" || backward.first.kind !== "arc") {
      throw new Error("expected arcs");
    }
    expectAt(backward.first.via, forward.second.via.x, forward.second.via.z);
  });

  it("does not depend on the directions' lengths", () => {
    const to = vec(40, 20);
    const unit = biarcOf(origin, east, to, north);
    const scaled = biarcOf(origin, vec(5, 0), to, vec(0, 0.1));
    expectAt(scaled.join, unit.join.x, unit.join.z);
  });

  it("is null for the same heading with the end behind or level", () => {
    expect(biarcBetween(origin, east, vec(-10, 5), east)).toBeNull();
    expect(biarcBetween(origin, east, vec(0, 10), east)).toBeNull();
  });

  it("is null when the ends are the same point", () => {
    expect(biarcBetween(origin, east, origin, north)).toBeNull();
  });

  it("is null for a zero direction", () => {
    expect(biarcBetween(origin, vec(0, 0), vec(40, 20), north)).toBeNull();
  });
});
