import {
  arcArcCrossings,
  arcCircle,
  arcDirectionAt,
  arcFractionAt,
  arcPolyline,
  pointOnArc,
  segmentArcCrossings,
} from "./arc";
import { fromTheOtherSide, type Crossing } from "./crossing";
import { STRAIGHT, type LineGeometry } from "./lineGeometry";
import {
  distance,
  dot,
  isSamePoint,
  lerp,
  SAME_POINT_METERS,
  signedArea,
  unitDirection,
  type Vec2,
} from "./point";
import { distanceToLine, segmentCrossing, segmentFractionAt } from "./segment";

/**
 * The union of rings: the ground several shapes cover together, as one
 * outline. See `docs/ring-union.md`.
 */

/**
 * One piece of a ring: the point it ends at, how it gets there from the
 * piece before, and a tag the union carries through without reading.
 */
export interface RingPiece<Tag> {
  readonly point: Vec2;
  readonly incomingGeometry: LineGeometry;
  readonly tag: Tag;
}

/**
 * A ring: a closed line around an area, as its pieces in order.
 *
 * A piece has no start of its own: it starts where the piece before ends,
 * the first where the last ends → a ring is always closed. Runs
 * counterclockwise — walking along it, the area is on the left — and never
 * crosses itself.
 */
export type Ring<Tag> = readonly RingPiece<Tag>[];

/**
 * The outer ring around the ground at least one of `rings` covers,
 * counterclockwise.
 *
 * Every piece of it is part of an input piece, with that piece's tag, and an
 * arc's part is an arc on the same circle. Where two rings share a stretch,
 * `merge` picks its tag.
 *
 * Three steps (`docs/ring-union.md`, How):
 *
 * 1. split each piece where a piece of another ring crosses it or ends on
 *    it (`cutsOn`, `partsOf`)
 * 2. keep the parts no other ring covers (`keptTag`)
 * 3. chain the kept parts end to end (`outlinesOf`)
 *
 * Parts of one piece that come out side by side with one tag are joined
 * again. Empty rings add nothing. A hole, or ground in separate pieces,
 * is logged, and only the largest outline comes back.
 */
export function unionOfRings<Tag>(
  rings: readonly Ring<Tag>[],
  merge: (a: Tag, b: Tag) => Tag,
): RingPiece<Tag>[] {
  const pieces = rings.map((ring, index) => piecesOf(ring, index));
  const parts = pieces.map((ringPieces) =>
    ringPieces.flatMap((piece) => partsOf(piece, cutsOn(piece, pieces))),
  );
  const kept = parts.flat().flatMap((part) => {
    const tag = keptTag(part, pieces, parts, merge);
    return tag === null ? [] : [{ ...part, tag: tag.value }];
  });

  const outlines = outlinesOf(kept);
  if (outlines.length === 0) {
    return [];
  }
  if (outlines.length > 1) {
    console.error(
      `Ring union: the ground comes out as ${outlines.length} outlines ` +
        `(a hole, or pieces apart); only the largest is kept`,
    );
  }
  const largest = outlines.reduce((best, outline) =>
    areaOf(outline) > areaOf(best) ? outline : best,
  );
  return rejoined(largest).map((part) => ({
    point: part.to,
    incomingGeometry: geometryOf(part),
    tag: part.tag,
  }));
}

/** A ring's piece, with the start the ring leaves implicit written out. */
interface Piece<Tag> {
  /** Which input ring it belongs to. */
  readonly ring: number;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly geometry: LineGeometry;
  readonly tag: Tag;
}

/**
 * A ring's pieces, each with its start written out.
 *
 * An arc straying less than `SAME_POINT_METERS` from its chord is taken as
 * straight: at that tolerance it is. A circle through three points so
 * nearly in line is fitted poorly, too, so two copies of one curb would come
 * out as different circles, crossing each other at random places along it.
 */
function piecesOf<Tag>(ring: Ring<Tag>, index: number): Piece<Tag>[] {
  return ring.map((piece, i) => {
    const from = ring[(i + ring.length - 1) % ring.length].point;
    const geometry = piece.incomingGeometry;
    return {
      ring: index,
      from,
      to: piece.point,
      geometry:
        geometry.kind === "arc" &&
        distanceToLine(geometry.via, from, piece.point) <= SAME_POINT_METERS
          ? STRAIGHT
          : geometry,
      tag: piece.tag,
    };
  });
}

