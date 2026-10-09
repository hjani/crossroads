import { describe, expect, it, vi } from "vitest";
import { STRAIGHT } from "./lineGeometry";
import { signedArea, type Vec2 } from "./point";
import { unionOfRings, type RingPiece } from "./ringUnion";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

/** A ring of straight pieces through `points`, every piece tagged `tag`. */
function ring(points: readonly Vec2[], tag: string): RingPiece<string>[] {
  return points.map((point) => ({ point, incomingGeometry: STRAIGHT, tag }));
}

/** The square `[x, x + size] × [z, z + size]`, counterclockwise. */
function square(x: number, z: number, size: number, tag: string) {
  return ring(
    [vec(x + size, z), vec(x + size, z + size), vec(x, z + size), vec(x, z)],
    tag,
  );
}

/** Where two rings share a stretch, the earlier one's tag. */
const earlier = (a: string) => a;

function expectPoints(actual: readonly Vec2[], expected: readonly Vec2[]) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index].x);
    expect(point.z).toBeCloseTo(expected[index].z);
  });
}

const pointsOf = (pieces: readonly RingPiece<string>[]) =>
  pieces.map((piece) => piece.point);
const tagsOf = (pieces: readonly RingPiece<string>[]) =>
  pieces.map((piece) => piece.tag);

