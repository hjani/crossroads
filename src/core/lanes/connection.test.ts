import { describe, expect, it } from "vitest";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import type { SectionId } from "../network/types";
import {
  connectionsBetween,
  type Connection,
  type TurnKind,
} from "./connection";
import type { Lane } from "./lane";

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

function connect(...roads: RoadLanes[]): Connection[] {
  return connectionsBetween(
    roads.flatMap((r) => r.incoming),
    roads.flatMap((r) => r.outgoing),
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
    );

    expect(pairs(connections, A, B)).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});