/**
 * A place a piece is cut: how far along it, as a fraction (0 at its start,
 * 1 at its end), and the point itself. A `vertex` cut is another ring's
 * piece end, taken as it is.
 */
interface Cut {
  readonly along: number;
  readonly point: Vec2;
  readonly vertex: boolean;
}

/**
 * Where a piece is cut: wherever a piece of another ring crosses it, or ends
 * on it.
 *
 * - ends too, not just crossings: two rings running along the same line or
 *   circle never cross there, and their shared stretch must come out as the
 *   same part in both → each is cut where the other's pieces end
 * - an end is taken as it is, not as the nearest point of the piece → both
 *   rings carry the exact same point there
 */
function cutsOn<Tag>(
  piece: Piece<Tag>,
  pieces: readonly (readonly Piece<Tag>[])[],
): Cut[] {
  const cuts: Cut[] = [];
  for (const other of pieces.flat()) {
    if (other.ring === piece.ring) {
      continue;
    }
    for (const crossing of crossingsOf(piece, other)) {
      cuts.push({
        along: crossing.alongA,
        point: crossing.point,
        vertex: false,
      });
    }
    const nearest = nearestOn(piece, other.to);
    if (distance(nearest.point, other.to) <= SAME_POINT_METERS) {
      cuts.push({ along: nearest.along, point: other.to, vertex: true });
    }
  }
  return cuts;
}

/** Where two pieces cross, `alongA` on `a` and `alongB` on `b`. */
function crossingsOf<Tag>(a: Piece<Tag>, b: Piece<Tag>): Crossing[] {
  if (a.geometry.kind === "arc") {
    return b.geometry.kind === "arc"
      ? arcArcCrossings(
          a.from,
          a.to,
          a.geometry.via,
          b.from,
          b.to,
          b.geometry.via,
        )
      : segmentArcCrossings(b.from, b.to, a.from, a.to, a.geometry.via).map(
          fromTheOtherSide,
        );
  }
  if (b.geometry.kind === "arc") {
    return segmentArcCrossings(a.from, a.to, b.from, b.to, b.geometry.via);
  }
  const crossing = segmentCrossing(a.from, a.to, b.from, b.to);
  return crossing === null ? [] : [crossing];
}

/** A stretch of one piece, between two of its cuts. */
interface Part<Tag> {
  readonly piece: Piece<Tag>;
  /** Fractions along the piece, as `Cut.along`. */
  readonly start: number;
  readonly end: number;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly tag: Tag;
}

/**
 * A piece cut into parts, in order along it. Cuts at the same place count
 * once, a ring's own vertex kept over a computed crossing; cuts at the
 * piece's own ends cut nothing.
 */
function partsOf<Tag>(piece: Piece<Tag>, cuts: readonly Cut[]): Part<Tag>[] {
  const stops: Cut[] = [{ along: 0, point: piece.from, vertex: true }];
  for (const cut of [...cuts].sort((a, b) => a.along - b.along)) {
    if (
      isSamePoint(cut.point, piece.from) ||
      isSamePoint(cut.point, piece.to)
    ) {
      continue;
    }
    const last = stops[stops.length - 1];
    if (isSamePoint(cut.point, last.point)) {
      if (cut.vertex && !last.vertex) {
        stops[stops.length - 1] = cut;
      }
      continue;
    }
    stops.push(cut);
  }
  stops.push({ along: 1, point: piece.to, vertex: true });

  return stops.slice(1).map((stop, i) => ({
    piece,
    start: stops[i].along,
    end: stop.along,
    from: stops[i].point,
    to: stop.point,
    tag: piece.tag,
  }));
}

