import { arcCircle, circleThrough, nearestPointOnArc } from "../geometry/arc";
import { STRAIGHT, type LineGeometry } from "../geometry/lineGeometry";
import {
  distance,
  isSamePoint,
  lerp,
  SAME_POINT_METERS,
  unitDirection,
  type Vec2,
} from "../geometry/point";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, SectionId } from "../network/types";
import {
  alongEdge,
  edgeCrossings,
  edgeOf,
  edgePointAt,
  isWithinEdge,
  legsAt,
  nearestOnEdge,
  setbackThrough,
  type Edge,
  type Leg,
} from "./junctionLeg";
import type { JunctionOutline, OutlineEdgeKind, OutlinePiece } from "./outline";

/**
 * The gap after a leg, between it and the next leg counterclockwise, as the
 * junction rules read it.
 */
interface Gap {
  /** How the outline crosses it. */
  readonly join: GapJoin;
  /** How far back it sets each of its two legs, in meters. */
  readonly setbacks: { readonly first: number; readonly second: number };
  /**
   * Whether its join keeps the node inside the junction. Only a round join
   * between two widths can leave it out (`slidRound`).
   */
  readonly coversNode: boolean;
}

/** How a junction's outline crosses a gap. */
type GapJoin =
  /**
   * Both roadways end through `point`, where the gap-side edges cross ahead
   * of the node, and the outline turns there.
   */
  | { readonly kind: "corner"; readonly point: Vec2 }
  /**
   * Off the first leg's edge at `leaving`, then along `path` to its last
   * point, where it meets the second leg's edge (`roundGap`). An empty path
   * meets it at `leaving` itself.
   */
  | {
      readonly kind: "round";
      readonly leaving: Vec2;
      readonly path: readonly PathPiece[];
    }
  /** Straight from one roadway's end to the next. */
  | { readonly kind: "straight" };

/** A point on a round join's path, and how the path arrives there. */
interface PathPiece {
  readonly point: Vec2;
  readonly geometry: LineGeometry;
}

/**
 * The junction at a node: where the roads meeting there stop being roadways,
 * and the area left between them. See `docs/road-layout.md`.
 *
 * Worked out from the node and the sections meeting it alone:
 *
 * - each gap sets its roads back as its join says: a corner (`gapBetween`)
 *   or round (`roundGap`)
 * - a road set back from both sides takes the longer setback
 */
export class Junction {
  private readonly at: Vec2;
  private readonly legs: readonly Leg[];
  /** `gaps[i]` is the gap after `legs[i]`; the last wraps round to `legs[0]`. */
  private readonly gaps: readonly Gap[];
  private readonly setbacks: ReadonlyMap<SectionId, number>;

  /** Worked out once, at construction; `outline` hands it out. */
  private readonly junctionOutline: JunctionOutline;
  /** Worked out once, at construction; `boundingRadius` hands it out. */
  private readonly radius: number;

  constructor(
    network: RoadNetwork,
    readonly node: NodeId,
  ) {
    this.at = network.getNode(node).position;
    this.legs = legsAt(network, node);
    this.gaps = gapsAround(node, this.at, this.legs);
    this.setbacks = longestSetbacks(this.legs, this.gaps);
    this.junctionOutline = this.buildOutline();
    this.radius = this.buildBoundingRadius();
  }

  /**
   * How far from the node a section's roadway ends, in meters, measured along
   * its centerline. Throws for a section not meeting the node.
   */
  setbackOf(section: SectionId): number {
    const setback = this.setbacks.get(section);
    if (setback === undefined) {
      throw new Error(`Section ${section} does not meet node ${this.node}`);
    }
    return setback;
  }

