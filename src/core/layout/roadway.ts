import { trimLine } from "../geometry/lineGeometry";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, RoadProfile, Section } from "../network/types";
import { TURN_ARROW_GAP_METERS, TURN_ARROW_LENGTH_METERS } from "./markings";
import type { RoadwayOutline } from "./outline";

/**
 * How far a crossing reaches along the road from the roadway's end, in
 * meters. See `docs/road-markings.md`.
 */
export const CROSSING_DEPTH_METERS = 3;

/**
 * How many sections must meet at a node for their roadways' ends there to be
 * junction ends (`docs/road-markings.md`, Junction ends).
 */
const JUNCTION_MIN_SECTIONS = 3;

/** The shortest roadway with crossings, in meters: room for one at each end. */
const CROSSINGS_MIN_LENGTH_METERS = 2 * CROSSING_DEPTH_METERS;

/**
 * The shortest roadway with turn arrows, in meters: room for both crossings
 * and the arrows at both ends. The two ends' arrows lie side by side, in
 * opposite lanes → one arrow's length, with a gap at each end of it.
 */
const TURN_ARROWS_MIN_LENGTH_METERS =
  2 * CROSSING_DEPTH_METERS +
  2 * TURN_ARROW_GAP_METERS +
  TURN_ARROW_LENGTH_METERS;

/**
 * A section between the setbacks at its two ends: a shorter section of the
 * same kind. See `docs/road-layout.md`.
 */
export interface Roadway {
  /** Along the centerline, end to end, in meters. */
  readonly length: number;
  /** The ground it covers: its centerline, and the width of the road. */
  readonly outline: RoadwayOutline;
  /** Its section's. */
  readonly profile: RoadProfile;
  /** Which of its ends has a crossing. */
  readonly crossings: { readonly from: boolean; readonly to: boolean };
  /** Which of its ends has turn arrows. */
  readonly turnArrows: { readonly from: boolean; readonly to: boolean };
}

/**
 * The roadway along a section, given how far
 * back the junctions at its two ends set it — `s₁` at `from` and `s₂` at
 * `to`, in meters along the centerline (`Junction.setbackOf`).
 *
 * - the outline is the section's centerline with the setbacks cut away
 *   (`trimLine`): a shorter line of the same kind
 * - a setback is measured along the centerline, whatever shape it takes, so
 *   the length is what is left of the section either way:
 *
 *       length = L − s₁ − s₂
 *
 * - `s₁ + s₂ > L` → negative, and the outline runs backwards. Only a
 *   network the clearing step refuses gets there.
 */
export function roadwayOf(
  network: RoadNetwork,
  section: Section,
  setbacks: { readonly from: number; readonly to: number },
): Roadway {
  const { from: s1, to: s2 } = setbacks;
  const length = section.length - s1 - s2;
  const centerline = trimLine(
    network.getNode(section.from).position,
    network.getNode(section.to).position,
    section.centerlineGeometry,
    s1,
    s2,
  );
  return {
    length,
    outline: {
      kind: "roadway",
      section: section.id,
      from: centerline.from,
      to: centerline.to,
      centerlineGeometry: centerline.geometry,
      widthMeters: section.profile.width,
    },
    profile: section.profile,
    crossings: junctionEndsWithRoom(
      network,
      section,
      length,
      CROSSINGS_MIN_LENGTH_METERS,
    ),
    turnArrows: junctionEndsWithRoom(
      network,
      section,
      length,
      TURN_ARROWS_MIN_LENGTH_METERS,
    ),
  };
}

/**
 * Which ends of a section's roadway are junction ends, those at a node where
 * at least 3 sections meet — if the roadway is at least `minLength` long, in
 * meters. None if it is shorter.
 */
function junctionEndsWithRoom(
  network: RoadNetwork,
  section: Section,
  length: number,
  minLength: number,
): { readonly from: boolean; readonly to: boolean } {
  if (length < minLength) {
    return { from: false, to: false };
  }
  const isJunctionEnd = (node: NodeId) =>
    network.sectionsAt(node).length >= JUNCTION_MIN_SECTIONS;
  return { from: isJunctionEnd(section.from), to: isJunctionEnd(section.to) };
}
