import { trimLine } from "../geometry/lineGeometry";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, RoadProfile, Section } from "../network/types";
import type { RoadwayOutline } from "./outline";

/**
 * How far a crossing reaches along the road from the roadway's end, in
 * meters. See `docs/road-markings.md`.
 */
export const CROSSING_DEPTH_METERS = 3;

/** How many sections must meet at a node for a crossing at their ends. */
const CROSSING_MIN_SECTIONS = 3;

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
    crossings: crossingsOf(network, section, length),
  };
}

/**
 * Which ends of a section's roadway have a crossing: those at a node where
 * at least 3 sections meet. None on a roadway too short for two.
 */
function crossingsOf(
  network: RoadNetwork,
  section: Section,
  length: number,
): Roadway["crossings"] {
  if (length < 2 * CROSSING_DEPTH_METERS) {
    return { from: false, to: false };
  }
  const crosses = (node: NodeId) =>
    network.sectionsAt(node).length >= CROSSING_MIN_SECTIONS;
  return { from: crosses(section.from), to: crosses(section.to) };
}