  /**
   * The junction's outline, counterclockwise around the node, as a closed
   * ring: the first piece runs from the last piece's `point`.
   *
   * Each leg contributes its two edge points — right then left, looking from
   * the node along it — with the cut across the road between them. Then the
   * gap after it, as its join says:
   *
   * - `corner`: back along this leg's edge to the corner point, then out
   *   along the next leg's edge to that leg's right edge point
   * - `round`: back along this leg's edge to where the join leaves it, along
   *   the join's path, then out along the next leg's edge
   * - `straight`: straight across to the next leg's right edge point
   *
   * Pieces of no length are left out, so a leg whose edge point already is
   * the corner point adds nothing, and a round join over a gap of exactly a
   * half turn adds no arc. A ring can come out empty.
   */
  outline(): JunctionOutline {
    return this.junctionOutline;
  }

  /** The node position, also the center of the bounding circle. */
  center(): Vec2 {
    return this.at;
  }

  /**
   * The radius of the bounding circle around the entire junction outline.
   */
  boundingRadius(): number {
    return this.radius;
  }

  /**
   * Whether the node lies inside the junction (`docs/road-layout.md`,
   * Joins). The outline is drawn either way; a network whose junction leaves
   * its node out is the clearing step's to refuse.
   */
  coversNode(): boolean {
    return this.gaps.every((gap) => gap.coversNode);
  }

  /**
   * The farthest outline point from the node. Let `N` be the node:
   *
   * - straight piece: the distance from `N` is convex along a segment →
   *   greatest at an end
   * - arc piece, on a circle about `O`: the distance from `N` is greatest at
   *   the circle's point straight out from `O` away from `N`, and falls off
   *   either way round from it → greatest there if the arc reaches it, else
   *   at an end. Toward the mirror of `N` through `O` is that way out, and
   *   `nearestPointOnArc` gives that point, or an end where the arc stops
   *   short of it:
   *
   *       far = nearestPointOnArc(2O − N)
   *
   *   → the pieces' own points cover the ends; only `far` is new
   * - `R ≥ w/2`: each leg's cut is on the ring, its ends `√(s² + (w/2)²)`
   *   from `N`
   */
  private buildBoundingRadius(): number {
    const { pieces } = this.junctionOutline;
    return Math.max(
      ...pieces.map((piece, index) => {
        const end = distance(this.at, piece.point);
        const geometry = piece.incomingGeometry;
        if (geometry.kind !== "arc") {
          return end;
        }

        const from = pieces[(index + pieces.length - 1) % pieces.length].point;
        const circle = arcCircle(from, piece.point, geometry.via);
        if (circle === null) {
          return end;
        }
        const mirror = {
          x: 2 * circle.center.x - this.at.x,
          z: 2 * circle.center.z - this.at.z,
        };
        const far = nearestPointOnArc(mirror, from, piece.point, geometry.via);
        return Math.max(end, distance(this.at, far));
      }),
    );
  }

  /** Builds the outline of the junction. */
  private buildOutline(): JunctionOutline {
    const pieces: OutlinePiece[] = [];
    let previous = this.edgePointOf(this.legs[0], -1);
    const add = (
      point: Vec2,
      incomingGeometry: LineGeometry,
      edge: OutlineEdgeKind,
    ): void => {
      if (isSamePoint(previous, point)) {
        return;
      }
      pieces.push({ point, incomingGeometry, edge });
      previous = point;
    };

    this.legs.forEach((leg, index) => {
      add(this.edgePointOf(leg, 1), STRAIGHT, "roadwayEnd");

      const nextLeg = this.legs[(index + 1) % this.legs.length];
      const nextEdgePoint = this.edgePointOf(nextLeg, -1);
      const { join } = this.gaps[index];
      switch (join.kind) {
        case "straight":
          add(nextEdgePoint, STRAIGHT, "curb");
          break;

        case "corner":
          add(join.point, alongEdge(leg, 1, previous, join.point), "curb");
          add(
            nextEdgePoint,
            alongEdge(nextLeg, -1, join.point, nextEdgePoint),
            "curb",
          );
          break;

        case "round": {
          const { leaving, path } = join;
          add(leaving, alongEdge(leg, 1, previous, leaving), "curb");
          for (const { point, geometry } of path) {
            add(point, geometry, "curb");
          }
          add(
            nextEdgePoint,
            alongEdge(nextLeg, -1, previous, nextEdgePoint),
            "curb",
          );
          break;
        }
      }
    });

    return {
      kind: "junction",
      node: this.node,
      center: this.at,
      pieces,
    };
  }

