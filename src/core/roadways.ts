import { Junction } from "./junctions";
import { unitDirection } from "./points";
import type { RoadNetwork } from "./RoadNetwork";
import type { Section, SectionGeometry, Vec2 } from "./types";

/** How wide every road is, in meters — one width for the whole network. */
export const ROAD_WIDTH_METERS = 8;

/**
 * A section between the setbacks at its two ends: a shorter section of the
 * same kind. See `docs/road-layout.md`.
 */
export interface Roadway {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly geometry: SectionGeometry;
}

/**
 * The roadway along a section, for roads `widthMeters` wide.
 *
 * Straight, with `d = unitDirection(from, to)`, and `s₁`, `s₂` the setbacks at
 * `from` and `to`:
 *
 *     from + s₁·d  →  to − s₂·d
 *
 * - each setback is at most half the section → the ends never pass each other
 * - both clamped → a roadway of zero length, halfway along
 *
 * An arc is never set back, so its roadway is the whole section.
 */
export function roadwayOf(
  network: RoadNetwork,
  section: Section,
  widthMeters: number,
): Roadway {
  const from = network.getNode(section.from).position;
  const to = network.getNode(section.to).position;
  if (section.geometry.kind === "arc") {
    return { from, to, geometry: section.geometry };
  }

  const d = unitDirection(from, to);
  const s1 = new Junction(network, section.from, widthMeters).setbackOf(
    section.id,
  );
  const s2 = new Junction(network, section.to, widthMeters).setbackOf(
    section.id,
  );
  return {
    from: { x: from.x + s1 * d.x, z: from.z + s1 * d.z },
    to: { x: to.x - s2 * d.x, z: to.z - s2 * d.z },
    geometry: section.geometry,
  };
}
