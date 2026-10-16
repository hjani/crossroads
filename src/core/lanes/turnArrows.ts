import {
  lineDirectionAt,
  lineFractionAt,
  nearestPointOnLine,
  trimLine,
} from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import { TURN_ARROW_GAP_METERS } from "../layout/markings";
import { CROSSING_DEPTH_METERS, type Roadway } from "../layout/roadway";
import type { Connection, TurnKind } from "./connection";
import type { Lane, LaneId } from "./lane";
import type { LaneGraph } from "./LaneGraph";

/** The ways a turn arrow points: any of them, never none. */
export interface Turns {
  readonly left: boolean;
  readonly straight: boolean;
  readonly right: boolean;
}

/**
 * A turn arrow in a lane at a junction end: where its tip is, which way it
 * points, and the turns it shows. See `docs/road-markings.md`, Turn arrows.
 */
export interface TurnArrow {
  readonly lane: LaneId;
  readonly tip: Vec2;
  /** Unit vector: the way its lane runs at the tip. */
  readonly heading: Vec2;
  /** The turns of the connections leaving its lane. */
  readonly turns: Turns;
}

/**
 * A roadway's turn arrows: one in each of its lanes running into an end that
 * has them (`Roadway.turnArrows`), showing the turns `laneGraph` has leaving
 * that lane. `laneGraph` must be of the same network version as `roadway`.
 *
 * `D` the crossing's depth, `g` the arrow's gap to it; at each such end:
 *
 * - `P`: the point on the roadway's centerline `D + g` back from the end
 *   (`trimLine`), measured where the crossing's depth is
 * - a lane is that centerline moved square to itself → its point nearest `P`
 *   lies straight across the road from it:
 *
 *       tip = nearestPointOnLine(lane, P)
 *
 * - the heading: the lane's direction at the tip
 * - → the tips of side-by-side lanes lie on one line square to the road, on
 *   arcs and biarcs too; `D + g` measured along each lane would stagger them,
 *   a lane `d` out on an arc of radius `R` being `(R ± d) / R` times as long
 */
export function turnArrowsOf(
  roadway: Roadway,
  laneGraph: LaneGraph,
): TurnArrow[] {
  const { section, from, to, centerlineGeometry } = roadway.outline;
  const lanes = laneGraph.lanesAlong(section);
  const back = CROSSING_DEPTH_METERS + TURN_ARROW_GAP_METERS;

  const arrows: TurnArrow[] = [];
  if (roadway.turnArrows.to) {
    // `+i` lanes run into `to`.
    const lanesIn = lanes.filter(({ id }) => id.index > 0);
    const P = trimLine(from, to, centerlineGeometry, 0, back).to;
    arrows.push(...arrowsAcross(P, lanesIn, laneGraph));
  }
  if (roadway.turnArrows.from) {
    // `−i` lanes run into `from`.
    const lanesIn = lanes.filter(({ id }) => id.index < 0);
    const P = trimLine(from, to, centerlineGeometry, back, 0).from;
    arrows.push(...arrowsAcross(P, lanesIn, laneGraph));
  }
  return arrows;
}

/**
 * An arrow in each of `lanes`, its tip straight across the road from `P`,
 * showing the turns `laneGraph` has leaving that lane.
 */
function arrowsAcross(
  P: Vec2,
  lanes: readonly Lane[],
  laneGraph: LaneGraph,
): TurnArrow[] {
  return lanes.map(({ id, centerline: { from, to, geometry } }) => {
    const tip = nearestPointOnLine(from, to, geometry, P);
    const t = lineFractionAt(from, to, geometry, tip);
    return {
      lane: id,
      tip,
      heading: lineDirectionAt(from, to, geometry, t),
      turns: turnsOf(laneGraph.connectionsLeaving(id)),
    };
  });
}

/**
 * The turns among `connections`. A junction has no U-turns, and leaves no
 * lane without a connection (`docs/lanes.md`) → never none.
 */
function turnsOf(connections: readonly Connection[]): Turns {
  const has = (turn: TurnKind) => connections.some((c) => c.turn === turn);
  return { left: has("left"), straight: has("straight"), right: has("right") };
}