  /**
   * Where a leg's roadway ends on its `side` (+1 counterclockwise, −1
   * clockwise), at the setback it ends up with.
   */
  private edgePointOf(leg: Leg, side: number): Vec2 {
    return edgePointAt(this.at, leg, side, this.setbackOf(leg.section.id));
  }
}

/**
 * How close to a half turn a gap counts as one. Two roads in line are a half
 * turn apart only up to rounding, and their edges then cross far away on
 * either side, or nowhere. The setback such a gap would give is under
 * `(w/2)·tolerance/2`, far below anything visible.
 */
const HALF_TURN_TOLERANCE_RADIANS = 1e-9;

/**
 * A gap the junction can't join as it should: nothing set back, and the
 * outline cut straight across. Only for a network that can't be drawn right —
 * see `gapBetween`.
 */
const UNJOINED_GAP: Gap = {
  join: { kind: "straight" },
  setbacks: { first: 0, second: 0 },
  // Already an error, logged with its reason where it arose.
  coversNode: true,
};

/** The gap after each leg, in the same order as the legs. */
function gapsAround(node: NodeId, at: Vec2, legs: readonly Leg[]): Gap[] {
  return legs.map((first, index) => {
    const second = legs[(index + 1) % legs.length];
    const gap =
      index + 1 < legs.length
        ? second.angle - first.angle
        : // The last gap wraps round, past the full turn, to the first leg.
          second.angle + 2 * Math.PI - first.angle;

    // A half turn or more never runs backwards: each end lies at most a
    // quarter turn from its leg.
    return gap >= Math.PI - HALF_TURN_TOLERANCE_RADIANS
      ? (roundGap(node, at, first, second, gap) ?? UNJOINED_GAP)
      : gapBetween(node, at, first, second, gap);
  });
}

/**
 * A gap joined round (`docs/road-layout.md`, Joins): round the circle about
 * the node where the widths are equal (`roundAboutNode`), round a circle slid
 * along the wider road where they differ (`slidRound`). Null where only a
 * corner can join the gap.
 *
 * Widths count as equal within `SAME_POINT_METERS`: curbs that close are the
 * same place.
 */
function roundGap(
  node: NodeId,
  at: Vec2,
  first: Leg,
  second: Leg,
  gap: number,
): Gap | null {
  return Math.abs(first.halfWidth - second.halfWidth) <= SAME_POINT_METERS
    ? roundAboutNode(node, at, first, second, gap)
    : slidRound(node, at, first, second, gap);
}

/**
 * A gap between two equal widths joined round: along the circle about the
 * node whose radius `r` is the roads' `w/2`, between the two ends
 * `roundJoinEnd` finds. Null where that arc would run backwards — a gap only a
 * corner can join.
 *
 * Let `N` be the node, `α₁` the first leg's angle, `ψ` the gap, and `φ₁`,
 * `φ₂` how far each end lies round from its own leg's direction, toward the
 * gap (`turnFrom`):
 *
 * - the arc runs counterclockwise from `α₁ + φ₁` to `α₁ + ψ − φ₂`:
 *
 *       span = ψ − φ₁ − φ₂
 *
 *   under 0 → the ends are the wrong way round → null
 * - halfway along it:
 *
 *       m = α₁ + (φ₁ + ψ − φ₂)/2
 *       via = N + r·(cos m, sin m)
 *
 * What follows: both ends touch the circle square to their roads →
 * `φ₁ = φ₂ = π/2` → span `ψ − π`, and `m` is the gap's bisector
 * (`docs/ideas/junction-polygon.md`, "Round"). `ψ = π`: no arc. `ψ = 2π` (a
 * dead end): the half circle capping the road.
 */
