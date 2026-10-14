import { lineDirectionAt } from "../geometry/lineGeometry";
import { dot, type Vec2 } from "../geometry/point";
import type { SectionId } from "../network/types";
import type { Lane } from "./lane";
import { junctionPairs, spreadPairs } from "./lanePairs";

/** The widest turn still straight on, in radians (`docs/lanes.md`, Turn). */
export const STRAIGHT_ON_MAX_TURN_RADIANS = Math.PI / 6;

/**
 * How close two roads' turns have to be to tie for the straightest, in
 * radians (`docs/lanes.md`, Turn).
 *
 * A fork drawn as a mirror image comes out a hair apart rather than equal,
 * from rounding along the way; without this, one branch would be straight on
 * at random. Far below any angle a road is drawn at.
 */
export const STRAIGHT_ON_TIE_RADIANS = 1e-6;

/** Which way a connection turns. See `docs/lanes.md`, Turn. */
export type TurnKind = "straight" | "left" | "right" | "uTurn";

/**
 * Across a junction, from an incoming lane's exit to an outgoing lane's
 * entry. See `docs/lanes.md`, Connections.
 */
export interface Connection {
  /** Runs into the node; the connection starts at its exit. */
  readonly incoming: Lane;
  /** Runs out of the node; the connection ends at its entry. */
  readonly outgoing: Lane;
  readonly turn: TurnKind;
}

/** A road's lanes at the node running one way, and their heading there. */
interface RoadEnd {
  /** In lane order: lane `i` at `[i − 1]`. */
  readonly lanes: Lane[];
  /** Unit vector; the same for every lane of the road (`lanesOf`). */
  readonly heading: Vec2;
}

/**
 * The connections at one node, each with its turn. `incoming` are the lanes
 * running into the node, `outgoing` those running out of it.
 *
 * Which lanes, from each road A in (`docs/lanes.md`, Which lanes connect):
 *
 * - the roads A goes to: every other road; its own only at a dead end, where
 *   it is the only road
 * - just one → `spreadPairs`: a dead end's U-turns, or into the other of two
 *   roads
 * - more, a junction → `junctionPairs`, by the turn into each
 *
 * The turn, decided per road, since a road's lanes share their heading at
 * its end. `∠(u, v)` the signed angle from `u` to `v` (`turnAngle`); `h_A`
 * the exit heading of road A's lanes, `e_A` their entry heading;
 * `φ(A→B) = ∠(h_A, e_B)`.
 *
 * - A picks B: the least `|φ(A→B)|`, within `STRAIGHT_ON_MAX_TURN_RADIANS`,
 *   no other road within `STRAIGHT_ON_TIE_RADIANS` of it (`straightestFrom`)
 * - straight on: A picks B and B picks A
 * - at a road's end, its lanes in and out lie on one line: `h_A = −e_A` →
 *
 *       φ(B→A) = ∠(−e_B, −h_A) = ∠(e_B, h_A) = −φ(A→B)
 *
 *   → the limit holds both ways; only which road is least can differ, and a
 *   pick made one way only is a turn
 * - else B = A: U-turn
 * - else right if `φ > 0`, left if not
 */
export function connectionsBetween(
  incoming: readonly Lane[],
  outgoing: readonly Lane[],
): Connection[] {
  const into = roadEnds(incoming, 1);
  const outOf = roadEnds(outgoing, 0);
  const picks = new Map<SectionId, SectionId | null>();
  for (const [road, { heading }] of into) {
    picks.set(road, straightestFrom(heading, outOf));
  }

  const connections: Connection[] = [];
  for (const [a, aEnd] of into) {
    const targets = Array.from(outOf)
      .filter(([b]) => b !== a || outOf.size === 1)
      .map(([b, bEnd]) => ({
        end: bEnd,
        turn: turnKind(a, b, picks, turnAngle(aEnd.heading, bEnd.heading)),
      }));
    const n = aEnd.lanes.length;
    const pairs =
      targets.length === 1
        ? [spreadPairs(n, targets[0].end.lanes.length)]
        : junctionPairs(
            n,
            targets.map(({ end, turn }) => ({
              kind: turn,
              lanes: end.lanes.length,
            })),
          );

    targets.forEach(({ end, turn }, t) => {
      for (const [i, j] of pairs[t]) {
        connections.push({
          incoming: aEnd.lanes[i - 1],
          outgoing: end.lanes[j - 1],
          turn,
        });
      }
    });
  }
  return connections;
}

/**
 * The turn from road `a` into road `b`, `angle` being `φ(a→b)`; see
 * `connectionsBetween`.
 */
function turnKind(
  a: SectionId,
  b: SectionId,
  picks: ReadonlyMap<SectionId, SectionId | null>,
  angle: number,
): TurnKind {
  if (picks.get(a) === b && picks.get(b) === a) {
    return "straight";
  }
  if (a === b) {
    return "uTurn";
  }
  return angle > 0 ? "right" : "left";
}

/**
 * The road a lane exiting at `heading` picks among `outOf`
 * (`connectionsBetween`), or null: none within the limit, or two tied.
 */
function straightestFrom(
  heading: Vec2,
  outOf: ReadonlyMap<SectionId, RoadEnd>,
): SectionId | null {
  const ranked = Array.from(outOf, ([road, end]) => ({
    road,
    turn: Math.abs(turnAngle(heading, end.heading)),
  })).sort((p, q) => p.turn - q.turn);

  if (ranked.length === 0 || ranked[0].turn > STRAIGHT_ON_MAX_TURN_RADIANS) {
    return null;
  }
  if (
    ranked.length > 1 &&
    ranked[1].turn - ranked[0].turn <= STRAIGHT_ON_TIE_RADIANS
  ) {
    return null;
  }
  return ranked[0].road;
}

/**
 * How far a connection turns: the signed angle from heading `h` to heading
 * `e`, in radians, −π..π, positive to the right (`φ` in `docs/lanes.md`,
 * Turn).
 *
 * `θ` the angle from `h` to `e`, positive toward the right of `h`,
 * `r = (−h.z, h.x)` (as `offsetLine`):
 *
 * - `r ⊥ h`, `|r| = |h|`
 * - `h · e = |h|·|e|·cos θ`
 * - `r · e = h.x·e.z − h.z·e.x = |h|·|e|·sin θ`
 * - `atan2` takes the sine and cosine scaled alike:
 *
 *       φ = atan2(h.x·e.z − h.z·e.x, h · e)
 *
 * - → neither needs to be a unit vector
 */
function turnAngle(h: Vec2, e: Vec2): number {
  return Math.atan2(h.x * e.z - h.z * e.x, dot(h, e));
}

/**
 * `lanes` grouped by road, in the order first met, each road's lanes in lane
 * order whatever order they came in, with their heading a fraction `t` along
 * them: 1 at their exit, 0 at their entry.
 */
function roadEnds(lanes: readonly Lane[], t: number): Map<SectionId, RoadEnd> {
  const ends = new Map<SectionId, RoadEnd>();
  for (const lane of lanes) {
    const end = ends.get(lane.id.section);
    if (end !== undefined) {
      end.lanes.push(lane);
      continue;
    }
    const { from, to, geometry } = lane.centerline;
    ends.set(lane.id.section, {
      lanes: [lane],
      heading: lineDirectionAt(from, to, geometry, t),
    });
  }
  for (const { lanes } of ends.values()) {
    lanes.sort((p, q) => Math.abs(p.id.index) - Math.abs(q.id.index));
  }
  return ends;
}
