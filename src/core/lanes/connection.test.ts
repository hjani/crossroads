import { describe, expect, it } from "vitest";
import { arcCircle } from "../geometry/arc";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import type { JunctionOutline, OutlineEdgeKind } from "../layout/outline";
import type { NodeId, SectionId } from "../network/types";
import {
  connectionsBetween,
  type Connection,
  type TurnKind,
} from "./connection";
import { RADIUS_TOLERANCE_METERS } from "./connectionLine";
import { LANE_WIDTH_METERS, type Lane } from "./lane";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

const A = 1 as SectionId;
const B = 2 as SectionId;
const C = 3 as SectionId;
const D = 4 as SectionId;

interface RoadLanes {
  readonly incoming: Lane[];
  readonly outgoing: Lane[];
}

/**
 * The lanes of a straight road meeting the node at the origin, leaving it
 * `degrees` from +x toward +z: `n` running in, `n` running out. Only their
 * headings matter here, so all lie on the road's centerline.
 */
function road(section: SectionId, degrees: number, n = 1): RoadLanes {
  const radians = (degrees * Math.PI) / 180;
  const near = vec(5 * Math.cos(radians), 5 * Math.sin(radians));
  const far = vec(20 * Math.cos(radians), 20 * Math.sin(radians));
  const lanes = (sign: number, from: Vec2, to: Vec2): Lane[] =>
    Array.from({ length: n }, (_, i) => ({
      id: { section, index: sign * (i + 1) },
      centerline: { from, to, geometry: STRAIGHT },
    }));
  return { incoming: lanes(1, far, near), outgoing: lanes(-1, near, far) };
}

/**
 * A junction with no outline, so nothing to keep clear of: these tests are
 * about which lanes connect, not the shapes between them.
 */
const NO_OUTLINE: JunctionOutline = {
  kind: "junction",
  node: 1 as NodeId,
  center: vec(0, 0),
  pieces: [],
};

function connect(...roads: RoadLanes[]): Connection[] {
  return connectionsBetween(
    roads.flatMap((r) => r.incoming),
    roads.flatMap((r) => r.outgoing),
    NO_OUTLINE,
  );
}

/** The connections from road `a` into road `b`. */
function between(
  connections: readonly Connection[],
  a: SectionId,
  b: SectionId,
): Connection[] {
  return connections.filter(
    (c) => c.incoming.id.section === a && c.outgoing.id.section === b,
  );
}

/** The turn of every connection from road `a` into road `b`. */
function turns(
  connections: readonly Connection[],
  a: SectionId,
  b: SectionId,
): TurnKind[] {
  return between(connections, a, b).map((c) => c.turn);
}

/** The lane numbers `[i, j]` of every connection from road `a` into road `b`. */
function pairs(
  connections: readonly Connection[],
  a: SectionId,
  b: SectionId,
): number[][] {
  return between(connections, a, b).map((c) => [
    Math.abs(c.incoming.id.index),
    Math.abs(c.outgoing.id.index),
  ]);
}

