import { STRAIGHT, type LineGeometry } from "../geometry/lineGeometry";
import {
  distance,
  isSamePoint,
  SAME_POINT_METERS,
  type Vec2,
} from "../geometry/point";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, SectionId } from "../network/types";
import {
  alongEdge,
  edgeCrossings,
  edgeOf,
  edgePointAt,
  legsAt,
  setbackThrough,
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
}

/** How a junction's outline crosses a gap. */
type GapJoin =
  /**
   * Both roadways end through `point`, where the gap-side edges cross ahead
   * of the node, and the outline turns there.
   */
  | { readonly kind: "corner"; readonly point: Vec2 }
  /**
   * Round the circle about the node whose radius is the wider road's `w/2`,
   * from `leaving` on the first leg's edge through `via` to `entering` on
   * the second's (`roundGap`).
   */
  | {
      readonly kind: "round";
      readonly leaving: Vec2;
      readonly via: Vec2;
      readonly entering: Vec2;
    }
  /** Straight from one roadway's end to the next. */
  | { readonly kind: "straight" };

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
   * - `round`: back along this leg's edge to where it meets the circle about
   *   the node (`roundJoinEnd`), round that circle to where the next leg's
   *   edge meets it, then out along that edge
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
   * The farthest outline point from the node. Let `N` be the node, `X` a
   * piece's point:
   *
   *     R = max |NX|
   *
   * - straight piece: `|NX|` is convex along a segment → greatest at an end
   * - round join: on a circle about `N` → no farther than its ends
   * - arc along a leg's edge: farther inside than at its ends only if it
   *   runs past the far side of its circle → a setback over half that
   *   circle, not accounted for
   * - `R ≥ w/2`: each leg's cut is on the ring, its ends `√(s² + (w/2)²)`
   *   from `N`
   */
  private buildBoundingRadius(): number {
    return Math.max(
      ...this.junctionOutline.pieces.map((piece) =>
        distance(this.at, piece.point),
      ),
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
          const { leaving, via, entering } = join;
          add(leaving, alongEdge(leg, 1, previous, leaving), "curb");
          add(entering, { kind: "arc", via }, "curb");
          add(
            nextEdgePoint,
            alongEdge(nextLeg, -1, entering, nextEdgePoint),
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
 * A gap joined round (`docs/road-layout.md`, Junction): along the circle
 * about the node whose radius `r` is the wider road's `w/2`, between the two
 * ends `roundJoinEnd` finds. Null where that arc would run backwards — a gap
 * only a corner can join.
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
 * What follows:
 *
 * - equal widths: both ends touch the circle square to their roads →
 *   `φ₁ = φ₂ = π/2` → span `ψ − π`, and `m` is the gap's bisector
 *   (`docs/ideas/junction-polygon.md`, "Round"). `ψ = π`: no arc. `ψ = 2π`
 *   (a dead end): the half circle capping the road.
 * - no jump from a corner: a gap turns from corner to round where `P`
 *   reaches `N` on the wider road. `P` is then that road's edge point at no
 *   setback, which lies on the circle → it is where the narrower road's edge
 *   crosses the circle, `X` → both joins end that road through one point.
 */
function roundGap(
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
  return {
    join: {
      kind: "round",
      leaving: leaving.point,
      via: {
        x: at.x + radius * Math.cos(middle),
        z: at.z + radius * Math.sin(middle),
      },
      entering: entering.point,
    },
    setbacks: { first: leaving.setback, second: entering.setback },
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
      `${leg.section.width} m road (radius ${leg.arc?.circle.radius.toFixed(2)} m); ` +
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
  };
}