/**
 * The tag a part keeps the union with, or null where it is dropped. Read
 * against every other ring:
 *
 * - that ring has the same part → a stretch both share:
 *   - its ends the other way round → the two areas meet there → a seam:
 *     dropped
 *   - the same way round → both areas on one side → outline: the earlier
 *     ring's part is kept, with `merge` of both tags
 *   - the order tells the side because both run counterclockwise, area on
 *     the left: running the same way puts both areas on the same side
 * - otherwise inside that ring, read at its middle point → dropped
 *
 * The same part: the same two ends and the same middle, each within
 * `SAME_POINT_METERS`. Splitting cuts both rings wherever either has an
 * end on the stretch (`cutsOn`), so a shared stretch comes out as the same
 * part in both — two curbs hugging each other at a slight angle included.
 * A short part beside a crossing has no such twin, however close it runs:
 * it is inside or outside like any other.
 */
function keptTag<Tag>(
  part: Part<Tag>,
  pieces: readonly (readonly Piece<Tag>[])[],
  parts: readonly (readonly Part<Tag>[])[],
  merge: (a: Tag, b: Tag) => Tag,
): { value: Tag } | null {
  const middle = middleOf(part);
  let tag = part.tag;
  for (const [ring, others] of parts.entries()) {
    if (ring === part.piece.ring || others.length === 0) {
      continue;
    }
    const twin = others.find(
      (other) =>
        isSamePoint(middleOf(other), middle) &&
        ((isSamePoint(other.from, part.from) &&
          isSamePoint(other.to, part.to)) ||
          (isSamePoint(other.from, part.to) &&
            isSamePoint(other.to, part.from))),
    );
    if (twin !== undefined) {
      if (!isSamePoint(twin.from, part.from) || ring < part.piece.ring) {
        return null;
      }
      tag = merge(tag, twin.tag);
    } else if (ringContains(pieces[ring], middle)) {
      return null;
    }
  }
  return { value: tag };
}

/**
 * The kept parts chained end to end into closed outlines: from a part, on
 * to the one starting where it ends, until back at the first.
 *
 * Where several start there — two rings touching at a point — the one
 * turning furthest right is taken, keeping to the outside. With `t` the
 * heading arriving and `u` the one leaving, the turn is
 *
 *     atan2(t × u, t·u)
 *
 * negative to the right. A chain that breaks off is logged and left out.
 */
function outlinesOf<Tag>(parts: readonly Part<Tag>[]): Part<Tag>[][] {
  const unused = new Set(parts.keys());
  const outlines: Part<Tag>[][] = [];
  for (const first of parts.keys()) {
    if (!unused.delete(first)) {
      continue;
    }
    const outline = [parts[first]];
    for (;;) {
      const last = outline[outline.length - 1];
      const arriving = headingOf(last.piece, last.end);
      const next = [first, ...unused]
        .filter((k) => isSamePoint(parts[k].from, last.to))
        .map((k) => {
          const leaving = headingOf(parts[k].piece, parts[k].start);
          const turn = Math.atan2(
            arriving.x * leaving.z - arriving.z * leaving.x,
            dot(arriving, leaving),
          );
          return { k, turn };
        })
        .reduce<{ k: number; turn: number } | null>(
          (best, candidate) =>
            best === null || candidate.turn < best.turn ? candidate : best,
          null,
        );
      if (next === null) {
        console.error(
          `Ring union: the outline breaks off at (${last.to.x}, ${last.to.z})`,
        );
        break;
      }
      if (next.k === first) {
        outlines.push(outline);
        break;
      }
      unused.delete(next.k);
      outline.push(parts[next.k]);
    }
  }
  return outlines;
}

/**
 * The outline with neighboring parts of one piece joined again, where both
 * kept the same tag: a cut that ended up between two kept parts cuts
 * nothing.
 */
function rejoined<Tag>(outline: readonly Part<Tag>[]): Part<Tag>[] {
  const continues = (a: Part<Tag>, b: Part<Tag>): boolean =>
    a.piece === b.piece && a.end === b.start && a.tag === b.tag;
  const joined: Part<Tag>[] = [];
  for (const part of outline) {
    const last = joined[joined.length - 1];
    if (last !== undefined && continues(last, part)) {
      joined[joined.length - 1] = { ...last, end: part.end, to: part.to };
    } else {
      joined.push(part);
    }
  }
  if (joined.length > 1 && continues(joined[joined.length - 1], joined[0])) {
    const last = joined.pop()!;
    joined[0] = { ...last, end: joined[0].end, to: joined[0].to };
  }
  return joined;
}