describe("connectionsBetween", () => {
  it("turns a dead end back onto itself", () => {
    const connections = connect(road(A, 180));

    expect(connections).toHaveLength(1);
    expect(turns(connections, A, A)).toEqual(["uTurn"]);
  });

  it("goes straight on across a 180° join, both ways", () => {
    const connections = connect(road(A, 180), road(B, 0));

    expect(connections).toHaveLength(2);
    expect(turns(connections, A, B)).toEqual(["straight"]);
    expect(turns(connections, B, A)).toEqual(["straight"]);
  });

  it("turns back onto its own road only at a dead end", () => {
    const connections = connect(road(A, 180), road(B, 0), road(C, 90));

    expect(
      connections.filter(
        (c) => c.incoming.id.section === c.outgoing.id.section,
      ),
    ).toEqual([]);
  });

  it("turns right toward the right of the way in, left toward its left", () => {
    // A T: in from A heading +x, whose right is +z → C lies to the right.
    const connections = connect(road(A, 180), road(B, 0), road(C, 90));

    expect(turns(connections, A, B)).toEqual(["straight"]);
    expect(turns(connections, A, C)).toEqual(["right"]);
    expect(turns(connections, B, C)).toEqual(["left"]);
    expect(turns(connections, C, A)).toEqual(["left"]);
    expect(turns(connections, C, B)).toEqual(["right"]);
  });

  it("pairs the opposite roads of a four-way cross", () => {
    const connections = connect(
      road(A, 180),
      road(B, 0),
      road(C, 90),
      road(D, 270),
    );

    expect(connections).toHaveLength(12);
    expect(turns(connections, A, B)).toEqual(["straight"]);
    expect(turns(connections, C, D)).toEqual(["straight"]);
    expect(turns(connections, D, C)).toEqual(["straight"]);
    expect(turns(connections, A, D)).toEqual(["left"]);
  });

  it("has no straight on past the limit", () => {
    // A 45° bend.
    const connections = connect(road(A, 180), road(B, 45));

    expect(turns(connections, A, B)).toEqual(["right"]);
    expect(turns(connections, B, A)).toEqual(["left"]);
  });

  it("goes straight on only between roads that pick each other", () => {
    // D–B nearly one road, a 10° bend; A joins 30° off D. A picks B (20°),
    // but B picks D (10°).
    const connections = connect(road(A, 180), road(B, 20), road(D, 210));

    expect(turns(connections, B, D)).toEqual(["straight"]);
    expect(turns(connections, D, B)).toEqual(["straight"]);
    expect(turns(connections, A, B)).toEqual(["right"]);
    expect(turns(connections, B, A)).toEqual(["left"]);
  });

  it("has no straight on where two roads tie for it", () => {
    // A mirrored fork, its branches a hair apart.
    const connections = connect(road(A, 180), road(B, 20), road(C, -20 - 1e-8));

    expect(turns(connections, A, B)).toEqual(["right"]);
    expect(turns(connections, A, C)).toEqual(["left"]);
  });

  it("joins the lanes of a 180° join side by side, each turning as its road does", () => {
    const connections = connect(road(A, 180, 2), road(B, 0, 2));

    expect(connections).toHaveLength(4);
    expect(pairs(connections, A, B)).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(pairs(connections, B, A)).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(turns(connections, A, B)).toEqual(["straight", "straight"]);
  });

  it("turns a 2-lane dead end back lane for lane", () => {
    const connections = connect(road(A, 180, 2));

    expect(pairs(connections, A, A)).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("merges 3 lanes into 2 where two roads meet, and splits them back", () => {
    const connections = connect(road(A, 180, 3), road(B, 0, 2));

    expect(pairs(connections, A, B)).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
    ]);
    expect(pairs(connections, B, A)).toEqual([
      [1, 1],
      [2, 2],
      [2, 3],
    ]);
  });

  it("gives every turn of a 2-lane cross both lanes, lane for lane", () => {
    const connections = connect(
      road(A, 180, 2),
      road(B, 0, 2),
      road(C, 90, 2),
      road(D, 270, 2),
    );

    expect(connections).toHaveLength(24);
    for (const b of [B, C, D]) {
      expect(pairs(connections, A, b)).toEqual([
        [1, 1],
        [2, 2],
      ]);
    }
  });

  it("pairs lanes by number, whatever order they come in", () => {
    const a = road(A, 180, 2);
    const b = road(B, 0, 2);
    const connections = connectionsBetween(
      [...a.incoming, ...b.incoming].reverse(),
      [...a.outgoing, ...b.outgoing].reverse(),
      NO_OUTLINE,
    );

    expect(pairs(connections, A, B)).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});

describe("connectionsBetween, lanes side by side", () => {
  /** Lane `index` of `section`, straight from `from` to `to`. */
  function lane(section: SectionId, index: number, from: Vec2, to: Vec2): Lane {
    return {
      id: { section, index },
      centerline: { from, to, geometry: STRAIGHT },
    };
  }

  /**
   * A junction's ring of straight stretches: each one's end point and what it
   * borders, the first starting where the last ends.
   */
  function ring(
    stretches: readonly (readonly [Vec2, OutlineEdgeKind])[],
  ): JunctionOutline {
    return {
      kind: "junction",
      node: 1 as NodeId,
      center: vec(0, 0),
      pieces: stretches.map(([point, edge]) => ({
        point,
        incomingGeometry: STRAIGHT,
        edge,
      })),
    };
  }

  /** The circle of a connection's one arc. */
  function arcOf({ centerline }: Connection): { center: Vec2; radius: number } {
    const arcs = centerline.pieces.filter(
      (piece) => piece.geometry.kind === "arc",
    );
    expect(arcs).toHaveLength(1);
    const [{ from, to, geometry }] = arcs;
    const circle =
      geometry.kind === "arc" ? arcCircle(from, to, geometry.via) : null;
    if (circle === null) {
      throw new Error("expected an arc");
    }
    return circle;
  }

  function expectAt(point: Vec2, at: Vec2): void {
    expect(point.x).toBeCloseTo(at.x);
    expect(point.z).toBeCloseTo(at.z);
  }

  /** `radius` at most the search's tolerance short of `limit`. */
  function expectJustUnder(radius: number, limit: number): void {
    expect(radius).toBeLessThanOrEqual(limit + 1e-9);
    expect(radius).toBeGreaterThan(limit - RADIUS_TOLERANCE_METERS);
  }

  it("turns right as one shape, the outer lane moved a lane width out", () => {
    // In along +x, out along +z, two 16 m roads, the lane ends set far back.
    // Curbs 8 m out meet at C = (−8, 8), 3.5 m beside lane 2, the inner one:
    // its limit (3.5·√2 − c)/(√2 − 1) = 5.5 + 2√2 (`connectionLine` tests).
    // Lane 1 alone would get its R_cap, 18.5.
    const connections = connectionsBetween(
      [
        lane(A, 1, vec(-40, 1.5), vec(-20, 1.5)),
        lane(A, 2, vec(-40, 4.5), vec(-20, 4.5)),
      ],
      [
        lane(B, 1, vec(-1.5, 20), vec(-1.5, 40)),
        lane(B, 2, vec(-4.5, 20), vec(-4.5, 40)),
      ],
      ring([
        [vec(-20, 8), "roadwayEnd"],
        [vec(-8, 8), "curb"],
        [vec(-8, 20), "curb"],
        [vec(8, 20), "roadwayEnd"],
        [vec(8, -8), "curb"],
        [vec(-20, -8), "curb"],
      ]),
    );

    expect(pairs(connections, A, B)).toEqual([
      [1, 1],
      [2, 2],
    ]);
    const [outer, inner] = connections.map(arcOf);
    expectJustUnder(inner.radius, 5.5 + 2 * Math.SQRT2);
    expect(outer.radius - inner.radius).toBeCloseTo(LANE_WIDTH_METERS);
    expectAt(outer.center, inner.center);
  });

  it("turns left as one shape round the other side, lane 1 the inner one", () => {
    // In along +x, out along −z, the left of +x. Curbs 8 m out meet at
    // C = (−8, −8), 9.5 m beside lane 1: its limit
    // (9.5·√2 − c)/(√2 − 1) = 17.5 + 8√2, under its R_cap of 41.5.
    const connections = connectionsBetween(
      [
        lane(A, 1, vec(-60, 1.5), vec(-40, 1.5)),
        lane(A, 2, vec(-60, 4.5), vec(-40, 4.5)),
      ],
      [
        lane(C, 1, vec(1.5, -40), vec(1.5, -60)),
        lane(C, 2, vec(4.5, -40), vec(4.5, -60)),
      ],
      ring([
        [vec(-40, -8), "roadwayEnd"],
        [vec(-8, -8), "curb"],
        [vec(-8, -40), "curb"],
        [vec(8, -40), "roadwayEnd"],
        [vec(8, 8), "curb"],
        [vec(-40, 8), "curb"],
      ]),
    );

    expect(turns(connections, A, C)).toEqual(["left", "left"]);
    const [inner, outer] = connections.map(arcOf);
    expectJustUnder(inner.radius, 17.5 + 8 * Math.SQRT2);
    expect(outer.radius - inner.radius).toBeCloseTo(LANE_WIDTH_METERS);
    expectAt(outer.center, inner.center);
  });

  it("shapes the extra lane of a merge on its own", () => {
    // 3 lanes into 2, straight on: 1→1 and 2→2 side by side, 3→2 alone.
    // Moved from 2→2, it would end a lane width past lane 2's entry.
    const at = (i: number) => (i - 0.5) * LANE_WIDTH_METERS;
    const connections = connectionsBetween(
      [1, 2, 3].map((i) => lane(A, i, vec(-20, at(i)), vec(-2, at(i)))),
      [1, 2].map((j) => lane(B, j, vec(8, at(j)), vec(20, at(j)))),
      NO_OUTLINE,
    );

    expect(pairs(connections, A, B)).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
    ]);
    for (const { incoming, outgoing, centerline } of connections) {
      const { pieces } = centerline;
      expectAt(pieces[0].from, incoming.centerline.to);
      expectAt(pieces[pieces.length - 1].to, outgoing.centerline.from);
    }
  });
});