function roundAboutNode(
  node: NodeId,
  at: Vec2,
  first: Leg,
  second: Leg,
  gap: number,
): Gap | null {
  const radius = Math.max(first.halfWidth, second.halfWidth);
  const leaving = roundJoinEnd(node, at, first, 1, radius);
  const entering = roundJoinEnd(node, at, second, -1, radius);
  if (leaving === null || entering === null) {
    return UNJOINED_GAP;
  }

  const leavingTurn = turnFrom(at, first, 1, leaving.point);
  const enteringTurn = turnFrom(at, second, -1, entering.point);
  if (gap - leavingTurn - enteringTurn < -HALF_TURN_TOLERANCE_RADIANS) {
    return null;
  }

  const middle = first.angle + (leavingTurn + gap - enteringTurn) / 2;
  const via = {
    x: at.x + radius * Math.cos(middle),
    z: at.z + radius * Math.sin(middle),
  };
  return {
    join: {
      kind: "round",
      leaving: leaving.point,
      path: [{ point: entering.point, geometry: { kind: "arc", via } }],
    },
    setbacks: { first: leaving.setback, second: entering.setback },
    coversNode: true,
  };
}

/**
 * A gap between two widths joined round (`docs/road-layout.md`, Joins): a
 * circle of the wider road's half-width, slid along that road's centerline
 * away from the node until it touches a line `ℓ` — the narrower road's curb,
 * or the `T–X` piece (`touchedLine`). Null where it would have to slide
 * behind the node: a gap only a corner can join.
 *
 * Let `N` be the node, `r` the wider road's half-width, `T` its edge point
 * beside `N` on the gap's side, `X` where the narrower road's curb crosses
 * the circle about `N` with radius `r` (`roundJoinEnd`), and `O` the slid
 * circle's center:
 *
 * - `O` is `r` from the wider road's curb → on that road's centerline
 * - `O` is `r` from `ℓ`, on the road's side → on `ℓ` shifted `r` toward the
 *   road
 * - so `O` is where the two cross, the first crossing ahead of `N`, and the
 *   slide `s` is how far along the wider road that is:
 *
 *       O = centerline ∩ (ℓ shifted by r)
 *       s = setbackThrough(O)
 *
 * - the circle touches the wider road's curb square across from `O`, at the
 *   edge point at `s`, and `ℓ` at the point of `ℓ` nearest `O`
 *
 * What follows:
 *
 * - with two straights, `W` and `w` the widths, `β` the gap less a half turn
 *   and `β₁ = arccos(w/W)`, this comes out as
 *
 *       s = r·tan((β₁ + β)/4)        touching the T–X piece
 *       s = (W − w)/(2·sin β)       touching the curb
 *
 *   Neither is computed: the one crossing gives both, on arc legs too.
 * - as `X` → `T`, where a corner turns round, `s` → 0 → no jump from the
 *   corner
 * - where `ℓ` turns from the `T–X` piece to the curb, the curb runs through
 *   `T`, so the swing is nothing and the two are one line → no jump
 * - the narrower road ends through `X`, or through where the circle touches
 *   its curb if that is further out → its roadway's end doesn't jump there
 *   either
 * - the node lies inside the junction exactly when it lies inside the
 *   circle, `|O − N| ≤ r` (`coversNode`). With two straights it falls out
 *   where `s > r`: bends sharper than `180° − arcsin(1 − w/W)`. The outline
 *   is drawn all the same; the clearing step refuses it
 */
