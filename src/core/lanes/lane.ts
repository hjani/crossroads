import { offsetLine, reverseLine, type Line } from "../geometry/lineGeometry";
import type { Roadway } from "../layout/roadway";
import type { SectionId } from "../network/types";

/**
 * How wide every lane is, in meters: `v` in `docs/lanes.md`. The lane marks
 * draw their dividers by it.
 */
export const LANE_WIDTH_METERS = 3;

/** Which lane: `(section, ±i)`. See `docs/lanes.md`, Identity. */
export interface LaneId {
  readonly section: SectionId;
  /**
   * `±i`, counted from 1 out from the centerline: `+i` runs `from → to`,
   * `−i` runs `to → from`.
   */
  readonly index: number;
}

/** Where cars drive along a roadway, one way. See `docs/lanes.md`. */
export interface Lane {
  readonly id: LaneId;
  /** Its middle, the way cars drive it: `from` its entry, `to` its exit. */
  readonly centerline: Line;
}

/**
 * The lanes along a roadway: `+1…+n`, then `−1…−n`, `n` its profile's lanes
 * each way.
 *
 * Right-hand traffic → each lane right of the way it runs, `(i − ½)·v` from
 * the roadway's centerline (`offsetLine`):
 *
 * - `+i`: the centerline, moved `(i − ½)·v` to its right
 * - `−i`: the centerline reversed, moved the same → left of `from → to`
 * - moved square to the centerline → its ends on the roadway's ends
 *
 * Throws where a lane would pass its arc's center: clearance refuses an arc
 * with no inner edge (`docs/intersections.md`), and every lane lies inside
 * the road.
 */
export function lanesOf(roadway: Roadway): Lane[] {
  const { section, from, to, centerlineGeometry } = roadway.outline;
  const ways = [
    { sign: 1, line: { from, to, geometry: centerlineGeometry } },
    { sign: -1, line: reverseLine(from, to, centerlineGeometry) },
  ];

  const lanes: Lane[] = [];
  for (const { sign, line } of ways) {
    for (let i = 1; i <= roadway.profile.lanesPerDirection; i++) {
      lanes.push(laneOf(section, sign * i, line));
    }
  }
  return lanes;
}

/**
 * Lane `index` of a section: `line`, its centerline the way the lane runs,
 * moved `(|index| − ½)·v` to its right.
 */
function laneOf(section: SectionId, index: number, line: Line): Lane {
  const centerline = offsetLine(
    line.from,
    line.to,
    line.geometry,
    (Math.abs(index) - 0.5) * LANE_WIDTH_METERS,
  );
  if (centerline === null) {
    throw new Error(
      `Lane ${index} of section ${section} would pass its arc's center`,
    );
  }
  return { id: { section, index }, centerline };
}
