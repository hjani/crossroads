import { describe, expect, it } from "vitest";
import { arcCircle, arcDirectionAt } from "./arc";
import {
  biarcBetween,
  biarcDirectionAt,
  biarcFractionAt,
  biarcLength,
  isBiarcValid,
  nearestPointOnBiarc,
  pointOnBiarc,
  subBiarc,
  trimBiarc,
  type Biarc,
} from "./biarc";
import {
  lineCrossings,
  lineLength,
  nearestPointsBetweenLines,
  STRAIGHT,
  type LineGeometry,
} from "./lineGeometry";
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

describe("isBiarcValid", () => {
  it("accepts what biarcBetween makes", () => {
    const to = vec(40, 20);
    expect(isBiarcValid(origin, to, biarcOf(origin, east, to, north))).toBe(
      true,
    );
  });

  it("refuses a join on an end, or within a centimeter of one", () => {
    const to = vec(40, 0);
    const pieces = { first: STRAIGHT, second: STRAIGHT };
    expect(isBiarcValid(origin, to, { join: origin, ...pieces })).toBe(false);
    expect(isBiarcValid(origin, to, { join: vec(39.995, 0), ...pieces })).toBe(
      false,
    );
  });

  it("refuses a piece that is no arc", () => {
    const biarc: Biarc = {
      join: vec(20, 0),
      first: { kind: "arc", via: vec(10, 0) },
      second: STRAIGHT,
    };
    expect(isBiarcValid(origin, vec(40, 0), biarc)).toBe(false);
  });

  it("accepts a kink at the join: tangency is not checked", () => {
    const biarc: Biarc = {
      join: vec(20, 0),
      first: STRAIGHT,
      second: STRAIGHT,
    };
    expect(isBiarcValid(origin, vec(20, 20), biarc)).toBe(true);
  });
});

describe("biarcLength", () => {
  it("adds up both pieces", () => {
    const to = vec(0, 20);
    const uTurn = biarcOf(origin, east, to, west);
    expect(biarcLength(origin, to, uTurn)).toBeCloseTo(10 * Math.PI);
  });

  it("is the distance for a straight in two pieces", () => {
    const to = vec(40, 0);
    expect(biarcLength(origin, to, biarcOf(origin, east, to, east))).toBe(40);
  });
});

describe("along a biarc", () => {
  // A U-turn around (0, 10), radius 10: two quarter circles of the same
  // length, so the join at (10, 10) is halfway.
  const to = vec(0, 20);
  const uTurn = biarcOf(origin, east, to, west);
  const uTurnGeometry: LineGeometry = { kind: "biarc", biarc: uTurn };
  const diagonal = 10 * Math.SQRT1_2;

  it("finds a point on either piece by length", () => {
    expectAt(pointOnBiarc(origin, to, uTurn, 0.25), diagonal, 10 - diagonal);
    expectAt(pointOnBiarc(origin, to, uTurn, 0.5), 10, 10);
    expectAt(pointOnBiarc(origin, to, uTurn, 0.75), diagonal, 10 + diagonal);
  });

  it("heads the way each piece runs", () => {
    expectAt(biarcDirectionAt(origin, to, uTurn, 0), 1, 0);
    expectAt(biarcDirectionAt(origin, to, uTurn, 0.5), 0, 1);
    expectAt(biarcDirectionAt(origin, to, uTurn, 1), -1, 0);
  });

  it("reads a place off the curve on the piece nearest it", () => {
    // Out from the center, past each quarter's middle and past the join.
    expect(biarcFractionAt(origin, to, uTurn, vec(20, -10))).toBeCloseTo(0.25);
    expect(biarcFractionAt(origin, to, uTurn, vec(20, 10))).toBeCloseTo(0.5);
    expect(biarcFractionAt(origin, to, uTurn, vec(20, 30))).toBeCloseTo(0.75);
  });

  it("puts the join where the first piece's share of the length ends", () => {
    const end = vec(40, 20);
    const biarc = biarcOf(origin, east, end, north);
    const m =
      lineLength(origin, biarc.join, biarc.first) /
      biarcLength(origin, end, biarc);
    expect(m).not.toBeCloseTo(0.5);
    expectAt(pointOnBiarc(origin, end, biarc, m), biarc.join.x, biarc.join.z);
    expect(biarcFractionAt(origin, end, biarc, biarc.join)).toBeCloseTo(m);
  });

  it("finds the nearest point on either piece, or an end", () => {
    expectAt(nearestPointOnBiarc(origin, to, uTurn, vec(20, 10)), 10, 10);
    expectAt(nearestPointOnBiarc(origin, to, uTurn, vec(-5, 25)), 0, 20);
  });

  it("is crossed on each piece, measured along the whole", () => {
    // x = 5 meets the circle 60° either side of the join.
    const along = lineCrossings(
      origin,
      to,
      uTurnGeometry,
      vec(5, -5),
      vec(5, 25),
      STRAIGHT,
    )
      .map((crossing) => crossing.alongA)
      .sort((a, b) => a - b);
    expect(along).toHaveLength(2);
    expect(along[0]).toBeCloseTo(1 / 6);
    expect(along[1]).toBeCloseTo(5 / 6);
  });

  it("is crossed the same, asked from the other line's side", () => {
    const crossings = lineCrossings(
      vec(5, -5),
      vec(5, 25),
      STRAIGHT,
      origin,
      to,
      uTurnGeometry,
    ).sort((a, b) => a.alongA - b.alongA);
    expect(crossings).toHaveLength(2);
    expect(crossings[0].alongA).toBeCloseTo((15 - Math.sqrt(75)) / 30);
    expect(crossings[0].alongB).toBeCloseTo(1 / 6);
    expect(crossings[1].alongA).toBeCloseTo((15 + Math.sqrt(75)) / 30);
    expect(crossings[1].alongB).toBeCloseTo(5 / 6);
  });

  it("finds the nearest points to another line, from either side", () => {
    // x = 20, level with the join.
    const beside = [vec(20, 0), vec(20, 20)] as const;
    const [onBiarc, onLine] = nearestPointsBetweenLines(
      origin,
      to,
      uTurnGeometry,
      ...beside,
      STRAIGHT,
    );
    expectAt(onBiarc, 10, 10);
    expectAt(onLine, 20, 10);

    const [lineFirst, biarcSecond] = nearestPointsBetweenLines(
      ...beside,
      STRAIGHT,
      origin,
      to,
      uTurnGeometry,
    );
    expectAt(lineFirst, 20, 10);
    expectAt(biarcSecond, 10, 10);
  });
});