function slidRound(
  node: NodeId,
  at: Vec2,
  first: Leg,
  second: Leg,
  gap: number,
): Gap | null {
  // The gap lies on the first leg's +1 side and on the second's −1 side.
  const widerFirst = first.halfWidth > second.halfWidth;
  const [wider, widerSide, narrower, narrowerSide] = widerFirst
    ? [first, 1, second, -1]
    : [second, -1, first, 1];
  const radius = wider.halfWidth;

  const x = roundJoinEnd(node, at, narrower, narrowerSide, radius);
  const centerline = edgeOf(at, wider, widerSide, 0);
  if (x === null || centerline === null) {
    return UNJOINED_GAP;
  }
  const t = edgePointAt(at, wider, widerSide, 0);
  const onCurb = gap > Math.PI && isWithinEdge(at, narrower, narrowerSide, t);

  const ordered = (leaving: Vec2, path: readonly PathPiece[]): GapJoin =>
    widerFirst
      ? { kind: "round", leaving, path }
      : { kind: "round", ...reversed(leaving, path) };
  const setbacks = (slide: number, narrowerSetback: number) =>
    widerFirst
      ? { first: slide, second: narrowerSetback }
      : { first: narrowerSetback, second: slide };

  if (!onCurb && isSamePoint(t, x.point)) {
    // X has reached T, where a corner turns round: nothing to slide into.
    return {
      join: ordered(t, []),
      setbacks: setbacks(0, x.setback),
      coversNode: true,
    };
  }

  const touched = touchedLine(node, at, narrower, narrowerSide, radius, {
    t,
    x: x.point,
    onCurb,
  });
  if (touched === null) {
    return UNJOINED_GAP;
  }

  const ahead = edgeCrossings(centerline, touched.shifted)
    .map((point) => ({ point, slide: setbackThrough(at, wider, point) }))
    .filter((center) => center.slide >= -SAME_POINT_METERS);
  if (ahead.length === 0) {
    return null;
  }
  const center = ahead.reduce((best, crossing) =>
    crossing.slide < best.slide ? crossing : best,
  );
  const slide = Math.max(0, center.slide);

  const onWider = edgePointAt(at, wider, widerSide, slide);
  const onLine = nearestOnEdge(touched.line, center.point);
  const round = along(
    { kind: "circle", circle: { center: center.point, radius } },
    onWider,
    onLine,
  );
  const coversNode = distance(at, center.point) <= radius + SAME_POINT_METERS;

  if (touched.isCurb) {
    const touching = setbackThrough(at, narrower, onLine);
    return {
      join: ordered(onWider, [{ point: onLine, geometry: round }]),
      setbacks: setbacks(slide, Math.max(x.setback, touching)),
      coversNode,
    };
  }
  return {
    join: ordered(onWider, [
      { point: onLine, geometry: round },
      { point: x.point, geometry: along(touched.line, onLine, x.point) },
    ]),
    setbacks: setbacks(slide, x.setback),
    coversNode,
  };
}

/**
 * The line a round join's slid circle touches (`slidRound`), and that line
 * shifted `r` toward the road, where the circle's center lies.
 */
interface TouchedLine {
  /** What the circle touches, and the outline runs along. */
  readonly line: Edge;
  /** `line` moved `r` toward the road. */
  readonly shifted: Edge;
  /** Whether `line` is the narrower road's own curb. */
  readonly isCurb: boolean;
}

/**
 * The line a round join's slid circle touches, as `docs/road-layout.md`
 * (Joins) picks it, with `r` the wider road's half-width, `T` its edge point
 * beside the node and `X` the narrower curb's on the circle about the node.
 * Null, with the error logged, for an arc too tight to have that line.
 *
 * Let `N` be the node, `w/2` the narrower road's half-width, `σ` its `side`,
 * and for an arc `C` its center, `ρ` its curb's radius and `τ` the way it
 * turns:
 *
 * - `onCurb` (a gap over a half turn, `T` no farther toward the gap than the
 *   narrower curb carried on past `N`, `isWithinEdge`): that road's curb.
 *   Moved `r` toward the road, it lies `w/2 − r` off the centerline, on the
 *   same side → `edgeOf` at that offset
 *   - one-sided on purpose: past a bend of `180° − β₁` on two straights, `T`
 *     is no longer on the narrower road at all, but beyond its far curb —
 *     and the curb has swung past `T`, not back
 * - otherwise the `T–X` piece, the curb swung about `X` until it runs
 *   through `T`:
 *   - straight: the line through `T` and `X`, shifted toward `N`. `N` is the
 *     center of the circle both lie on, and the piece spans under half of it
 *     → `N` is never on the line, and is on the road's side of it
 *   - arc: the circle of radius `ρ` through `T` and `X` (`circleThrough`)
 *     with its center on the same side of `T–X` as `C`. Moved toward the
 *     road the way the curb's own radius moves toward the centerline
 *     (`R − σ·τ·w/2` in `edgeOf`):
 *
 *         ρ' = ρ + σ·τ·r
 */
