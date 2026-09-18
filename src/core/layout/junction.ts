import { distance, SAME_POINT_METERS } from "../geometry/point";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, SectionId } from "../network/types";
import {
  edgeCrossings,
  edgeOf,
  legsAt,
  setbackThrough,
  type Leg,
} from "./junctionLeg";

/**
 * The junction at a node: where the roads meeting there stop being roadways.
 * See `docs/road-layout.md`.
 *
 * Worked out from the node and the sections meeting it alone, for roads
 * `widthMeters` wide:
 *
 * - each gap under a half turn sets both its roads back, as `gapSetbacks` says
 * - a road set back from both sides takes the longer setback
 */
export class Junction {
  private readonly setbacks: ReadonlyMap<SectionId, number>;

  constructor(
    network: RoadNetwork,
    readonly node: NodeId,
    widthMeters: number,
  ) {
    this.setbacks = setbacksAt(network, node, widthMeters);
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
}

/**
 * How close to a half turn a gap counts as one. Two roads in line are a half
 * turn apart only up to rounding, and their edges then cross far away on
 * either side, or nowhere. The setback such a gap would give is under
 * `(w/2)·tolerance/2`, far below anything visible.
 */
const HALF_TURN_TOLERANCE_RADIANS = 1e-9;

function setbacksAt(
  network: RoadNetwork,
  node: NodeId,
  widthMeters: number,
): Map<SectionId, number> {
  const legs = legsAt(network, node);
  const setbacks = new Map(legs.map((leg) => [leg.section.id, 0]));

  // The gap after each leg lies between it and the next leg round.
  legs.forEach((first, index) => {
    const second = legs[(index + 1) % legs.length];
    const gap =
      index + 1 < legs.length
        ? second.angle - first.angle
        : // The last gap wraps round, past the full turn, to the first leg.
          second.angle + 2 * Math.PI - first.angle;
    if (gap >= Math.PI - HALF_TURN_TOLERANCE_RADIANS) {
      return;
    }

    const found = gapSetbacks(network, node, first, second, widthMeters);
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
 * How far a gap under a half turn sets back each of its two legs, in meters:
 * far enough that both roadways end at `P`, where the legs' edges on the gap's
 * side cross. See `docs/ideas/junction-polygon.md`, "Arcs".
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
 * Where the network can't be drawn right, an error is logged and:
 * - an arc too tight for its inner edge → both 0
 * - no candidates (parallel lines, circles that miss) → both 0
 * - no candidate ahead of `N` on both legs → both 0
 * - `s > ℓ/2`: the section is too short → `ℓ/2`, so its two setbacks never
 *   overlap
 */
function gapSetbacks(
  network: RoadNetwork,
  node: NodeId,
  first: Leg,
  second: Leg,
  widthMeters: number,
): { first: number; second: number } {
  const none = { first: 0, second: 0 };
  const pair = `sections ${first.section.id} and ${second.section.id}`;
  const at = network.getNode(node).position;
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
    return none;
  }

  const candidates = edgeCrossings(firstEdge, secondEdge);
  if (candidates.length === 0) {
    console.error(
      firstEdge.kind === "line" && secondEdge.kind === "line"
        ? `Node ${node}: ${pair} leave it in the same direction, so their ` +
            `edges never cross; not set back`
        : `Node ${node}: the edges of ${pair} never cross; not set back`,
    );
    return none;
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
    return none;
  }

  const nearest = ahead.reduce((best, candidate) =>
    distance(at, candidate.point) < distance(at, best.point) ? candidate : best,
  );
  return {
    first: clampedToHalf(node, first, Math.max(0, nearest.first)),
    second: clampedToHalf(node, second, Math.max(0, nearest.second)),
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
