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
import type { JunctionOutline, OutlinePiece } from "./outline";

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
   * Under a half turn: both roadways end through `point`, where the gap-side
   * edges cross, and the outline turns there.
   */
  | { readonly kind: "corner"; readonly point: Vec2 }
  /**
   * A half turn or more: round the circle of radius `w/2` about the node,
   * through `via`.
   */
  | { readonly kind: "round"; readonly via: Vec2 }
  /** Straight from one roadway's end to the next. */
  | { readonly kind: "straight" };

/**
 * The junction at a node: where the roads meeting there stop being roadways,
 * and the area left between them. See `docs/road-layout.md`.
 *
 * Worked out from the node and the sections meeting it alone, for roads
 * `widthMeters` wide:
 *
 * - each gap under a half turn sets both its roads back, as `gapBetween` says
 * - a road set back from both sides takes the longer setback
 */
export class Junction {
  private readonly at: Vec2;
  private readonly halfWidth: number;
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
    widthMeters: number,
  ) {
    this.at = network.getNode(node).position;
    this.halfWidth = widthMeters / 2;
    this.legs = legsAt(network, node);
    this.gaps = gapsAround(node, this.at, this.legs, widthMeters);
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
   * - `round`: back along this leg's edge to where it touches the circle
   *   about the node (`touchPointOf`), round that circle to where the next
   *   leg's edge touches it, then out along that edge
   * - `straight`: straight across to the next leg's right edge point
   *
   * Pieces of no length are left out, so a leg whose edge point already is
   * the corner point adds nothing, and a round join over a gap of exactly a
   * half turn adds no arc. A ring can come out empty.
   */
  outline(): JunctionOutline {
    return this.junctionOutline;
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
   * - round join: on the circle of radius `w/2` about `N` → no farther than
   *   its ends
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
    const add = (point: Vec2, incomingGeometry: LineGeometry): void => {
      if (isSamePoint(previous, point)) {
        return;
      }
      pieces.push({ point, incomingGeometry });
      previous = point;
    };

    this.legs.forEach((leg, index) => {
      add(this.edgePointOf(leg, 1), STRAIGHT);

      const nextLeg = this.legs[(index + 1) % this.legs.length];
      const nextEdgePoint = this.edgePointOf(nextLeg, -1);
      const { join } = this.gaps[index];
      switch (join.kind) {
        case "straight":
          add(nextEdgePoint, STRAIGHT);
          break;

        case "corner":
          add(
            join.point,
            alongEdge(leg, 1, this.halfWidth, previous, join.point),
          );
          add(
            nextEdgePoint,
            alongEdge(nextLeg, -1, this.halfWidth, join.point, nextEdgePoint),
          );
          break;

        case "round": {
          const leaving = this.touchPointOf(leg, 1);
          const entering = this.touchPointOf(nextLeg, -1);
          add(leaving, alongEdge(leg, 1, this.halfWidth, previous, leaving));
          add(entering, { kind: "arc", via: join.via });
          add(
            nextEdgePoint,
            alongEdge(nextLeg, -1, this.halfWidth, entering, nextEdgePoint),
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
    return edgePointAt(
      this.at,
      leg,
      side,
      this.halfWidth,
      this.setbackOf(leg.section.id),
    );
  }

  /**
   * Where a leg's `side` edge (+1 counterclockwise, −1 clockwise) touches the
   * circle of radius `w/2` about the node — where a round join leaves the
   * edge for the circle (`docs/ideas/junction-polygon.md`, "The touching
   * point `T`").
   *
   * It is the leg's edge point with no setback. Let `N` be the node, `σ` the
   * side, `d` the leg's direction, and for an arc `O` its center, `R` its
   * radius and `τ` the way it turns:
   *
   * - straight: `edgePointAt` at 0 is
   *
   *       N + σ·(w/2)·(−d.z, d.x)
   *
   * - arc: `edgePointAt` at 0 is `N − στ·(w/2)·û`, with
   *   `û = unitDirection(O, N)`. The center lies square to `d` on the side
   *   the arc turns to, `O = N + τ·R·(−d.z, d.x)`, so `û = −τ·(−d.z, d.x)`
   *   and, with `τ² = 1`, the point comes out the same:
   *
   *       N + σ·(w/2)·(−d.z, d.x)
   *
   * - → `w/2` from `N`, square to the road, whether the leg bends or not.
   */
  private touchPointOf(leg: Leg, side: number): Vec2 {
    return edgePointAt(this.at, leg, side, this.halfWidth, 0);
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
function gapsAround(
  node: NodeId,
  at: Vec2,
  legs: readonly Leg[],
  widthMeters: number,
): Gap[] {
  return legs.map((first, index) => {
    const second = legs[(index + 1) % legs.length];
    const gap =
      index + 1 < legs.length
        ? second.angle - first.angle
        : // The last gap wraps round, past the full turn, to the first leg.
          second.angle + 2 * Math.PI - first.angle;

    return gap >= Math.PI - HALF_TURN_TOLERANCE_RADIANS
      ? {
          join: roundJoin(at, first.angle + gap / 2, widthMeters / 2),
          setbacks: { first: 0, second: 0 },
        }
      : gapBetween(node, at, first, second, widthMeters);
  });
}

/**
 * The outline across a gap of a half turn or more: along the circle of radius
 * `w/2` about the node, between the points where the two gap-side edges touch
 * it (`touchPointOf`). See `docs/ideas/junction-polygon.md`, "Round".
 *
 * Let `N` be the node, `α₁` and `α₂` the two legs' angles, and `ψ = α₂ − α₁`
 * the gap. The touching points are square to their legs, on the gap's side,
 * so they lie at `α₁ + π/2` and `α₂ − π/2` about `N`:
 *
 * - the arc between them spans `ψ − π` → at most a half turn, which a `via`
 *   between the ends can still express
 * - halfway along it is the gap's own bisector, `m = (α₁ + α₂)/2 = α₁ + ψ/2`:
 *
 *       via = N + (w/2)·(cos m, sin m)
 *
 * `ψ = π`: the two touching points are the same point, and the arc drops out
 * as having no length. `ψ = 2π` (a dead end): `m` points straight back from
 * the one leg, and the join is the half circle that caps the road.
 */
function roundJoin(at: Vec2, bisector: number, halfWidth: number): GapJoin {
  return {
    kind: "round",
    via: {
      x: at.x + halfWidth * Math.cos(bisector),
      z: at.z + halfWidth * Math.sin(bisector),
    },
  };
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
 *
 * Where the network can't be drawn right, an error is logged and the gap
 * comes out `UNJOINED_GAP`:
 * - an arc too tight for its inner edge
 * - no candidates (parallel lines, circles that miss)
 * - no candidate ahead of `N` on both legs
 *
 * Not limited by `ℓ`: a section too short for its setbacks is the clearing
 * step's to refuse (`docs/intersections.md`, Clearance).
 */
function gapBetween(
  node: NodeId,
  at: Vec2,
  first: Leg,
  second: Leg,
  widthMeters: number,
): Gap {
  const pair = `sections ${first.section.id} and ${second.section.id}`;
  const halfWidth = widthMeters / 2;

  const firstEdge = edgeOf(at, first, 1, halfWidth);
  const secondEdge = edgeOf(at, second, -1, halfWidth);
  for (const [leg, edge] of [
    [first, firstEdge],
    [second, secondEdge],
  ] as const) {
    if (edge === null) {
      console.error(
        `Node ${node}: section ${leg.section.id} bends too tightly for a ` +
          `${widthMeters} m road (radius ${leg.arc?.circle.radius.toFixed(2)} m); ` +
          `not set back`,
      );
    }
  }
  if (firstEdge === null || secondEdge === null) {
    return UNJOINED_GAP;
  }

  const candidates = edgeCrossings(firstEdge, secondEdge);
  if (candidates.length === 0) {
    console.error(
      firstEdge.kind === "line" && secondEdge.kind === "line"
        ? `Node ${node}: ${pair} leave it in the same direction, so their ` +
            `edges never cross; not set back`
        : `Node ${node}: the edges of ${pair} never cross; not set back`,
    );
    return UNJOINED_GAP;
  }

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
    console.error(
      `Node ${node}: the edges of ${pair} cross only behind it; not set back`,
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