function touchedLine(
  node: NodeId,
  at: Vec2,
  narrower: Leg,
  side: number,
  radius: number,
  { t, x, onCurb }: { t: Vec2; x: Vec2; onCurb: boolean },
): TouchedLine | null {
  if (onCurb) {
    const line = edgeOf(at, narrower, side);
    const shifted = edgeOf(at, narrower, side, narrower.halfWidth - radius);
    if (line === null || shifted === null) {
      logBendsTooTightly(node, narrower);
      return null;
    }
    return { line, shifted, isCurb: true };
  }

  if (narrower.arc === null) {
    const direction = unitDirection(t, x);
    // The normal toward N: (−d.z, d.x), turned round if N is the other way.
    const toward =
      Math.sign((at.z - t.z) * direction.x - (at.x - t.x) * direction.z) || 1;
    return {
      line: { kind: "line", through: t, direction },
      shifted: {
        kind: "line",
        through: {
          x: t.x - toward * radius * direction.z,
          z: t.z + toward * radius * direction.x,
        },
        direction,
      },
      isCurb: false,
    };
  }

  const curb = edgeOf(at, narrower, side);
  if (curb === null || curb.kind !== "circle") {
    logBendsTooTightly(node, narrower);
    return null;
  }
  const { center, radius: curbRadius } = curb.circle;
  // The side of T–X the curb's center lies on: +1 counterclockwise of it.
  const centerSide =
    Math.sign(
      (x.x - t.x) * (center.z - t.z) - (x.z - t.z) * (center.x - t.x),
    ) || 1;
  const swung = circleThrough(t, x, curbRadius, centerSide);
  const shiftedRadius = curbRadius + side * narrower.arc.turn * radius;
  if (swung === null || shiftedRadius <= 0) {
    logBendsTooTightly(node, narrower);
    return null;
  }
  return {
    line: { kind: "circle", circle: swung },
    shifted: {
      kind: "circle",
      circle: { center: swung.center, radius: shiftedRadius },
    },
    isCurb: false,
  };
}

/**
 * How a round join runs along `line` from `from` to `to`: straight, or the
 * shorter way round its circle, through the point of it halfway between —
 * as `alongEdge` does for a leg's own edge.
 */
function along(line: Edge, from: Vec2, to: Vec2): LineGeometry {
  if (line.kind === "line") {
    return STRAIGHT;
  }
  const { center, radius } = line.circle;
  const out = unitDirection(center, lerp(from, to, 0.5));
  return {
    kind: "arc",
    via: { x: center.x + radius * out.x, z: center.z + radius * out.z },
  };
}

/**
 * A round join's path walked the other way: from its last point back to
 * `leaving`. Each piece's geometry still joins the same two points, so only
 * which point it arrives at changes.
 */
function reversed(
  leaving: Vec2,
  path: readonly PathPiece[],
): { leaving: Vec2; path: PathPiece[] } {
  const points = [leaving, ...path.map((piece) => piece.point)];
  const last = points.length - 1;
  return {
    leaving: points[last],
    path: path.map((_, index) => ({
      point: points[last - 1 - index],
      geometry: path[last - 1 - index].geometry,
    })),
  };
}

