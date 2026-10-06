import { pointOnArc } from "../geometry/arc";
import { unitDirection, type Vec2 } from "../geometry/point";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { LineGeometry } from "../geometry/lineGeometry";
import type { NodeId, Section } from "../network/types";
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
  /** Which of its ends has a crossing. */
  readonly crossings: { readonly from: boolean; readonly to: boolean };
}

/**
 * The roadway along a section, given how far
 * back the junctions at its two ends set it — `s₁` at `from` and `s₂` at
 * `to`, in meters along the centerline (`Junction.setbackOf`).
 *
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
  return {
    length,
    outline: {
      kind: "roadway",
      section: section.id,
      ...applySetbacks(network, section, s1, s2),
      widthMeters: section.profile.width,
    },
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

/**
 * A section's ends and shape with its two setbacks cut away: a shorter line
 * of the same kind.
 *
 * Straight, with `d = unitDirection(from, to)`:
 *
 *     from + s₁·d  →  to − s₂·d
 *
 * Arc, with `L = section.length` and `p(t)` = `pointOnArc` — a fraction of
 * the length is the same fraction of the angle, so the setbacks are
 * fractions `t₁ = s₁/L` and `t₂ = 1 − s₂/L`:
 *
 *     p(t₁)  →  p(t₂),  via p((t₁ + t₂)/2)
 *
 * - a new `via`: the old one can lie on the part cut away, and the arc
 *   through it would then run the other way round the circle
 */
function applySetbacks(
  network: RoadNetwork,
  section: Section,
  s1: number,
  s2: number,
): { from: Vec2; to: Vec2; centerlineGeometry: LineGeometry } {
  const from = network.getNode(section.from).position;
  const to = network.getNode(section.to).position;

  if (section.centerlineGeometry.kind === "arc") {
    const { via } = section.centerlineGeometry;
    const t1 = s1 / section.length;
    const t2 = 1 - s2 / section.length;
    return {
      from: pointOnArc(from, to, via, t1),
      to: pointOnArc(from, to, via, t2),
      centerlineGeometry: {
        kind: "arc",
        via: pointOnArc(from, to, via, (t1 + t2) / 2),
      },
    };
  }

  const d = unitDirection(from, to);
  return {
    from: { x: from.x + s1 * d.x, z: from.z + s1 * d.z },
    to: { x: to.x - s2 * d.x, z: to.z - s2 * d.z },
    centerlineGeometry: section.centerlineGeometry,
  };
}