describe("subBiarc", () => {
  // The U-turn around (0, 10), radius 10, joined at (10, 10).
  const to = vec(0, 20);
  const uTurn = biarcOf(origin, east, to, west);
  const join = vec(10, 10);

  /** The place `degrees` round the U-turn from its start. */
  function round(degrees: number): Vec2 {
    const angle = (degrees * Math.PI) / 180;
    return vec(10 * Math.sin(angle), 10 - 10 * Math.cos(angle));
  }

  /** Fails unless the piece is an arc on the U-turn's own circle. */
  function expectOnUTurn(from: Vec2, to: Vec2, geometry: LineGeometry): void {
    const circle =
      geometry.kind === "arc" ? arcCircle(from, to, geometry.via) : null;
    if (circle === null) {
      throw new Error("expected an arc");
    }
    expectAt(circle.center, 0, 10);
    expect(circle.radius).toBeCloseTo(10);
  }

  /** The biarc, or a failure saying so. */
  function asBiarc(geometry: LineGeometry): Biarc {
    if (geometry.kind !== "biarc") {
      throw new Error("expected a biarc");
    }
    return geometry.biarc;
  }

  it("is an arc on the same circle for a part on one piece", () => {
    const part = subBiarc(origin, to, uTurn, round(30), round(60));
    expectOnUTurn(round(30), round(60), part);
  });

  it("is a biarc keeping the join for a part across it", () => {
    const part = asBiarc(subBiarc(origin, to, uTurn, round(30), round(135)));
    expectAt(part.join, 10, 10);
    expectOnUTurn(round(30), part.join, part.first);
    expectOnUTurn(part.join, round(135), part.second);
  });

  it("is the biarc as it was for the whole of it", () => {
    const whole = asBiarc(subBiarc(origin, to, uTurn, origin, to));
    expectAt(whole.join, 10, 10);
    expectOnUTurn(origin, whole.join, whole.first);
    expectOnUTurn(whole.join, to, whole.second);
  });

  it("is one piece's part for a part ending at the join", () => {
    const part = subBiarc(origin, to, uTurn, round(30), join);
    expectOnUTurn(round(30), join, part);
  });

  it("counts a place within a centimeter of the join as the join", () => {
    expect(subBiarc(origin, to, uTurn, round(30), vec(10, 9.995)).kind).toBe(
      "arc",
    );
    expect(subBiarc(origin, to, uTurn, vec(10, 10.005), round(135)).kind).toBe(
      "arc",
    );
  });
});

describe("trimBiarc", () => {
  // Two arcs of different radii: 113.6 m, then 17.3 m.
  const end = vec(40, 20);
  const biarc = biarcOf(origin, east, end, north);
  const firstLength = lineLength(origin, biarc.join, biarc.first);
  const secondLength = lineLength(biarc.join, end, biarc.second);
  const length = firstLength + secondLength;

  it("cuts each piece at its own end, keeping the join", () => {
    const trimmed = trimBiarc(origin, end, biarc, 1, 1);
    expect(trimmed.geometry.kind).toBe("biarc");
    expect(lineLength(trimmed.from, trimmed.to, trimmed.geometry)).toBeCloseTo(
      length - 2,
    );
  });

  it("drops the first piece for a cut longer than it, the rest off the second", () => {
    const s1 = firstLength + 2;
    const trimmed = trimBiarc(origin, end, biarc, s1, 0);
    const start = pointOnBiarc(origin, end, biarc, s1 / length);
    expectAt(trimmed.from, start.x, start.z);
    expectAt(trimmed.to, end.x, end.z);
    expect(radiusOf(trimmed.from, trimmed.to, trimmed.geometry)).toBeCloseTo(
      17.3,
      1,
    );
  });

  it("drops the second piece for a cut longer than it, the rest off the first", () => {
    const s2 = secondLength + 2;
    const trimmed = trimBiarc(origin, end, biarc, 0, s2);
    const stop = pointOnBiarc(origin, end, biarc, (length - s2) / length);
    expectAt(trimmed.from, 0, 0);
    expectAt(trimmed.to, stop.x, stop.z);
    expect(radiusOf(trimmed.from, trimmed.to, trimmed.geometry)).toBeCloseTo(
      113.6,
      1,
    );
  });
});