describe("unionOfRings", () => {
  it("gives a single ring back as it is, empty rings adding nothing", () => {
    const capped: RingPiece<string>[] = [
      { point: vec(4, 0), incomingGeometry: STRAIGHT, tag: "a" },
      {
        point: vec(4, 4),
        incomingGeometry: { kind: "arc", via: vec(5, 3) },
        tag: "a",
      },
      { point: vec(0, 4), incomingGeometry: STRAIGHT, tag: "a" },
      { point: vec(0, 0), incomingGeometry: STRAIGHT, tag: "a" },
    ];

    expect(unionOfRings([[], capped], earlier)).toEqual(capped);
  });

  it("outlines two overlapping squares", () => {
    // Each square's corner inside the other drops out; the outline turns
    // where their edges cross, at (4, 2) and (2, 4).
    const union = unionOfRings(
      [square(0, 0, 4, "a"), square(2, 2, 4, "b")],
      earlier,
    );

    expectPoints(pointsOf(union), [
      vec(4, 0),
      vec(4, 2),
      vec(6, 2),
      vec(6, 6),
      vec(2, 6),
      vec(2, 4),
      vec(0, 4),
      vec(0, 0),
    ]);
    expect(tagsOf(union)).toEqual(["a", "a", "b", "b", "b", "b", "a", "a"]);
  });

  it("keeps one copy of a stretch two rings share running the same way", () => {
    // B lies on A's bottom edge from x = 2 to 4, both running +x. Kept once,
    // as A's part, tagged by `merge`. Tagged as A alone, it joins A's part
    // before it again: the cut at x = 2 cuts nothing.
    const a = square(0, 0, 4, "a");
    const b = ring([vec(6, 0), vec(6, 2), vec(2, 2), vec(2, 0)], "b");

    const joined = unionOfRings([a, b], earlier);
    expectPoints(pointsOf(joined), [
      vec(4, 0),
      vec(6, 0),
      vec(6, 2),
      vec(4, 2),
      vec(4, 4),
      vec(0, 4),
      vec(0, 0),
    ]);
    expect(tagsOf(joined)).toEqual(["a", "b", "b", "b", "a", "a", "a"]);

    const merged = unionOfRings([a, b], (x, y) => `${x}+${y}`);
    expectPoints(pointsOf(merged), [
      vec(2, 0),
      vec(4, 0),
      vec(6, 0),
      vec(6, 2),
      vec(4, 2),
      vec(4, 4),
      vec(0, 4),
      vec(0, 0),
    ]);
    expect(tagsOf(merged)).toEqual(["a", "a+b", "b", "b", "b", "a", "a", "a"]);
  });

  it("drops a stretch two rings share running opposite ways: a seam", () => {
    // C sits left of A. A runs down x = 0, C up it: their areas meet there.
    const union = unionOfRings(
      [square(0, 0, 4, "a"), square(-4, 0, 4, "c")],
      earlier,
    );

    expectPoints(pointsOf(union), [
      vec(4, 0),
      vec(4, 4),
      vec(0, 4),
      vec(-4, 4),
      vec(-4, 0),
      vec(0, 0),
    ]);
    expect(tagsOf(union)).toEqual(["a", "a", "a", "c", "c", "c"]);
  });

  it("cuts an arc where it crosses, keeping it an arc on the same circle", () => {
    // B: the half disc about (2, 3.5) with radius 1, above its chord. Its arc
    // crosses A's top edge z = 4 at x = 2 ± √(1 − 0.5²), 30° and 150° round.
    // Only the part between is outside A: halfway along it, (2, 4.5).
    const b: RingPiece<string>[] = [
      { point: vec(3, 3.5), incomingGeometry: STRAIGHT, tag: "b" },
      {
        point: vec(1, 3.5),
        incomingGeometry: { kind: "arc", via: vec(2, 4.5) },
        tag: "b",
      },
    ];

    const union = unionOfRings([square(0, 0, 4, "a"), b], earlier);

    const off = Math.sqrt(0.75);
    expectPoints(pointsOf(union), [
      vec(4, 0),
      vec(4, 4),
      vec(2 + off, 4),
      vec(2 - off, 4),
      vec(0, 4),
      vec(0, 0),
    ]);
    const arc = union[3].incomingGeometry;
    expect(arc.kind).toBe("arc");
    if (arc.kind === "arc") {
      expectPoints([arc.via], [vec(2, 4.5)]);
    }
  });

  it("doesn't take a short part beside a crossing for a shared stretch", () => {
    // B's left edge runs down across A's top edge at x = 0.85, and C, inside
    // both, ends on it 1.5 cm further down. That cuts B's edge into a part
    // whose middle lies within `SAME_POINT_METERS` of A's top edge, running
    // roughly its way — but across it, not along it: inside A, dropped.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const b = ring([vec(0.7, 2), vec(3, 6), vec(1, 6)], "b");
      const v = vec(1 - 0.3 * ((6 - 3.985) / 4), 3.985);
      const c = ring([v, vec(1.2, 3.5), vec(1.3, 3.9)], "c");

      const union = unionOfRings([b, square(0, 0, 4, "a"), c], earlier);

      expectPoints(pointsOf(union), [
        vec(0.85, 4),
        vec(0, 4),
        vec(0, 0),
        vec(4, 0),
        vec(4, 4),
        vec(1.85, 4),
        vec(3, 6),
        vec(1, 6),
      ]);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("goes round both of two rings touching at a point, keeping outside", () => {
    // At (2, 2) two parts start; arriving up A's right edge, B's bottom edge
    // turns right, A's top edge left → B first, and A's top edge on the way
    // back.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const union = unionOfRings(
        [square(0, 0, 2, "a"), square(2, 2, 2, "b")],
        earlier,
      );

      expectPoints(pointsOf(union), [
        vec(2, 0),
        vec(2, 2),
        vec(4, 2),
        vec(4, 4),
        vec(2, 4),
        vec(2, 2),
        vec(0, 2),
        vec(0, 0),
      ]);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("logs a hole, and keeps the outline around it", () => {
    // Four bars framing the square [2, 4]²: the ground has a hole.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const bar = (x0: number, z0: number, x1: number, z1: number) =>
        ring([vec(x1, z0), vec(x1, z1), vec(x0, z1), vec(x0, z0)], "bar");
      const union = unionOfRings(
        [bar(0, 0, 6, 2), bar(4, 0, 6, 6), bar(0, 4, 6, 6), bar(0, 0, 2, 6)],
        earlier,
      );

      const points = pointsOf(union);
      for (const { x, z } of points) {
        expect(
          [x, z].some((c) => Math.abs(c) < 1e-9 || Math.abs(c - 6) < 1e-9),
        ).toBe(true);
      }
      expect(signedArea(points)).toBeCloseTo(36);
      expect(errors).toHaveBeenCalledOnce();
    } finally {
      errors.mockRestore();
    }
  });

  it("logs ground in separate pieces, and keeps the larger", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const larger = square(10, 0, 4, "b");
      const union = unionOfRings([square(0, 0, 2, "a"), larger], earlier);

      expectPoints(pointsOf(union), pointsOf(larger));
      expect(errors).toHaveBeenCalledOnce();
    } finally {
      errors.mockRestore();
    }
  });
});
