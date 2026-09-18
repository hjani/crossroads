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

/** One piece of a junction's outline: how it runs to `to` from the point before. */
export interface OutlinePiece {
  readonly to: Vec2;
  readonly outlineGeometry: LineGeometry;
}

/**
 * The gap after a leg, between it and the next leg counterclockwise, as the
 * junction rules read it.
 */
interface Gap {
  /**
   * Where the gap-side edges cross: both roadways end through it, and the
   * outline turns there. Null where the gap leaves its roads alone.
   */
  readonly cornerPoint: Vec2 | null;
  /** How far back it sets each of its two legs, in meters. */
  readonly setbacks: { readonly first: number; readonly second: number };
}

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
   * ring: the first piece runs from the last piece's `to`.
   *
   * Each leg contributes its two edge points — right then left, looking from
   * the node along it — with the cut across the road between them. Then the
   * gap after it:
   *
   * - reaching a corner point: back along this leg's edge to it, then out
   *   along the next leg's edge to that leg's right edge point
   * - no corner point: straight across to the next leg's right edge point
   *
   * A straight across a gap of a half turn or more is a stand-in. It cuts
   * through the node, where a round join belongs
   * (`docs/ideas/junction-polygon.md`, "Gap over 180°").
   *
   * Pieces of no length are left out, so a leg whose edge point already is
   * the corner point adds nothing. A ring can come out empty.
   */
  outline(): readonly OutlinePiece[] {
    const pieces: OutlinePiece[] = [];
    let previous = this.edgePointOf(this.legs[0], -1);
    const add = (to: Vec2, outlineGeometry: LineGeometry): void => {
      if (isSamePoint(previous, to)) {
        return;
      }
      pieces.push({ to, outlineGeometry });
      previous = to;
    };

    this.legs.forEach((leg, index) => {
      add(this.edgePointOf(leg, 1), STRAIGHT);

      const nextLeg = this.legs[(index + 1) % this.legs.length];
      const nextEdgePoint = this.edgePointOf(nextLeg, -1);
      const { cornerPoint } = this.gaps[index];
      if (cornerPoint === null) {
        add(nextEdgePoint, STRAIGHT);
        return;
      }
      add(
        cornerPoint,
        alongEdge(leg, 1, this.halfWidth, previous, cornerPoint),
      );
      add(
        nextEdgePoint,
        alongEdge(nextLeg, -1, this.halfWidth, cornerPoint, nextEdgePoint),
      );
    });

    return pieces;
  }

  /** Where a leg's roadway ends on its `side`, at the setback it ends up with. */
  private edgePointOf(leg: Leg, side: number): Vec2 {
    return edgePointAt(
      this.at,
      leg,
      side,
      this.halfWidth,
      this.setbackOf(leg.section.id),
    );
  }
}

/**
 * How close to a half turn a gap counts as one. Two roads in line are a half
 * turn apart only up to rounding, and their edges then cross far away on
 * either side, or nowhere. The setback such a gap would give is under
 * `(w/2)·tolerance/2`, far below anything visible.
 */
const HALF_TURN_TOLERANCE_RADIANS = 1e-9;

/** A gap that leaves its roads alone: a half turn or more, or no corner. */
const OPEN_GAP: Gap = { cornerPoint: null, setbacks: { first: 0, second: 0 } };

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
      ? OPEN_GAP
      : gapBetween(node, at, first, second, widthMeters);
  });
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
 * comes out `OPEN_GAP`:
 * - an arc too tight for its inner edge
 * - no candidates (parallel lines, circles that miss)
 * - no candidate ahead of `N` on both legs
 *
 * `s > ℓ/2`: the section is too short → `ℓ/2`, so its two setbacks never
 * overlap. `P` stands, so the outline still reaches it
 * (`docs/road-surface.md`, Limits).
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
    return OPEN_GAP;
  }

  const candidates = edgeCrossings(firstEdge, secondEdge);
  if (candidates.length === 0) {
    console.error(
      firstEdge.kind === "line" && secondEdge.kind === "line"
        ? `Node ${node}: ${pair} leave it in the same direction, so their ` +
            `edges never cross; not set back`
        : `Node ${node}: the edges of ${pair} never cross; not set back`,
    );
    return OPEN_GAP;
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
    return OPEN_GAP;
  }

  const nearest = ahead.reduce((best, candidate) =>
    distance(at, candidate.point) < distance(at, best.point) ? candidate : best,
  );
  return {
    cornerPoint: nearest.point,
    setbacks: {
      first: clampedToHalf(node, first, Math.max(0, nearest.first)),
      second: clampedToHalf(node, second, Math.max(0, nearest.second)),
    },
  };
}

/**
 * A leg's setback, but no more than half its length; logs an error where it
 * had to be cut.
 */
function clampedToHalf(node: NodeId, leg: Leg, setback: number): number {
  const half = leg.length / 2;
  if (setback <= half) {
    return setback;
  }
  console.error(
    `Node ${node}: section ${leg.section.id} is too short for its setback ` +
      `(${setback.toFixed(2)} m of ${leg.length.toFixed(2)} m); ` +
      `set back by half its length`,
  );
  return half;
}