/**
 * How a part runs between its ends: straight, or round its piece's circle
 * through the piece's point halfway between them — the piece's own `via`
 * where the part is the whole piece.
 */
function geometryOf<Tag>(part: Part<Tag>): LineGeometry {
  const { piece, start, end } = part;
  if (piece.geometry.kind !== "arc") {
    return STRAIGHT;
  }
  if (start === 0 && end === 1) {
    return piece.geometry;
  }
  return {
    kind: "arc",
    via: pointOnArc(
      piece.from,
      piece.to,
      piece.geometry.via,
      (start + end) / 2,
    ),
  };
}

function middleOf<Tag>(part: Part<Tag>): Vec2 {
  const geometry = geometryOf(part);
  return geometry.kind === "arc"
    ? pointOnArc(part.from, part.to, geometry.via, 0.5)
    : lerp(part.from, part.to, 0.5);
}

/** Which way a piece runs at a fraction along it, as a unit vector. */
function headingOf<Tag>(piece: Piece<Tag>, along: number): Vec2 {
  return piece.geometry.kind === "arc"
    ? arcDirectionAt(piece.from, piece.to, piece.geometry.via, along)
    : unitDirection(piece.from, piece.to);
}

/** The point of a piece nearest `point`, and how far along the piece. */
function nearestOn<Tag>(
  piece: Piece<Tag>,
  point: Vec2,
): { point: Vec2; along: number } {
  if (piece.geometry.kind === "arc") {
    const { via } = piece.geometry;
    const along = arcFractionAt(piece.from, piece.to, via, point);
    return { point: pointOnArc(piece.from, piece.to, via, along), along };
  }
  const along = segmentFractionAt(point, piece.from, piece.to);
  return { point: lerp(piece.from, piece.to, along), along };
}

/** An outline's area, its arcs sampled finely: only for comparing sizes. */
function areaOf<Tag>(outline: readonly Part<Tag>[]): number {
  return signedArea(
    outline.flatMap((part) => {
      const geometry = geometryOf(part);
      const run =
        geometry.kind === "arc"
          ? arcPolyline(part.from, part.to, geometry.via, SAME_POINT_METERS)
          : [part.from, part.to];
      return run.slice(1);
    }),
  );
}

/**
 * Whether a ring's pieces cover `p`.
 *
 * Let `P` be the polygon through the pieces' ends, and for an arc piece from
 * `a` to `b` through `v`, `S` its circular segment: the part of its circle's
 * disc on `v`'s side of the chord `ab`.
 *
 * - an arc piece differs from its chord by exactly `S`:
 *   - bulging out of `P` → the ring covers `P ∪ S`
 *   - bulging into `P` → the ring covers `P ∖ S`
 * - either way `p ∈ S` flips whether `p` is covered, so, counting even–odd:
 *
 *       covered = (p ∈ P) xor (p in an odd number of the S)
 *
 * - `p ∈ P`: a ray from `p` toward +x crosses `P`'s edges an odd number of
 *   times
 * - `p ∈ S`, with the circle `(c, r)`, and `×` the cross product:
 *
 *       |p − c| < r   and   (b − a) × (p − a) has the sign of (b − a) × (v − a)
 *
 * The same reading as picking a junction (`junctionContains`).
 */
function ringContains<Tag>(pieces: readonly Piece<Tag>[], p: Vec2): boolean {
  let covered = false;
  for (const { from: a, to: b, geometry } of pieces) {
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < a.x + ((p.z - a.z) * (b.x - a.x)) / (b.z - a.z)
    ) {
      covered = !covered;
    }
    if (geometry.kind === "arc" && inCircularSegment(a, b, geometry.via, p)) {
      covered = !covered;
    }
  }
  return covered;
}

/**
 * Whether `p` lies in the circular segment of the arc `a`–`v`–`b`: inside its
 * circle, on `v`'s side of the chord. None for a `v` in line with the ends.
 */
function inCircularSegment(a: Vec2, b: Vec2, v: Vec2, p: Vec2): boolean {
  const circle = arcCircle(a, b, v);
  if (circle === null) {
    return false;
  }
  const side = (q: Vec2): number =>
    (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x);
  return distance(p, circle.center) < circle.radius && side(p) * side(v) > 0;
}