/**
 * One end of a round join of radius `r`: where a leg's `side` edge (+1
 * counterclockwise, −1 clockwise) meets the circle about the node, and the
 * setback that ends the road through it. Null, with the error logged, where
 * the edge doesn't meet the circle ahead of the node.
 *
 * Let `N` be the node, `d` the leg's direction, `σ` the side, and `w/2` the
 * leg's half-width:
 *
 * - `w/2 = r`, the wider road: the edge touches the circle at `T`, its edge
 *   point at no setback (`docs/ideas/junction-polygon.md`, "The touching
 *   point `T`"):
 *   - straight: `edgePointAt` at 0 is `N + σ·(w/2)·(−d.z, d.x)`
 *   - arc, with `O` its center, `R` its radius and `τ` the way it turns:
 *     `edgePointAt` at 0 is `N − στ·(w/2)·û`, with `û = unitDirection(O, N)`.
 *     The center lies square to `d` on the side the arc turns to,
 *     `O = N + τ·R·(−d.z, d.x)`, so `û = −τ·(−d.z, d.x)` and, with `τ² = 1`,
 *     the point comes out the same
 *
 *         T = N + σ·(w/2)·(−d.z, d.x)
 *
 *   → `w/2` from `N`, square to the road → nothing set back
 * - `w/2 < r`, a narrower road: the edge passes inside the circle at `N`, so
 *   it crosses it. Of the crossings ahead of `N`, the nearest along the road:
 *   `X`. On a straight, `X` is `w/2` to the side and `r` from `N`:
 *
 *       s = √(r² − (w/2)²)
 */
function roundJoinEnd(
  node: NodeId,
  at: Vec2,
  leg: Leg,
  side: number,
  radius: number,
): { point: Vec2; setback: number } | null {
  if (leg.halfWidth >= radius) {
    return { point: edgePointAt(at, leg, side, 0), setback: 0 };
  }

  const edge = edgeOf(at, leg, side);
  if (edge === null) {
    logBendsTooTightly(node, leg);
    return null;
  }

  const ahead = edgeCrossings(edge, {
    kind: "circle",
    circle: { center: at, radius },
  })
    .map((point) => ({ point, setback: setbackThrough(at, leg, point) }))
    .filter((crossing) => crossing.setback >= -SAME_POINT_METERS);
  if (ahead.length === 0) {
    console.error(
      `Node ${node}: the edge of section ${leg.section.id} meets the round ` +
        `join only behind it; not set back`,
    );
    return null;
  }

  const nearest = ahead.reduce((best, crossing) =>
    crossing.setback < best.setback ? crossing : best,
  );
  return { point: nearest.point, setback: Math.max(0, nearest.setback) };
}

/**
 * How far round from a leg's direction, toward its `side` (+1
 * counterclockwise, −1 clockwise), a point lies about the node. With `N` the
 * node, `d` the leg's direction, `σ` the side and `v = point − N`:
 *
 *     φ = atan2(σ·(d × v), d·v)
 */
function turnFrom(at: Vec2, leg: Leg, side: number, point: Vec2): number {
  const { direction } = leg;
  const vx = point.x - at.x;
  const vz = point.z - at.z;
  return Math.atan2(
    side * (direction.x * vz - direction.z * vx),
    direction.x * vx + direction.z * vz,
  );
}

/** Logs a leg whose inner edge doesn't exist: an arc too tight for its road. */
function logBendsTooTightly(node: NodeId, leg: Leg): void {
  console.error(
    `Node ${node}: section ${leg.section.id} bends too tightly for a ` +
      `${leg.section.profile.width} m road (radius ${leg.arc?.circle.radius.toFixed(2)} m); ` +
      `not set back`,
  );
}

/** Each section's setback: the longer of the two its gaps ask for. */
function longestSetbacks(
  legs: readonly Leg[],
  gaps: readonly Gap[],
): Map<SectionId, number> {
  const setbacks = new Map(legs.map((leg) => [leg.section.id, 0]));

  legs.forEach((first, index) => {
    const second = legs[(index + 1) % legs.length];
    const found = gaps[index].setbacks;
    for (const [leg, setback] of [
      [first, found.first],
      [second, found.second],
    ] as const) {
      const id = leg.section.id;
      setbacks.set(id, Math.max(setbacks.get(id) ?? 0, setback));
    }
  });

  return setbacks;
}

/**
 * A gap under a half turn: its corner point `P`, where the legs' edges on the
 * gap's side cross, and how far back that puts each of the two legs, in
 * meters — far enough that both roadways end through `P`. See
 * `docs/ideas/junction-polygon.md`, "Arcs".
 *
 * `first` and `second` are the legs either side of the gap, counterclockwise,
 * so the gap is on `first`'s counterclockwise side (`+1`) and on `second`'s
 * clockwise side (`−1`). Let `N` be the node and `ℓ` a leg's length.
 *
 * - the gap-side edges, taken whole: `edgeOf`
 * - candidates for `P`: where the two edges cross
 * - the setback a candidate gives each leg: `setbackThrough`
 * - `s < 0`: `P` is behind `N` on that leg. Down to `−SAME_POINT_METERS` it
 *   is rounding, and counts as 0.
 * - `P`: of the candidates ahead of `N` on both legs, the nearest to `N`
 * - none: the gap is too wide for a corner → joined round (`roundGap`)
 *   - with `d < r` the two half-widths and two straights, the wider road's
 *     setback through `P` is `(d + r·cos ψ)/sin ψ` → behind `N` for
 *
 *         ψ > arccos(−d/r)
 *
 *   - equal widths → only from a half turn, which `gapsAround` already joins
 *     round
 *
 * Where the network can't be drawn right, an error is logged and the gap
 * comes out `UNJOINED_GAP`:
 * - an arc too tight for its inner edge
 * - no candidate ahead of `N` on both legs, and a round join that would run
 *   backwards
 *
 * Not limited by `ℓ`: a section too short for its setbacks is the clearing
 * step's to refuse (`docs/intersections.md`, Clearance).
 */
function gapBetween(
  node: NodeId,
  at: Vec2,
  first: Leg,
  second: Leg,
  gap: number,
): Gap {
  const pair = `sections ${first.section.id} and ${second.section.id}`;

  const firstEdge = edgeOf(at, first, 1);
  const secondEdge = edgeOf(at, second, -1);
  for (const [leg, edge] of [
    [first, firstEdge],
    [second, secondEdge],
  ] as const) {
    if (edge === null) {
      logBendsTooTightly(node, leg);
    }
  }
  if (firstEdge === null || secondEdge === null) {
    return UNJOINED_GAP;
  }

  const candidates = edgeCrossings(firstEdge, secondEdge);
  const ahead = candidates
    .map((point) => ({
      point,
      first: setbackThrough(at, first, point),
      second: setbackThrough(at, second, point),
    }))
    .filter(
      (candidate) =>
        candidate.first >= -SAME_POINT_METERS &&
        candidate.second >= -SAME_POINT_METERS,
    );
  if (ahead.length === 0) {
    const round = roundGap(node, at, first, second, gap);
    if (round !== null) {
      return round;
    }
    console.error(
      candidates.length > 0
        ? `Node ${node}: the edges of ${pair} cross only behind it; not set back`
        : firstEdge.kind === "line" && secondEdge.kind === "line"
          ? `Node ${node}: ${pair} leave it in the same direction, so their ` +
            `edges never cross; not set back`
          : `Node ${node}: the edges of ${pair} never cross; not set back`,
    );
    return UNJOINED_GAP;
  }

  const nearest = ahead.reduce((best, candidate) =>
    distance(at, candidate.point) < distance(at, best.point) ? candidate : best,
  );
  return {
    join: { kind: "corner", point: nearest.point },
    setbacks: {
      first: Math.max(0, nearest.first),
      second: Math.max(0, nearest.second),
    },
    coversNode: true,
  };
}
